import {
  type DayString,
  addDays,
  daysBetween,
  eachDay,
  isBetween,
  startOfWeek,
  weekdayOf,
} from './dates.js';
import type { RecurrenceType } from './enums.js';

export interface RecurrenceConfig {
  weekdays?: number[]; // 0=Sun … 6=Sat
  timesPerWeek?: number;
  intervalDays?: number;
}

export interface TaskSchedule {
  recurrenceType: RecurrenceType;
  recurrenceConfig: RecurrenceConfig;
  startDate: DayString;
  endDate: DayString | null;
}

export function parseRecurrenceConfig(raw: string): RecurrenceConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as RecurrenceConfig) : {};
  } catch {
    return {};
  }
}

export class RecurrenceError extends Error {}

/** Validate a recurrence up front so bad rules can never reach the scheduler. */
export function validateRecurrence(type: RecurrenceType, config: RecurrenceConfig): void {
  switch (type) {
    case 'SPECIFIC_WEEKDAYS': {
      const days = config.weekdays;
      if (!Array.isArray(days) || days.length === 0)
        throw new RecurrenceError('SPECIFIC_WEEKDAYS requires at least one weekday');
      if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
        throw new RecurrenceError('weekdays must be integers 0-6 (0=Sunday)');
      if (new Set(days).size !== days.length)
        throw new RecurrenceError('weekdays must not contain duplicates');
      return;
    }
    case 'TIMES_PER_WEEK': {
      const n = config.timesPerWeek;
      if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 7)
        throw new RecurrenceError('timesPerWeek must be an integer between 1 and 7');
      return;
    }
    case 'EVERY_X_DAYS': {
      const n = config.intervalDays;
      if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 365)
        throw new RecurrenceError('intervalDays must be an integer between 1 and 365');
      return;
    }
    case 'ONCE':
    case 'EVERY_DAY':
      return;
    default:
      throw new RecurrenceError(`Unknown recurrence type: ${type}`);
  }
}

/**
 * Does this task put an occurrence on `day` at all?
 *
 * For fixed recurrences this is the whole schedule. For TIMES_PER_WEEK it means
 * "the user may complete it today if they still owe days this week" — the weekly
 * quota is flexible, so a row exists on every day of the week and `isRequiredOn`
 * decides whether it actually counts against them.
 */
export function occursOn(schedule: TaskSchedule, day: DayString): boolean {
  const { recurrenceType, recurrenceConfig, startDate, endDate } = schedule;
  if (!isBetween(day, startDate, endDate)) return false;

  switch (recurrenceType) {
    case 'ONCE':
      return day === startDate;
    case 'EVERY_DAY':
      return true;
    case 'SPECIFIC_WEEKDAYS':
      return (recurrenceConfig.weekdays ?? []).includes(weekdayOf(day));
    case 'EVERY_X_DAYS': {
      const interval = recurrenceConfig.intervalDays ?? 1;
      return daysBetween(startDate, day) % interval === 0;
    }
    case 'TIMES_PER_WEEK':
      return true;
    default:
      return false;
  }
}

/** Every day in [from, to] that this task schedules an occurrence on. */
export function occurrenceDays(
  schedule: TaskSchedule,
  from: DayString,
  to: DayString,
): DayString[] {
  const windowStart = from > schedule.startDate ? from : schedule.startDate;
  const windowEnd = schedule.endDate && schedule.endDate < to ? schedule.endDate : to;
  if (windowEnd < windowStart) return [];
  return eachDay(windowStart, windowEnd).filter((day) => occursOn(schedule, day));
}

// ------------------------------------------------------------- weekly quota

/**
 * TIMES_PER_WEEK scoring.
 *
 * "Gym 3 times per week" must not punish someone on Monday for not having gone
 * yet, and must not keep demanding gym visits after they have already done three.
 * So a flexible task is:
 *
 *   available  — completable, whenever quota remains for the week
 *   required   — counted in the day's denominator, only once the remaining days
 *                in the week are no more than the remaining quota
 *
 * Completing early shrinks the quota, so the later days stop being required.
 * Skipping all week means the final days become required and are scored.
 */
export interface WeeklyQuotaContext {
  /** Completions of this task, by day, for the week containing the day queried. */
  completedDaysInWeek: Set<DayString>;
  /** Last day the participant is scored on (goal end / leave date / today). */
  lastScorableDay: DayString | null;
}

export function remainingQuota(
  timesPerWeek: number,
  day: DayString,
  ctx: WeeklyQuotaContext,
): number {
  const weekStart = startOfWeek(day);
  let completedBefore = 0;
  for (const completed of ctx.completedDaysInWeek) {
    if (completed >= weekStart && completed < day) completedBefore++;
  }
  return Math.max(0, timesPerWeek - completedBefore);
}

/** Days from `day` to the end of its week that the participant can still act on. */
function scorableDaysLeftInWeek(day: DayString, ctx: WeeklyQuotaContext): number {
  const weekEnd = addDays(startOfWeek(day), 6);
  const horizon =
    ctx.lastScorableDay && ctx.lastScorableDay < weekEnd ? ctx.lastScorableDay : weekEnd;
  if (horizon < day) return 0;
  return daysBetween(day, horizon) + 1;
}

export function isAvailableOn(
  schedule: TaskSchedule,
  day: DayString,
  ctx: WeeklyQuotaContext,
): boolean {
  if (!occursOn(schedule, day)) return false;
  if (schedule.recurrenceType !== 'TIMES_PER_WEEK') return true;
  const target = schedule.recurrenceConfig.timesPerWeek ?? 1;
  return remainingQuota(target, day, ctx) > 0;
}

export function isRequiredOn(
  schedule: TaskSchedule,
  day: DayString,
  ctx: WeeklyQuotaContext,
): boolean {
  if (!occursOn(schedule, day)) return false;
  if (schedule.recurrenceType !== 'TIMES_PER_WEEK') return true;

  const target = schedule.recurrenceConfig.timesPerWeek ?? 1;
  const quota = remainingQuota(target, day, ctx);
  if (quota <= 0) return false;

  // Already done today? Then today plainly counted.
  if (ctx.completedDaysInWeek.has(day)) return true;

  return scorableDaysLeftInWeek(day, ctx) <= quota;
}
