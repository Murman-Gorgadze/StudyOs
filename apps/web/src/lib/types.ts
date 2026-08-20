export type GoalCategory =
  | 'FITNESS'
  | 'HEALTH'
  | 'STUDY'
  | 'READING'
  | 'CAREER'
  | 'FINANCE'
  | 'PRODUCTIVITY'
  | 'PERSONAL'
  | 'OTHER';

export type GoalVisibility = 'PRIVATE' | 'PUBLIC';
export type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
export type TargetType = 'HABIT' | 'QUANTITY' | 'WEEKLY_TARGET' | 'DEADLINE';
export type RecurrenceType =
  | 'ONCE'
  | 'EVERY_DAY'
  | 'SPECIFIC_WEEKDAYS'
  | 'TIMES_PER_WEEK'
  | 'EVERY_X_DAYS';
export type OccurrenceStatus = 'PENDING' | 'COMPLETED' | 'MISSED' | 'SKIPPED';
export type FriendState = 'NONE' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'FRIENDS' | 'BLOCKED';

/**
 * What anyone may see about a user. Email, timezone and notification settings are
 * deliberately absent — the server only sends those to the account owner.
 */
export interface PublicProfile {
  id: string;
  name: string;
  avatarEmoji: string;
  bio: string;
  totalCoins: number;
  bestStreak: number;
  level: number;
  intoLevel: number;
  perLevel: number;
  percent: number;
}

/** The signed-in user's own record, which does include the private fields. */
export interface CurrentUser extends PublicProfile {
  email: string;
  timezone: string;
  notifications: {
    taskReminders: boolean;
    friendActivity: boolean;
    leaderboardUpdates: boolean;
    achievements: boolean;
  };
}

export interface GoalSummary {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  category: GoalCategory;
  visibility: GoalVisibility;
  status: GoalStatus;
  targetType: TargetType;
  targetValue: number | null;
  timezone: string;
  startDate: string;
  deadline: string | null;
  createdAt: string;
  participantCount: number;
  taskCount: number;
  progress: number;
  streak: number;
  todayCompleted: number;
  todayRequired: number;
}

export interface TaskDefinition {
  id: string;
  goalId: string;
  title: string;
  description: string;
  recurrenceType: RecurrenceType;
  recurrenceConfig: { weekdays?: number[]; timesPerWeek?: number; intervalDays?: number };
  reward: number;
  startDate: string;
  endDate: string | null;
  reminderTime: string | null;
}

export interface DayScore {
  day: string;
  required: number;
  completed: number;
  percent: number | null;
}

export interface GoalDetailResponse {
  goal: GoalSummary & {
    owner: { id: string; name: string; avatarEmoji: string };
    isOwner: boolean;
    isParticipant: boolean;
    /** Only ever populated for the goal owner. */
    inviteCode: string | null;
  };
  tasks: TaskDefinition[];
  participants: Array<{
    id: string;
    userId: string;
    name: string;
    avatarEmoji: string;
    role: string;
    joinedOn: string;
    isMe: boolean;
  }>;
  me: {
    participantId: string;
    progress: { completedOccurrences: number; totalOccurrences: number; percent: number };
    streak: { current: number; best: number };
    today: DayScore;
    average: { percent: number | null; countedDays: number };
  } | null;
  history: DayScore[];
  today: string;
}

export interface TodayTask {
  occurrenceId: string;
  taskId: string;
  title: string;
  description: string;
  reward: number;
  reminderTime: string | null;
  status: OccurrenceStatus;
  dueDate: string;
}

export interface TodayResponse {
  groups: Array<{
    goalId: string;
    goalTitle: string;
    category: GoalCategory;
    visibility: GoalVisibility;
    streak: number;
    today: string;
    tasks: TodayTask[];
  }>;
  summary: {
    required: number;
    completed: number;
    percent: number | null;
    coinsToday: number;
    streak: number;
  };
}

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
  isMe: boolean;
}

export interface Friend {
  id: string;
  name: string;
  avatarEmoji: string;
  level: number;
  totalCoins: number;
  currentStreak: number;
  sharedGoals: number;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  category: GoalCategory;
  participantCount: number;
  taskCount: number;
  startDate: string;
  deadline: string | null;
  owner: { id: string; name: string; avatarEmoji: string };
  hasJoined: boolean;
}

export interface Notification {
  id: string;
  type: 'REMINDER' | 'FRIEND' | 'PROGRESS' | 'LEADERBOARD' | 'ACHIEVEMENT';
  title: string;
  body: string;
  data: { goalId?: string; achievementCode?: string };
  readAt: string | null;
  createdAt: string;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  reward: number;
  unlockedAt: string | null;
}

