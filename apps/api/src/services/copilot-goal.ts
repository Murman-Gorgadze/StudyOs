import { chatJson } from '../ai/client.js';
import { PROMPT_VERSIONS, progressSystemPrompt } from '../ai/prompts.js';
import { progressAnalysisSchema, type ProgressAnalysis } from '../ai/schemas.js';
import { addDays } from '../domain/dates.js';
import { computeStreak, scoreDays } from '../domain/scoring.js';
import { prisma } from '../lib/prisma.js';
import { loadGoalForUser } from './goals.js';
import { buildScoreInput, ensureOccurrences, goalToday } from './occurrences.js';
import { getPreferencesForPrompt } from './preferences.js';
import { recordEvent } from './copilot-analytics.js';

/**
 * A deterministic, aggregated summary of how a goal is going.
 *
 * The model never sees the database. It gets these numbers — computed by the same
 * Phase 1 scoring engine the UI uses — so it cannot invent statistics, and the
 * request stays small regardless of how much history exists.
 */
export interface GoalProgressSummary {
  goalTitle: string;
  category: string;
  periodDays: number;
  eligibleTaskOccurrences: number;
  completedTaskOccurrences: number;
  completionRate: number;
  currentStreak: number;
  bestStreak: number;
  mostMissedTasks: Array<{ title: string; missRate: number; scheduled: number }>;
  schedule: Array<{ title: string; recurrence: string; minutes: number | null; time: string | null }>;
}

export async function buildProgressSummary(
  goalId: string,
  userId: string,
  periodDays = 14,
): Promise<GoalProgressSummary> {
  const { goal, participant } = await loadGoalForUser(goalId, userId, 'participate');
  await ensureOccurrences(goalId, [participant!.id]);

  const today = goalToday(goal);
  const tasks = await prisma.taskDefinition.findMany({
    where: { goalId, archivedAt: null },
  });
  const input = await buildScoreInput(goal, participant!, today, tasks);

  const windowStart = addDays(today, -(periodDays - 1));
  const days = scoreDays(input).filter((d) => d.day >= windowStart);

  const eligible = days.reduce((sum, d) => sum + d.required, 0);
  const completed = days.reduce((sum, d) => sum + d.completed, 0);
  const streak = computeStreak(input, today);

  // Per-task miss rates, so the Copilot can name the task actually being dropped.
  const occurrences = await prisma.taskOccurrence.findMany({
    where: {
      participantId: participant!.id,
      dueDate: { gte: windowStart, lte: today },
    },
    include: { taskDefinition: { select: { title: true } } },
  });

  const byTask = new Map<string, { scheduled: number; done: number }>();
  for (const occurrence of occurrences) {
    const key = occurrence.taskDefinition.title;
    const row = byTask.get(key) ?? { scheduled: 0, done: 0 };
    row.scheduled++;
    if (occurrence.status === 'COMPLETED') row.done++;
    byTask.set(key, row);
  }

  const mostMissedTasks = [...byTask.entries()]
    .map(([title, row]) => ({
      title,
      scheduled: row.scheduled,
      missRate: row.scheduled === 0 ? 0 : Math.round((1 - row.done / row.scheduled) * 100) / 100,
    }))
    .filter((row) => row.missRate > 0)
    .sort((a, b) => b.missRate - a.missRate)
    .slice(0, 3);

  return {
    goalTitle: goal.title,
    category: goal.category,
    periodDays,
    eligibleTaskOccurrences: eligible,
    completedTaskOccurrences: completed,
    completionRate: eligible === 0 ? 0 : Math.round((completed / eligible) * 100) / 100,
    currentStreak: streak.current,
    bestStreak: streak.best,
    mostMissedTasks,
    schedule: tasks.map((task) => ({
      title: task.title,
      recurrence: `${task.recurrenceType} ${task.recurrenceConfig}`,
      minutes: null,
      time: task.reminderTime,
    })),
  };
}

/**
 * Ask the Copilot about an existing goal.
 *
 * Returns an explanation and optional *proposals*. Nothing is applied — changing
 * a live goal's schedule needs explicit confirmation, because it affects future
 * occurrences and the user's streak.
 */
export async function askGoalCopilot(
  goalId: string,
  userId: string,
  message: string,
): Promise<{ summary: GoalProgressSummary; analysis: ProgressAnalysis }> {
  const summary = await buildProgressSummary(goalId, userId);
  const { goal } = await loadGoalForUser(goalId, userId, 'participate');
  const preferences = await getPreferencesForPrompt(userId, goal.category);

  const analysis = await chatJson(
    {
      purpose: 'PROGRESS_ANALYSIS',
      promptVersion: PROMPT_VERSIONS.progress,
      userId,
      thinking: false,
      temperature: 0.3,
      maxTokens: 2000,
      timeoutMs: 35_000,
      messages: [
        { role: 'system', content: progressSystemPrompt() },
        {
          role: 'user',
          content: `Goal statistics (authoritative — do not invent others):
${JSON.stringify(summary, null, 2)}

What this person prefers:
${preferences.map((p) => `- ${p.key}: ${p.value}`).join('\n') || '(nothing on file)'}

They ask:
"${message}"`,
        },
      ],
    },
    progressAnalysisSchema,
  );

  await recordEvent({ userId, type: 'GOAL_COPILOT_ASKED', meta: { goalId } });
  return { summary, analysis };
}
