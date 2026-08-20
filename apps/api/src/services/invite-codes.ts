import { randomInt } from 'node:crypto';
import { prisma } from '../lib/prisma.js';

/**
 * Shareable join codes.
 *
 * A code lets ANYONE holding it join the goal — not just friends, and even when
 * the goal is PRIVATE. That is deliberate: the owner is handing the link out on
 * purpose (WhatsApp, Facebook, wherever). To keep that safe:
 *
 *   - only the owner can create, rotate or revoke a code
 *   - a revoked code stops working immediately
 *   - rotating replaces the old code, so a leaked link can be killed
 *   - the unauthenticated preview exposes only what a share card needs
 *
 * The alphabet omits 0/O/1/I/L so a code can be read aloud or retyped without
 * ambiguity.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Generate a fresh code, retrying on the (vanishingly unlikely) collision. */
export async function issueInviteCode(goalId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    const clash = await prisma.goal.findUnique({ where: { inviteCode: code } });
    if (clash) continue;
    await prisma.goal.update({
      where: { id: goalId },
      data: { inviteCode: code, inviteCodeCreated: new Date() },
    });
    return code;
  }
  throw new Error('Could not allocate an invite code');
}

export async function revokeInviteCode(goalId: string): Promise<void> {
  await prisma.goal.update({
    where: { id: goalId },
    data: { inviteCode: null, inviteCodeCreated: null },
  });
}

/** Codes are stored uppercase; accept whatever casing or spacing the user pasted. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function findGoalByCode(rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) return null;
  return prisma.goal.findUnique({
    where: { inviteCode: code },
    include: {
      owner: { include: { profile: true } },
      _count: { select: { participants: true, tasks: true } },
    },
  });
}
