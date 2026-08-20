import type { CopilotSession } from '@prisma/client';
import { chatJson } from '../ai/client.js';
import {
  PROMPT_VERSIONS,
  interviewSystemPrompt,
  interviewUserPrompt,
} from '../ai/prompts.js';
import {
  interviewResponseSchema,
  type CopilotQuestion,
  type InterviewResponse,
} from '../ai/schemas.js';
import {
  applyModelExtraction,
  createContext,
  currentSessionFacts,
  describeProvenance,
  inferredValues,
  literalAnswers,
  parseContext,
  recordAnswer,
  serializeContext,
  toPlainObject,
} from '../ai/context.js';
import { memoryGateCategory } from '../ai/category.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { getPreferencesForPrompt } from './preferences.js';
import { recordEvent } from './copilot-analytics.js';

// Interview limits are enforced by the backend, not by trusting the model to
// stop. A chatty model cannot trap the user in an endless questionnaire.
export const MIN_QUESTIONS = 2;
// Lowered from 7 once the harness went green on quality. Interview turns are the
// dominant cost of a session — a 5-question run spent ~38s of its ~43s here — and
// runs were routinely reaching 5-6 questions without the extra ones changing the
// plan. Quality is re-verified by the harness after any change to this.
export const RECOMMENDED_MAX_QUESTIONS = 5;
export const HARD_MAX_QUESTIONS = 10;

const SESSION_TTL_HOURS = 48;
/** Only the tail of the transcript is sent — cost control, and it is not the source of truth. */
const TRANSCRIPT_WINDOW = 12;

export interface InterviewTurn {
  sessionId: string;
  status: string;
  assistantMessage: string;
  question: CopilotQuestion | null;
  questionCount: number;
  estimatedTotal: number;
  context: Record<string, unknown>;
  /** Where each context value came from — for debugging and the quality harness. */
  provenance: Array<{ key: string; value: unknown; source: string; questionId: string | null }>;
  canGenerate: boolean;
}

function safeParse(raw: string): { id?: string; prompt?: string } | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** The session belongs to the caller, or it does not exist as far as they know. */
export async function loadSession(sessionId: string, userId: string) {
  const session = await prisma.copilotSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) throw notFound('That Copilot session no longer exists');
  if (session.userId !== userId) throw notFound('That Copilot session no longer exists');
  if (session.expiresAt.getTime() < Date.now()) {
    throw badRequest('That Copilot session has expired. Start a new one.', 'SESSION_EXPIRED');
  }
  return session;
}

type SessionMessage = { role: string; content: string; structuredPayload?: string | null };

/**
 * Pair each asked question with the answer it received.
 *
 * Handing the model explicit Q&A pairs is what stops it re-asking something in
 * slightly different words — the raw transcript alone was not enough.
 */
export function answeredPairs(messages: SessionMessage[]) {
  const questions = new Map<string, string>();
  const pairs: Array<{ questionId: string; prompt: string; answer: string }> = [];

  for (const message of messages) {
    if (!message.structuredPayload) continue;
    let payload: { id?: string; prompt?: string; questionId?: string; answer?: unknown };
    try {
      payload = JSON.parse(message.structuredPayload);
    } catch {
      continue;
    }
    if (message.role === 'assistant' && payload.id) {
      questions.set(payload.id, payload.prompt ?? '');
    }
    if (message.role === 'user' && payload.questionId) {
      pairs.push({
        questionId: payload.questionId,
        prompt: questions.get(payload.questionId) ?? '',
        answer: formatAnswer(payload.answer),
      });
    }
  }
  return pairs;
}

