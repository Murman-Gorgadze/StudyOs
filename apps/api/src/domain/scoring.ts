import { type DayString, addDays, eachDay, startOfWeek } from './dates.js';
import {
  type TaskSchedule,
  type WeeklyQuotaContext,
  isAvailableOn,
  isRequiredOn,
} from './recurrence.js';

// The one place progress is computed. Every surface — Today's progress, goal
// progress, streaks, Daily leaderboard, Average leaderboard — reads from here, so
// a participant can never see two different numbers for the same thing.

export interface ScoredTask {
  taskId: string;
  schedule: TaskSchedule;
}

export interface ParticipantScoreInput {
  tasks: ScoredTask[];
  /** Days on which each task was completed. */
  completions: Array<{ taskId: string; day: DayString }>;
  /** First day this participant is scored on (goal start / join day, whichever is later). */
  from: DayString;
  /** Last day this participant is scored on (today / leave day / deadline, whichever is first). */
  to: DayString;
}

export interface DayScore {
  day: DayString;
  required: number;
  completed: number;
  /** null when nothing was scheduled — "No tasks today", never 0%. */
  percent: number | null;
}

function completionIndex(
  completions: Array<{ taskId: string; day: DayString }>,
): Map<string, Set<DayString>> {
  const byTask = new Map<string, Set<DayString>>();
  for (const { taskId, day } of completions) {
    let set = byTask.get(taskId);
    if (!set) {
      set = new Set();
      byTask.set(taskId, set);
    }
    set.add(day);
  }
  return byTask;
}

function quotaContext(
  completedDays: Set<DayString> | undefined,
  day: DayString,
  lastScorableDay: DayString,
): WeeklyQuotaContext {
  const weekStart = startOfWeek(day);
  const weekEnd = addDays(weekStart, 6);
  const inWeek = new Set<DayString>();
  if (completedDays) {
    for (const d of completedDays) {
      if (d >= weekStart && d <= weekEnd) inWeek.add(d);
    }
  }
  return { completedDaysInWeek: inWeek, lastScorableDay };
}

/**
 * Per-day required/completed counts.
 *
 * `from`/`to` bound which days are *reported*; the weekly-quota horizon is always
 * the participant's real last scorable day (`input.to`). Keeping those separate
 * matters: asking for a single Monday must not make a 3x/week task look required
 * just because the requested range happens to end that day.
 */
function scoreRange(input: ParticipantScoreInput, from: DayString, to: DayString): DayScore[] {
  const { tasks } = input;
  if (to < from) return [];

  const byTask = completionIndex(input.completions);
  const horizon = input.to;

  return eachDay(from, to).map((day) => {
    let required = 0;
    let completed = 0;

    for (const { taskId, schedule } of tasks) {
      const completedDays = byTask.get(taskId);
      const ctx = quotaContext(completedDays, day, horizon);
      if (!isRequiredOn(schedule, day, ctx)) continue;
      required++;
      if (completedDays?.has(day)) completed++;
    }

    return {
      day,
      required,
      completed,
      percent: required === 0 ? null : Math.round((completed / required) * 1000) / 10,
    };
  });
}

/** Tasks the participant may act on today, whether or not they are required. */
export function availableTasksOn(
  input: Pick<ParticipantScoreInput, 'tasks' | 'completions' | 'to'>,
  day: DayString,
): string[] {
  const byTask = completionIndex(input.completions);
  return input.tasks
    .filter(({ taskId, schedule }) =>
      isAvailableOn(schedule, day, quotaContext(byTask.get(taskId), day, input.to)),
    )
    .map(({ taskId }) => taskId);
}

/** Per-day scores across the participant's whole scorable window. */
export function scoreDays(input: ParticipantScoreInput): DayScore[] {
  return scoreRange(input, input.from, input.to);
}

export function scoreForDay(input: ParticipantScoreInput, day: DayString): DayScore {
  const found = scoreRange(input, day, day)[0];
  return found ?? { day, required: 0, completed: 0, percent: null };
}

/**
 * Daily leaderboard score — the current challenge day only.
 * Returns null when nothing is scheduled, so the UI shows "No tasks today"
 * instead of an unfair 0%.
 */
export function dailyScore(input: ParticipantScoreInput, today: DayString): DayScore {
  return scoreForDay(input, today);
}

export interface AverageScore {
  /** null when no eligible finished day exists yet. */
  percent: number | null;
  /** Days that actually contributed to the average. */
  countedDays: number;
}

