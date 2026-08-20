import { addDays, todayIn } from '../domain/dates.js';
import type { RecurrenceType } from '../domain/enums.js';
import { validateRecurrence, type RecurrenceConfig } from '../domain/recurrence.js';
import type { DraftTaskInput, GoalDraftInput } from './schemas.js';

// The deterministic safety net between the model and the database.
//
// Zod already guarantees the SHAPE. This layer enforces what is *sensible*:
// a plan of 40 daily tasks, a deadline in the past, or "walk 300 times per week"
// all parse fine but must never reach a user. Anything recoverable is normalised;
// anything genuinely broken is rejected with a reason.

export class DraftValidationError extends Error {}

export interface NormalizedTask {
  title: string;
  description: string;
  recurrenceType: RecurrenceType;
  recurrenceConfig: RecurrenceConfig;
  estimatedMinutes: number | null;
  preferredTime: string | null;
  reason: string;
  /** Computed by the application, never by the model. */
  reward: number;
}

export interface NormalizedDraft {
  title: string;
  description: string;
  category: GoalDraftInput['category'];
  targetType: GoalDraftInput['targetType'];
  targetValue: number | null;
  deadline: string | null;
  rationale: string;
  tasks: NormalizedTask[];
  /** Anything that was silently corrected, surfaced for logging. */
  adjustments: string[];
}

const MAX_TASKS = 8;
const MAX_DAILY_MINUTES = 240;

/**
 * Where tolerance stops.
 *
 * A near-miss is a representation problem and gets normalised: 8 times a week is
 * someone counting a twice-daily session, and clamping to 7 preserves the intent.
 * 300 times a week is not a rounding error — it means the model produced something
 * semantically broken, and quietly turning it into 7 would hand the user a plan
 * nobody asked for. Past these bands we reject and let the caller regenerate.
 */
const PLAUSIBLE = {
  timesPerWeek: 14, // up to twice daily reads as a real intent
  intervalDays: 365,
  minutes: 600, // a 10-hour session is wrong, but recognisably a session
};

/**
 * Reward is derived from effort by fixed rules so a user cannot talk the AI into
 * minting a high-value task and climbing the leaderboard unfairly.
 */
export function rewardForTask(task: { estimatedMinutes: number | null }): number {
  const minutes = task.estimatedMinutes ?? 15;
  if (minutes <= 10) return 5;
  if (minutes <= 20) return 10;
  if (minutes <= 40) return 15;
  if (minutes <= 60) return 20;
  return 25;
}

/** How many times a week this recurrence actually fires, for workload checks. */
function weeklyFrequency(type: RecurrenceType, config: RecurrenceConfig): number {
  switch (type) {
    case 'EVERY_DAY':
      return 7;
    case 'ONCE':
      return 0.25;
    case 'SPECIFIC_WEEKDAYS':
      return config.weekdays?.length ?? 0;
    case 'TIMES_PER_WEEK':
      return config.timesPerWeek ?? 1;
    case 'EVERY_X_DAYS':
      return 7 / (config.intervalDays ?? 1);
    default:
      return 0;
  }
}

function normalizeRecurrence(
  task: DraftTaskInput,
  adjustments: string[],
): { type: RecurrenceType; config: RecurrenceConfig } {
  const type = task.recurrence.type;
  const config: RecurrenceConfig = {};

  switch (type) {
    case 'SPECIFIC_WEEKDAYS': {
      const weekdays = [...new Set(task.recurrence.weekdays ?? [])]
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .sort((a, b) => a - b);
      if (weekdays.length === 0) {
        // A weekday task with no weekdays would never fire — fall back rather than reject.
        adjustments.push(`"${task.title}" had no weekdays; treated as every day`);
        return { type: 'EVERY_DAY', config: {} };
      }
      config.weekdays = weekdays;
      break;
    }
    case 'TIMES_PER_WEEK': {
      const raw = task.recurrence.timesPerWeek ?? 1;
      if (raw < 1 || raw > PLAUSIBLE.timesPerWeek) {
        throw new DraftValidationError(
          `"${task.title}" came back as ${raw} times per week, which is not a real schedule. Try generating the plan again.`,
        );
      }
      const clamped = Math.min(7, Math.max(1, Math.round(raw)));
      if (clamped !== raw) {
        adjustments.push(`"${task.title}" asked for ${raw}x per week; capped at ${clamped}`);
      }
      config.timesPerWeek = clamped;
      break;
    }
    case 'EVERY_X_DAYS': {
      const raw = task.recurrence.intervalDays ?? 1;
      if (raw < 1 || raw > PLAUSIBLE.intervalDays) {
        throw new DraftValidationError(
          `"${task.title}" came back with an interval of ${raw} days, which is not a real schedule. Try generating the plan again.`,
        );
      }
      const clamped = Math.min(90, Math.max(1, Math.round(raw)));
      if (clamped !== raw) {
        adjustments.push(`"${task.title}" interval ${raw} adjusted to ${clamped} days`);
      }
      config.intervalDays = clamped;
      break;
    }
    default:
      break;
  }

  // Final authority is the same validator Phase 1 uses for manual creation.
  validateRecurrence(type, config);
  return { type, config };
}

