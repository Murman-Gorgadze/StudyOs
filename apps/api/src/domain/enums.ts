// Status-like values are stored as Strings (SQLite has no native enums), so these
// constants plus their guards are the single place the vocabulary is defined.

export const GOAL_VISIBILITY = ['PRIVATE', 'PUBLIC'] as const;
export type GoalVisibility = (typeof GOAL_VISIBILITY)[number];

export const GOAL_STATUS = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;
export type GoalStatus = (typeof GOAL_STATUS)[number];

export const GOAL_CATEGORY = [
  'FITNESS',
  'HEALTH',
  'STUDY',
  'READING',
  'CAREER',
  'FINANCE',
  'PRODUCTIVITY',
  'PERSONAL',
  'OTHER',
] as const;
export type GoalCategory = (typeof GOAL_CATEGORY)[number];

export const TARGET_TYPE = ['HABIT', 'QUANTITY', 'WEEKLY_TARGET', 'DEADLINE'] as const;
export type TargetType = (typeof TARGET_TYPE)[number];

export const RECURRENCE_TYPE = [
  'ONCE',
  'EVERY_DAY',
  'SPECIFIC_WEEKDAYS',
  'TIMES_PER_WEEK',
  'EVERY_X_DAYS',
] as const;
export type RecurrenceType = (typeof RECURRENCE_TYPE)[number];

export const OCCURRENCE_STATUS = ['PENDING', 'COMPLETED', 'MISSED', 'SKIPPED'] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUS)[number];

export const PARTICIPANT_ROLE = ['OWNER', 'MEMBER'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLE)[number];

export const PARTICIPANT_STATUS = ['ACTIVE', 'LEFT'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUS)[number];

export const FRIENDSHIP_STATUS = ['PENDING', 'ACCEPTED', 'BLOCKED'] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUS)[number];

/** The relationship as seen from one specific user's point of view. */
export const FRIEND_STATE = [
  'NONE',
  'REQUEST_SENT',
  'REQUEST_RECEIVED',
  'FRIENDS',
  'BLOCKED',
] as const;
export type FriendState = (typeof FRIEND_STATE)[number];

export const INVITATION_STATUS = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUS)[number];

export const NOTIFICATION_TYPE = [
  'REMINDER',
  'FRIEND',
  'PROGRESS',
  'LEADERBOARD',
  'ACHIEVEMENT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[number];

export const REWARD_REASON = [
  'TASK_COMPLETED',
  'TASK_UNDONE',
  'ACHIEVEMENT',
  'GOAL_COMPLETED',
] as const;
export type RewardReason = (typeof REWARD_REASON)[number];

export const LEADERBOARD_MODE = ['daily', 'average'] as const;
export type LeaderboardMode = (typeof LEADERBOARD_MODE)[number];
