import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isDayString } from '../domain/dates.js';
import { validateRecurrence, type RecurrenceConfig } from '../domain/recurrence.js';
import { availableTasksOn, computeStreak, dailyScore } from '../domain/scoring.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { evaluateAchievements, grantReward, notify, revertRewardFor } from '../services/engagement.js';
import { loadGoalForUser } from '../services/goals.js';
import { buildScoreInput, ensureOccurrences, goalToday } from '../services/occurrences.js';

export default async function taskRoutes(app: FastifyInstance) {
  /**
   * Everything the Home screen needs to answer "what should I do today?".
   * Grouped by goal, because that is how the dashboard presents it.
   */
  app.get('/today', { preHandler: app.requireAuth }, async (req) => {
    const userId = req.user!.id;

    const participations = await prisma.goalParticipant.findMany({
      where: { userId, status: 'ACTIVE', goal: { status: 'ACTIVE' } },
      include: { goal: true },
    });

    let totalRequired = 0;
    let totalCompleted = 0;
    let coinsToday = 0;
    let bestStreak = 0;

    const groups = await Promise.all(
      participations.map(async ({ goal, ...participant }) => {
        await ensureOccurrences(goal.id, [participant.id]);
        const today = goalToday(goal);

        const tasks = await prisma.taskDefinition.findMany({
          where: { goalId: goal.id, archivedAt: null },
        });
        const input = await buildScoreInput(goal, participant, today, tasks);

        const availableIds = new Set(availableTasksOn(input, today));
        const occurrences = await prisma.taskOccurrence.findMany({
          where: { participantId: participant.id, dueDate: today },
          include: { taskDefinition: true },
        });

        const score = dailyScore(input, today);
        const streak = computeStreak(input, today);
        totalRequired += score.required;
        totalCompleted += score.completed;
        bestStreak = Math.max(bestStreak, streak.current);

        const items = occurrences
          .filter((o) => availableIds.has(o.taskDefinitionId) || o.status === 'COMPLETED')
          .map((o) => {
            if (o.status === 'COMPLETED') coinsToday += o.taskDefinition.reward;
            return {
              occurrenceId: o.id,
              taskId: o.taskDefinitionId,
              title: o.taskDefinition.title,
              description: o.taskDefinition.description,
              reward: o.taskDefinition.reward,
              reminderTime: o.taskDefinition.reminderTime,
              status: o.status,
              dueDate: o.dueDate,
            };
          })
          .sort((a, b) => (a.reminderTime ?? '99:99').localeCompare(b.reminderTime ?? '99:99'));

        return {
          goalId: goal.id,
          goalTitle: goal.title,
          category: goal.category,
          visibility: goal.visibility,
          streak: streak.current,
          today,
          tasks: items,
        };
      }),
    );

    return {
      groups: groups.filter((g) => g.tasks.length > 0),
      summary: {
        required: totalRequired,
        completed: totalCompleted,
        percent: totalRequired === 0 ? null : Math.round((totalCompleted / totalRequired) * 100),
        coinsToday,
        streak: bestStreak,
      },
    };
  });

  // ------------------------------------------------------- complete / undo

  app.post('/task-occurrences/:id/complete', { preHandler: app.requireAuth }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const userId = req.user!.id;

    const occurrence = await prisma.taskOccurrence.findUnique({
      where: { id },
      include: { participant: { include: { goal: true } }, taskDefinition: true },
    });
    if (!occurrence) throw notFound('Task not found');
    // A participant may only ever touch their own occurrences.
    if (occurrence.participant.userId !== userId) throw forbidden('That is not your task');
    if (occurrence.participant.status !== 'ACTIVE') throw forbidden('You have left this goal');

    const goal = occurrence.participant.goal;
    const today = goalToday(goal);
    if (occurrence.dueDate > today) throw badRequest('That task is not due yet', 'NOT_DUE_YET');

    if (occurrence.status === 'COMPLETED') {
      return { ok: true, alreadyCompleted: true, reward: 0 };
    }

    await prisma.taskOccurrence.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    const reward = occurrence.taskDefinition.reward;
    if (reward > 0) {
      await grantReward({
        userId,
        amount: reward,
        reason: 'TASK_COMPLETED',
        goalId: goal.id,
        taskOccurrenceId: occurrence.id,
      });
    }

    // Recompute from the single source of truth rather than incrementing counters.
    const input = await buildScoreInput(goal, occurrence.participant, today);
    const streak = computeStreak(input, today);
    const score = dailyScore(input, today);

    await prisma.goalParticipant.update({
      where: { id: occurrence.participantId },
      data: {
        currentStreak: streak.current,
        bestStreak: Math.max(streak.best, occurrence.participant.bestStreak),
      },
    });
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (profile && streak.best > profile.bestStreak) {
      await prisma.profile.update({ where: { userId }, data: { bestStreak: streak.best } });
    }

    const unlocked = await evaluateAchievements(userId, streak.current);

    if (score.required > 0 && score.completed === score.required) {
      await notify(userId, 'PROGRESS', `${goal.title}: today is done`, '', { goalId: goal.id });
    }

    return { ok: true, reward, streak: streak.current, today: score, unlocked };
  });

  app.post('/task-occurrences/:id/undo', { preHandler: app.requireAuth }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const userId = req.user!.id;

    const occurrence = await prisma.taskOccurrence.findUnique({
      where: { id },
      include: { participant: { include: { goal: true } } },
    });
    if (!occurrence) throw notFound('Task not found');
    if (occurrence.participant.userId !== userId) throw forbidden('That is not your task');
    if (occurrence.status !== 'COMPLETED') return { ok: true, reward: 0 };

    await prisma.taskOccurrence.update({
      where: { id },
      data: { status: 'PENDING', completedAt: null },
    });
    const reverted = await revertRewardFor(occurrence.id);

    const goal = occurrence.participant.goal;
    const today = goalToday(goal);
    const input = await buildScoreInput(goal, occurrence.participant, today);
    const streak = computeStreak(input, today);

    await prisma.goalParticipant.update({
      where: { id: occurrence.participantId },
      data: { currentStreak: streak.current },
    });

    return { ok: true, reward: -(reverted?.amount ?? 0), streak: streak.current };
  });

  app.post('/task-occurrences/:id/skip', { preHandler: app.requireAuth }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const occurrence = await prisma.taskOccurrence.findUnique({
      where: { id },
      include: { participant: true },
    });
    if (!occurrence) throw notFound('Task not found');
    if (occurrence.participant.userId !== req.user!.id) throw forbidden('That is not your task');
    if (occurrence.status === 'COMPLETED') {
      throw badRequest('Undo the completion before skipping', 'ALREADY_COMPLETED');
    }

    await prisma.taskOccurrence.update({ where: { id }, data: { status: 'SKIPPED' } });
    return { ok: true };
  });

  // ------------------------------------------------------- task definitions

  app.patch('/tasks/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        title: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).optional(),
        reward: z.number().int().min(0).max(1000).optional(),
        reminderTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullish(),
        endDate: z.string().refine(isDayString).nullish(),
        recurrenceType: z.string().optional(),
        recurrenceConfig: z.record(z.unknown()).optional(),
      })
      .parse(req.body);

    const task = await prisma.taskDefinition.findUnique({ where: { id } });
    if (!task) throw notFound('Task not found');
    await loadGoalForUser(task.goalId, req.user!.id, 'own');

    if (body.recurrenceType) {
      validateRecurrence(
        body.recurrenceType as never,
        (body.recurrenceConfig ?? {}) as RecurrenceConfig,
      );
    }

    const updated = await prisma.taskDefinition.update({
      where: { id },
      data: {
        ...body,
        recurrenceConfig: body.recurrenceConfig
          ? JSON.stringify(body.recurrenceConfig)
          : undefined,
      },
    });

    // A changed schedule can add future days; drop stale future PENDING rows first.
    if (body.recurrenceType || body.recurrenceConfig || body.endDate !== undefined) {
      const goal = await prisma.goal.findUnique({ where: { id: task.goalId } });
      if (goal) {
        await prisma.taskOccurrence.deleteMany({
          where: { taskDefinitionId: id, status: 'PENDING', dueDate: { gt: goalToday(goal) } },
        });
        await ensureOccurrences(task.goalId);
      }
    }

    return { task: { ...updated, recurrenceConfig: JSON.parse(updated.recurrenceConfig || '{}') } };
  });

  app.delete('/tasks/:id', { preHandler: app.requireAuth }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const task = await prisma.taskDefinition.findUnique({ where: { id } });
    if (!task) throw notFound('Task not found');
    await loadGoalForUser(task.goalId, req.user!.id, 'own');

    // Archive rather than delete: completed history stays intact for streaks and
    // the average leaderboard, but no new occurrences are generated.
    await prisma.taskDefinition.update({ where: { id }, data: { archivedAt: new Date() } });
    await prisma.taskOccurrence.deleteMany({
      where: { taskDefinitionId: id, status: 'PENDING' },
    });
    return { ok: true };
  });
}