async function runInterviewTurn(
  session: CopilotSession & { messages: SessionMessage[] },
): Promise<{ result: InterviewResponse; preferences: Array<{ key: string; value: string }> }> {
  const context = parseContext(session.structuredContext, session.initialGoalText);
  const asked = parseJson<string[]>(session.askedQuestionIds, []);

  // Which memories are visible is decided from the user's own words, never from
  // the category the model reported — see ai/category.ts for why.
  const gate = memoryGateCategory(session.initialGoalText, session.category);
  const preferences = await getPreferencesForPrompt(session.userId, gate.category);

  const result = await chatJson(
    {
      purpose: 'INTERVIEW',
      promptVersion: PROMPT_VERSIONS.interview,
      userId: session.userId,
      sessionId: session.id,
      // Interview turns are simple; reasoning would only add latency.
      thinking: false,
      temperature: 0.4,
      maxTokens: 900,
      // Measured: median 2.9s, p90 7.6s, p99 18.5s. A 20s cap sat exactly on p99
      // and killed calls that were about to succeed; 25s still catches a genuine
      // hang (the observed outlier was 44s) without clipping the tail.
      timeoutMs: 25_000,
      messages: [
        {
          role: 'system',
          content: interviewSystemPrompt({
            questionCount: session.questionCount,
            minQuestions: MIN_QUESTIONS,
            maxQuestions: RECOMMENDED_MAX_QUESTIONS,
          }),
        },
        {
          role: 'user',
          content: interviewUserPrompt({
            initialGoal: session.initialGoalText,
            context: toPlainObject(context),
            askedQuestionIds: asked,
            answered: answeredPairs(session.messages),
            transcript: session.messages.slice(-TRANSCRIPT_WINDOW),
            knownPreferences: preferences,
          }),
        },
      ],
    },
    interviewResponseSchema,
  );
  return { result, preferences };
}

/**
 * Apply the model's turn to the session, enforcing the backend's own limits on
 * how the interview may progress.
 */
async function applyTurn(
  session: CopilotSession & { messages: SessionMessage[] },
  result: InterviewResponse,
  injectedPreferences: Array<{ key: string; value: string }> = [],
): Promise<InterviewTurn> {
  const context = parseContext(session.structuredContext, session.initialGoalText);
  applyModelExtraction(
    context,
    result.extractedContext as Record<string, unknown> | undefined,
    injectedPreferences,
    (result.corrections ?? {}) as Record<string, unknown>,
  );
  const asked = parseJson<string[]>(session.askedQuestionIds, []);

  let question = result.question ?? null;
  let state = result.state;

  // The model does not get to repeat itself.
  const repeated = Boolean(question && asked.includes(question.id));
  if (repeated) question = null;

  // Too few questions and the plan is generic; too many and it is a survey.
  if (state === 'READY_TO_GENERATE' && session.questionCount < MIN_QUESTIONS) {
    state = 'NEEDS_MORE_INFORMATION';
  }
  if (session.questionCount >= HARD_MAX_QUESTIONS) {
    state = 'READY_TO_GENERATE';
    question = null;
  }
  if (!question && state === 'NEEDS_MORE_INFORMATION') {
    // It wants to continue but produced nothing usable (or repeated itself).
    // Rather than stall the user, move on and build the plan from what we have.
    state = 'READY_TO_GENERATE';
  }

  const nextCount = question ? session.questionCount + 1 : session.questionCount;
  const nextAsked = question ? [...asked, question.id] : asked;
  const status = state === 'READY_TO_GENERATE' ? 'READY_TO_GENERATE' : 'INTERVIEWING';

  // A repeated question is suppressed above. Without this, its message was still
  // recorded and the user saw the same question twice with nothing to answer.
  const assistantMessage = repeated && state === 'READY_TO_GENERATE'
    ? "That's everything I need."
    : result.assistantMessage;

  await prisma.copilotMessage.create({
    data: {
      sessionId: session.id,
      role: 'assistant',
      content: assistantMessage,
      structuredPayload: question ? JSON.stringify(question) : null,
    },
  });

  const updated = await prisma.copilotSession.update({
    where: { id: session.id },
    data: {
      status,
      structuredContext: serializeContext(context),
      askedQuestionIds: JSON.stringify(nextAsked),
      questionCount: nextCount,
      category: result.category ?? session.category,
    },
  });

  return {
    sessionId: updated.id,
    status: updated.status,
    assistantMessage,
    question,
    questionCount: nextCount,
    estimatedTotal: Math.max(nextCount + (question ? 1 : 0), Math.min(RECOMMENDED_MAX_QUESTIONS, 5)),
    context: toPlainObject(context),
    provenance: describeProvenance(context),
    canGenerate: status === 'READY_TO_GENERATE',
  };
}