export const CATEGORY_LABEL: Record<GoalCategory, string> = {
  FITNESS: 'Fitness',
  HEALTH: 'Health',
  STUDY: 'Study',
  READING: 'Reading',
  CAREER: 'Career',
  FINANCE: 'Finance',
  PRODUCTIVITY: 'Productivity',
  PERSONAL: 'Personal Growth',
  OTHER: 'Other',
};

export const CATEGORY_EMOJI: Record<GoalCategory, string> = {
  FITNESS: '🏋️',
  HEALTH: '💚',
  STUDY: '📚',
  READING: '📖',
  CAREER: '💼',
  FINANCE: '💰',
  PRODUCTIVITY: '⚡',
  PERSONAL: '🌱',
  OTHER: '🎯',
};

export const WEEKDAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Human wording for a recurrence rule, used wherever a task is described. */
export function describeRecurrence(task: Pick<TaskDefinition, 'recurrenceType' | 'recurrenceConfig'>) {
  switch (task.recurrenceType) {
    case 'ONCE':
      return 'Once';
    case 'EVERY_DAY':
      return 'Every day';
    case 'SPECIFIC_WEEKDAYS': {
      const days = task.recurrenceConfig.weekdays ?? [];
      if (days.length === 7) return 'Every day';
      return days.map((d) => WEEKDAY_LABEL[d]).join(', ');
    }
    case 'TIMES_PER_WEEK':
      return `${task.recurrenceConfig.timesPerWeek ?? 1}x per week`;
    case 'EVERY_X_DAYS': {
      const n = task.recurrenceConfig.intervalDays ?? 1;
      return n === 1 ? 'Every day' : `Every ${n} days`;
    }
    default:
      return '';
  }
}

// ---------------------------------------------------------------- Copilot

export type QuestionType =
  | 'FREE_TEXT'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'NUMBER'
  | 'DATE'
  | 'TIME'
  | 'DAYS_OF_WEEK';

export interface CopilotQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options?: string[];
  allowCustomAnswer: boolean;
  optional: boolean;
  unit?: string | null;
}

export interface InterviewTurn {
  sessionId: string;
  status: string;
  assistantMessage: string;
  question: CopilotQuestion | null;
  questionCount: number;
  estimatedTotal: number;
  context: Record<string, unknown>;
  canGenerate: boolean;
}

export interface DraftTask {
  id: string;
  title: string;
  description: string;
  recurrenceType: RecurrenceType;
  recurrenceConfig: { weekdays?: number[]; timesPerWeek?: number; intervalDays?: number };
  estimatedMinutes: number | null;
  preferredTime: string | null;
  /** Why this task suits this person — quoted from the interview. */
  reason: string;
}

export interface GoalDraft {
  id: string;
  sessionId: string | null;
  title: string;
  description: string;
  category: GoalCategory;
  targetType: TargetType;
  targetValue: number | null;
  deadline: string | null;
  visibility: GoalVisibility;
  rationale: string;
  status: 'GENERATED' | 'EDITING' | 'CONFIRMED' | 'DISCARDED';
  createdGoalId: string | null;
  tasks: DraftTask[];
}

export interface CopilotStatus {
  enabled: boolean;
  resumable: Array<{
    id: string;
    initialGoalText: string;
    status: string;
    questionCount: number;
    updatedAt: string;
  }>;
}

export interface ProgressSuggestion {
  summary: string;
  taskTitle?: string | null;
  proposedRecurrence?: {
    type: RecurrenceType;
    weekdays?: number[];
    timesPerWeek?: number;
    intervalDays?: number;
  } | null;
  proposedMinutes?: number | null;
}

export interface GoalCopilotAnswer {
  summary: {
    goalTitle: string;
    periodDays: number;
    eligibleTaskOccurrences: number;
    completedTaskOccurrences: number;
    completionRate: number;
    currentStreak: number;
    mostMissedTasks: Array<{ title: string; missRate: number; scheduled: number }>;
  };
  analysis: { explanation: string; suggestions: ProgressSuggestion[] };
}

/** Human wording for a draft task's recurrence. */
export function describeDraftRecurrence(task: Pick<DraftTask, 'recurrenceType' | 'recurrenceConfig'>) {
  return describeRecurrence({
    recurrenceType: task.recurrenceType,
    recurrenceConfig: task.recurrenceConfig,
  });
}
