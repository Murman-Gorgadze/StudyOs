import { prisma } from '../lib/prisma.js';

/**
 * Copilot funnel analytics. Fire-and-forget: a telemetry failure must never
 * break the user's flow, so every write swallows its own errors.
 */
export type CopilotEventType =
  | 'SESSION_STARTED'
  | 'QUESTION_ANSWERED'
  | 'SESSION_CANCELLED'
  | 'DRAFT_GENERATED'
  | 'DRAFT_REGENERATED'
  | 'DRAFT_EDITED_MANUALLY'
  | 'DRAFT_EDITED_WITH_AI'
  | 'DRAFT_CONFIRMED'
  | 'DRAFT_DISCARDED'
  | 'GOAL_COPILOT_ASKED'
  | 'FEEDBACK_GIVEN';

export async function recordEvent(entry: {
  userId?: string;
  type: CopilotEventType;
  sessionId?: string;
  draftId?: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.copilotEvent
    .create({
      data: {
        userId: entry.userId,
        type: entry.type,
        sessionId: entry.sessionId,
        draftId: entry.draftId,
        meta: JSON.stringify(entry.meta ?? {}),
      },
    })
    .catch(() => {});
}
