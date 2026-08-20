import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { SESSION_COOKIE, resolveSession } from './lib/auth.js';
import { HttpError, unauthorized } from './lib/errors.js';
import { prisma } from './lib/prisma.js';
import authRoutes from './routes/auth.js';
import goalRoutes from './routes/goals.js';
import taskRoutes from './routes/tasks.js';
import socialRoutes from './routes/social.js';
import miscRoutes from './routes/misc.js';
import copilotRoutes from './routes/copilot.js';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthedUser | null;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  await app.register(cors, {
    origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });
  await app.register(cookie);

  // Several endpoints take no body. Fastify's default JSON parser rejects an
  // empty body outright when the client still sends application/json, which is
  // what most HTTP clients do by default — so treat empty as {}.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body: string | Buffer, done) => {
      const text = typeof body === 'string' ? body : body.toString('utf8');
      if (!text || text.trim() === '') return done(null, {});
      try {
        done(null, JSON.parse(text));
      } catch {
        const err = Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
        done(err);
      }
    },
  );

  // Resolve the session on every request; routes opt in to requiring it.
  app.decorateRequest('user', null);
  app.addHook('preHandler', async (req) => {
    const session = await resolveSession(req.cookies[SESSION_COOKIE]);
    req.user = session ? { id: session.user.id, email: session.user.email, name: session.user.name } : null;
  });

  app.decorate('requireAuth', async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized();
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.message, code: error.code });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Please check the highlighted fields',
        code: 'VALIDATION',
        fields: error.flatten().fieldErrors,
      });
    }
    const fastifyError = error as { statusCode?: number; message?: string };
    if (fastifyError.statusCode === 400) {
      return reply
        .status(400)
        .send({ error: fastifyError.message ?? 'Bad request', code: 'BAD_REQUEST' });
    }
    req.log.error(error);
    return reply.status(500).send({ error: 'Something went wrong', code: 'INTERNAL' });
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(goalRoutes, { prefix: '/api' });
  await app.register(taskRoutes, { prefix: '/api' });
  await app.register(socialRoutes, { prefix: '/api' });
  await app.register(miscRoutes, { prefix: '/api' });
  await app.register(copilotRoutes, { prefix: '/api' });

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMain) {
  const app = await buildServer();
  const port = Number(process.env.PORT ?? 4000);
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