export async function startSession(userId: string, goalText: string): Promise<InterviewTurn> {
  const session = await prisma.copilotSession.create({
    data: {
      userId,
      initialGoalText: goalText.trim(),
      // goalIntent is written once here and is not rewritable by anything later.
      structuredContext: serializeContext(createContext(goalText.trim())),
      expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600_000),
      messages: { create: { role: 'user', content: goalText.trim() } },
    },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  await recordEvent({ userId, type: 'SESSION_STARTED', sessionId: session.id });

  const { result, preferences } = await runInterviewTurn(session);
  return applyTurn(session, result, preferences);
}

export async function answerQuestion(
  sessionId: string,
  userId: string,
  input: { questionId: string; answer?: unknown; skipped?: boolean },
): Promise<InterviewTurn> {
  const session = await loadSession(sessionId, userId);
  if (session.status !== 'INTERVIEWING' && session.status !== 'READY_TO_GENERATE') {
    throw badRequest('This session is no longer accepting answers', 'SESSION_CLOSED');
  }

  const answerText = input.skipped ? '(skipped)' : formatAnswer(input.answer);

  await prisma.copilotMessage.create({
    data: {
      sessionId: session.id,
      role: 'user',
      content: answerText,
      structuredPayload: JSON.stringify({ questionId: input.questionId, answer: input.answer }),
    },
  });

  // Record the literal answer at the highest authority there is. It does not
  // depend on the model choosing to extract it, and nothing weaker can overwrite
  // it. A later answer to the same question replaces the earlier one, so a
  // correction works without special-casing.
  if (!input.skipped && input.answer !== null && input.answer !== undefined) {
    const context = parseContext(session.structuredContext, session.initialGoalText);
    const askedQuestion = [...session.messages]
      .reverse()
      .map((m) => (m.structuredPayload ? safeParse(m.structuredPayload) : null))
      .find((p) => p?.id === input.questionId);

    recordAnswer(context, {
      key: input.questionId,
      questionId: input.questionId,
      question: askedQuestion?.prompt,
      value: input.answer,
    });
    await prisma.copilotSession.update({
      where: { id: session.id },
      data: { structuredContext: serializeContext(context) },
    });
  }

  const refreshed = await prisma.copilotSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  await recordEvent({ userId, type: 'QUESTION_ANSWERED', sessionId: session.id });

  const { result, preferences } = await runInterviewTurn(refreshed);
  return applyTurn(refreshed, result, preferences);
}

/** Human-readable rendering of a structured answer, for the transcript. */
export function formatAnswer(answer: unknown): string {
  if (Array.isArray(answer)) return answer.map((a) => String(a)).join(', ');
  if (answer === null || answer === undefined) return '(no answer)';
  return String(answer);
}

export async function cancelSession(sessionId: string, userId: string) {
  const session = await prisma.copilotSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound('Session not found');
  if (session.userId !== userId) throw forbidden();
  await prisma.copilotSession.update({ where: { id: sessionId }, data: { status: 'CANCELLED' } });
  await recordEvent({ userId, type: 'SESSION_CANCELLED', sessionId });
}

/** Unfinished sessions the user could pick back up. */
export async function resumableSessions(userId: string) {
  return prisma.copilotSession.findMany({
    where: {
      userId,
      status: { in: ['INTERVIEWING', 'READY_TO_GENERATE', 'DRAFT_GENERATED'] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      initialGoalText: true,
      status: true,
      questionCount: true,
      updatedAt: true,
    },
  });
}