/**
 * Average leaderboard score — the mean of each *finished* eligible day.
 *
 * Excluded, per the product rules:
 *   - days before the participant joined (window `from` already accounts for it)
 *   - days after they left (window `to` already accounts for it)
 *   - days with nothing scheduled (percent === null)
 *   - today and any future day — today is what Daily is for, and someone with an
 *     evening task must not be marked down at 09:00
 */
export function averageScore(input: ParticipantScoreInput, today: DayString): AverageScore {
  const lastFinishedDay = addDays(today, -1);
  const end = input.to < lastFinishedDay ? input.to : lastFinishedDay;
  if (end < input.from) return { percent: null, countedDays: 0 };

  const eligible = scoreRange(input, input.from, end).filter((d) => d.percent !== null);
  if (eligible.length === 0) return { percent: null, countedDays: 0 };

  const total = eligible.reduce((sum, d) => sum + (d.percent as number), 0);
  return {
    percent: Math.round((total / eligible.length) * 10) / 10,
    countedDays: eligible.length,
  };
}

export interface StreakResult {
  current: number;
  best: number;
}

/**
 * A streak day is one where the participant did everything required of them.
 * A day with nothing scheduled is neutral: it neither extends nor breaks the
 * streak — essential for "gym Mon/Wed/Fri" and any weekly schedule.
 *
 * Today counts once completed, but an unfinished today never breaks a streak;
 * the walk simply starts at yesterday instead.
 */
export function computeStreak(input: ParticipantScoreInput, today: DayString): StreakResult {
  const end = input.to < today ? input.to : today;
  if (end < input.from) return { current: 0, best: 0 };

  const days = scoreRange(input, input.from, end);

  // Best streak: longest run of satisfied days, ignoring neutral days.
  let best = 0;
  let run = 0;
  for (const day of days) {
    if (day.percent === null) continue; // neutral
    if (day.completed >= day.required) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  // Current streak: walk backwards, skipping neutral days.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.percent === null) continue;
    const satisfied = day.completed >= day.required;
    if (satisfied) {
      current++;
      continue;
    }
    // An unfinished *today* is still in progress — it does not break the streak.
    if (day.day === today) continue;
    break;
  }

  return { current, best: Math.max(best, current) };
}

export interface GoalProgress {
  completedOccurrences: number;
  totalOccurrences: number;
  percent: number;
}

/**
 * Overall goal progress for one participant:
 *   completed eligible occurrences / total eligible occurrences
 * evaluated over the goal period up to today (future days are not counted
 * against anyone).
 */
export function goalProgress(input: ParticipantScoreInput, today: DayString): GoalProgress {
  const end = input.to < today ? input.to : today;
  if (end < input.from) return { completedOccurrences: 0, totalOccurrences: 0, percent: 0 };

  const days = scoreRange(input, input.from, end);
  const totalOccurrences = days.reduce((sum, d) => sum + d.required, 0);
  const completedOccurrences = days.reduce((sum, d) => sum + d.completed, 0);

  return {
    completedOccurrences,
    totalOccurrences,
    percent:
      totalOccurrences === 0
        ? 0
        : Math.round((completedOccurrences / totalOccurrences) * 1000) / 10,
  };
}

// ------------------------------------------------------------- leaderboard

export interface LeaderboardEntry {
  participantId: string;
  userId: string;
  name: string;
  avatarEmoji: string;
  percent: number | null;
  completed: number;
  required: number;
  currentStreak: number;
  totalCompleted: number;
  rank: number;
}

/**
 * Rank participants, highest percent first.
 *
 * Ties break on current streak, then total completed eligible tasks, then the
 * participant id — deterministic, so a refresh never reshuffles equal rows.
 * Participants with nothing scheduled (percent === null) always sort last and
 * are ranked after everyone with a score.
 */
export function rankLeaderboard(
  entries: Array<Omit<LeaderboardEntry, 'rank'>>,
): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.percent === null && b.percent === null) return a.participantId < b.participantId ? -1 : 1;
    if (a.percent === null) return 1;
    if (b.percent === null) return -1;
    if (b.percent !== a.percent) return b.percent - a.percent;
    if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
    if (b.totalCompleted !== a.totalCompleted) return b.totalCompleted - a.totalCompleted;
    return a.participantId < b.participantId ? -1 : 1;
  });

  return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
}
