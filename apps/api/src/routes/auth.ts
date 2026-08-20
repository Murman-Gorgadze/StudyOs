import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isValidTimezone, todayIn } from '../domain/dates.js';
import {
  SESSION_COOKIE,
  consumePasswordResetToken,
  createPasswordResetToken,
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from '../lib/auth.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { levelProgress } from '../services/engagement.js';

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Please enter your name').max(60),
    email: z.string().trim().toLowerCase().email('Please enter a valid email'),
    password: passwordRule,
    confirmPassword: z.string(),
    timezone: z.string().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email'),
  password: z.string().min(1, 'Please enter your password'),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60,
} as const;

/**
 * Shape a user for the client.
 *
 * `viewerId` must equal `userId` to receive private fields. Email address,
 * timezone and notification preferences belong to the account owner alone and
 * are never handed to another user looking at a profile.
 */
export async function publicUser(userId: string, viewerId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) return null;

  const coins = user.profile?.totalCoins ?? 0;
  const isSelf = viewerId === undefined || viewerId === userId;

  const base = {
    id: user.id,
    name: user.name,
    avatarEmoji: user.profile?.avatarEmoji ?? '🐱',
    bio: user.profile?.bio ?? '',
    totalCoins: coins,
    bestStreak: user.profile?.bestStreak ?? 0,
    ...levelProgress(coins),
  };

  if (!isSelf) return base;

  return {
    ...base,
    email: user.email,
    timezone: user.profile?.timezone ?? 'UTC',
    notifications: {
      taskReminders: user.profile?.notifyTaskReminders ?? true,
      friendActivity: user.profile?.notifyFriendActivity ?? true,
      leaderboardUpdates: user.profile?.notifyLeaderboardUpdate ?? true,
      achievements: user.profile?.notifyAchievements ?? true,
    },
  };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const timezone = body.timezone && isValidTimezone(body.timezone) ? body.timezone : 'UTC';

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict('An account with that email already exists', 'EMAIL_TAKEN');

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
        profile: { create: { timezone } },
      },
    });

    const token = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
    return { user: await publicUser(user.id), today: todayIn(timezone) };
  });

  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Same message either way, so the endpoint cannot be used to enumerate accounts.
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw unauthorized('Email or password is incorrect');
    }

    const token = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
    return { user: await publicUser(user.id) };
  });

  app.post('/auth/logout', async (req, reply) => {
    await destroySession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (req) => {
    if (!req.user) return { user: null };
    return { user: await publicUser(req.user.id) };
  });

  /**
   * Password reset, Phase 1 scope: no email provider is wired up, so in
   * development the token is returned to the caller instead of being mailed.
   * The token is single-use, expires in an hour and is NOT a session — holding
   * it does not sign you in. Adding a mailer later changes only delivery.
   */
  app.post('/auth/forgot-password', async (req) => {
    const { email } = z
      .object({ email: z.string().trim().toLowerCase().email() })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Always the same response, so this cannot confirm whether an account exists.
    if (!user) return { ok: true };

    const token = await createPasswordResetToken(user.id);
    return process.env.NODE_ENV === 'production' ? { ok: true } : { ok: true, devToken: token };
  });

  app.post('/auth/reset-password', async (req, reply) => {
    const { token, password } = z
      .object({ token: z.string().min(1), password: passwordRule })
      .parse(req.body);

    const userId = await consumePasswordResetToken(token);
    if (!userId) throw badRequest('That reset link is invalid or has expired', 'BAD_TOKEN');

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(password) },
    });
    // Every existing session is invalidated on a password change.
    await prisma.session.deleteMany({ where: { userId } });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
