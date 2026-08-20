import type { Goal } from '@prisma/client';
import { type DayString } from '../domain/dates.js';
import {
  averageScore,
  computeStreak,
  dailyScore,
  goalProgress,
  rankLeaderboard,
  type LeaderboardEntry,
} from '../domain/scoring.js';
import type { LeaderboardMode } from '../domain/enums.js';
import { forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { buildScoreInput, ensureOccurrences, goalToday } from './occurrences.js';

/**
 * Privacy gate. Every goal-scoped read and write goes through this, so a private
 * goal is unreachable by direct URL, not merely hidden in the UI.
 *
 * A PUBLIC goal is readable by anyone (that is what Discover is for), but only a
 * participant may see per-participant detail, and only the owner may edit it.
 */
export async function loadGoalForUser(
  goalId: string,
  userId: string,
  need: 'read' | 'participate' | 'own' = 'read',
) {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      participants: { include: { user: { include: { profile: true } } } },
      owner: { include: { profile: true } },
      _count: { select: { participants: true } },
    },
  });
  if (!goal) throw notFound('Goal not found');

  const participant = goal.participants.find((p) => p.userId === userId && p.status === 'ACTIVE');
  const isOwner = goal.ownerId === userId;

  if (need === 'own' && !isOwner) throw forbidden('Only the goal owner can do that');
  if (need === 'participate' && !participant) throw forbidden('You are not part of this goal');

  if (need === 'read' && !participant && !isOwner && goal.visibility !== 'PUBLIC') {
    // Deliberately a 404: a private goal should not even confirm it exists.
    throw notFound('Goal not found');
  }

  return { goal, participant: participant ?? null, isOwner };
}

export type GoalWithParticipants = Awaited<ReturnType<typeof loadGoalForUser>>['goal'];

/** Progress + streak for one participant of a goal. */
export async function participantSummary(
  goal: Pick<Goal, 'id' | 'startDate' | 'deadline' | 'timezone'>,
  participant: { id: string; joinedOn: string; leftOn: string | null },
  today: DayString,
) {
  const input = await buildScoreInput(goal, participant, today);
  return {
    progress: goalProgress(input, today),
    streak: computeStreak(input, today),
    today: dailyScore(input, today),
    average: averageScore(input, today),
  };
}

/**
 * Build a leaderboard for a goal.
 *
 * DAILY answers "who is doing best today" using only the current challenge day.
 * AVERAGE answers "who has been most consistent" using only finished days, so a
 * participant with an evening task is never marked down at 09:00.
 */
export async function buildLeaderboard(
  goalId: string,
  mode: LeaderboardMode,
  now = new Date(),
): Promise<{ today: DayString; mode: LeaderboardMode; entries: LeaderboardEntry[] }> {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      participants: {
        where: { status: 'ACTIVE' },
        include: { user: { include: { profile: true } } },
      },
      tasks: { where: { archivedAt: null } },
    },
  });
  if (!goal) throw notFound('Goal not found');

  await ensureOccurrences(goalId, undefined, now);
  const today = goalToday(goal, now);

  const rows = await Promise.all(
    goal.participants.map(async (participant) => {
      const input = await buildScoreInput(goal, participant, today, goal.tasks);
      const day = dailyScore(input, today);
      const avg = averageScore(input, today);
      const streak = computeStreak(input, today);
      const progress = goalProgress(input, today);

      return {
        participantId: participant.id,
        userId: participant.userId,
        name: participant.user.name,
        avatarEmoji: participant.user.profile?.avatarEmoji ?? '🐱',
        percent: mode === 'daily' ? day.percent : avg.percent,
        completed: day.completed,
        required: day.required,
        currentStreak: streak.current,
        totalCompleted: progress.completedOccurrences,
      };
    }),
  );

  return { today, mode, entries: rankLeaderboard(rows) };
}