export function validateAndNormalizeDraft(
  input: GoalDraftInput,
  timezone: string,
  now = new Date(),
): NormalizedDraft {
  const adjustments: string[] = [];
  const today = todayIn(timezone, now);

  if (input.tasks.length === 0) {
    throw new DraftValidationError('The plan came back with no tasks');
  }

  let tasks = input.tasks;
  if (tasks.length > MAX_TASKS) {
    adjustments.push(`Trimmed ${tasks.length} tasks down to ${MAX_TASKS}`);
    tasks = tasks.slice(0, MAX_TASKS);
  }

  // Drop duplicate task titles — the model occasionally restates one.
  const seen = new Set<string>();
  tasks = tasks.filter((task) => {
    const key = task.title.trim().toLowerCase();
    if (seen.has(key)) {
      adjustments.push(`Removed duplicate task "${task.title}"`);
      return false;
    }
    seen.add(key);
    return true;
  });

  const normalizedTasks: NormalizedTask[] = tasks.map((task) => {
    const { type, config } = normalizeRecurrence(task, adjustments);

    let minutes = task.estimatedMinutes ?? null;
    if (minutes !== null && minutes > PLAUSIBLE.minutes) {
      throw new DraftValidationError(
        `"${task.title}" came back as ${minutes} minutes, which is not a real session. Try generating the plan again.`,
      );
    }
    if (minutes !== null && minutes > MAX_DAILY_MINUTES) {
      adjustments.push(`"${task.title}" shortened from ${minutes} to ${MAX_DAILY_MINUTES} minutes`);
      minutes = MAX_DAILY_MINUTES;
    }

    return {
      title: task.title.trim(),
      description: task.description?.trim() ?? '',
      recurrenceType: type,
      recurrenceConfig: config,
      estimatedMinutes: minutes,
      preferredTime: task.preferredTime ?? null,
      reason: task.reason?.trim() ?? '',
      reward: rewardForTask({ estimatedMinutes: minutes }),
    };
  });

  // Guard against a plan nobody could sustain, e.g. six daily hour-long tasks.
  const weeklyMinutes = normalizedTasks.reduce(
    (sum, task) =>
      sum + (task.estimatedMinutes ?? 15) * weeklyFrequency(task.recurrenceType, task.recurrenceConfig),
    0,
  );
  if (weeklyMinutes > 21 * 60) {
    throw new DraftValidationError(
      'That plan would take an unrealistic amount of time each week. Try generating it again.',
    );
  }

  // Deadlines must be in the future, and not absurdly far out.
  let deadline = input.deadline ?? null;
  if (deadline && deadline <= today) {
    adjustments.push(`Deadline ${deadline} was not in the future; removed`);
    deadline = null;
  }
  if (deadline && deadline > addDays(today, 365 * 3)) {
    adjustments.push(`Deadline ${deadline} was too far away; removed`);
    deadline = null;
  }

  // A DEADLINE goal without a date is contradictory; fall back to a habit.
  let targetType = input.targetType;
  if (targetType === 'DEADLINE' && !deadline) {
    adjustments.push('Deadline goal had no valid date; treated as a habit');
    targetType = 'HABIT';
  }

  let targetValue = input.targetValue ?? null;
  if ((targetType === 'QUANTITY' || targetType === 'WEEKLY_TARGET') && !targetValue) {
    adjustments.push('Target value was missing; treated as a habit');
    targetType = 'HABIT';
    targetValue = null;
  }
  if (targetType === 'HABIT') targetValue = null;

  return {
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    category: input.category,
    targetType,
    targetValue,
    deadline,
    rationale: input.rationale.trim(),
    tasks: normalizedTasks,
    adjustments,
  };
}
