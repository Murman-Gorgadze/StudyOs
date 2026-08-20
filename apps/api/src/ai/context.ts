// The Copilot's session context, with provenance.
//
// A flat blob of key/values made precedence a matter of whichever write happened
// last, and led to a real failure: a remembered "likes walking" overwrote an
// answer of "dancing". Every value now carries where it came from, and precedence
// is decided by that source — deterministically, in code, never by the model.
//
//   CURRENT_USER_ANSWER        a literal answer to a question we asked
//   CURRENT_USER_MESSAGE       something they typed in their own words
//   CURRENT_SESSION_INFERENCE  the model inferred it from this conversation
//   LONG_TERM_MEMORY           a hint from a previous, unrelated goal
//   MODEL_INFERENCE            the model's own guess
//
// Earlier sources win. Same source: the later statement wins, so a correction
// ("actually, I meant swimming") replaces the earlier answer rather than being
// rejected as a duplicate.

export const CONTEXT_SOURCES = [
  'CURRENT_USER_ANSWER',
  'CURRENT_USER_MESSAGE',
  'CURRENT_SESSION_INFERENCE',
  'LONG_TERM_MEMORY',
  'MODEL_INFERENCE',
] as const;
export type ContextSource = (typeof CONTEXT_SOURCES)[number];

/**
 * Lower rank wins.
 *
 * A literal answer and something the user typed are the SAME authority: both are
 * the user speaking, so the later statement is what they mean. That is what makes
 * "actually, I meant swimming" work — without it, a correction typed as free text
 * would be permanently outranked by the answer it was correcting.
 */
const RANKS: Record<ContextSource, number> = {
  CURRENT_USER_ANSWER: 0,
  CURRENT_USER_MESSAGE: 0,
  CURRENT_SESSION_INFERENCE: 1,
  LONG_TERM_MEMORY: 2,
  MODEL_INFERENCE: 3,
};

export function rankOf(source: ContextSource): number {
  return RANKS[source];
}

export interface ContextEntry {
  value: unknown;
  source: ContextSource;
  /** The question this answered, when the source is a literal answer. */
  questionId?: string;
  /** The wording the user actually saw, for the audit trail. */
  question?: string;
  confidence?: number;
  at: string;
}

export interface CopilotContext {
  version: 2;
  /**
   * What the user asked for, in their words. Set once at session start and never
   * rewritable — no preference or inference may redefine the goal itself.
   */
  goalIntent: string;
  entries: Record<string, ContextEntry>;
}

export const RESERVED_KEYS = ['goalIntent', 'answers', 'version', 'entries'];

export function createContext(goalIntent: string): CopilotContext {
  return { version: 2, goalIntent: goalIntent.trim(), entries: {} };
}

/**
 * Read whatever is stored, including contexts written before provenance existed.
 * Older flat blobs are treated as session inferences, which is the weakest
 * plausible claim about where they came from.
 */
export function parseContext(raw: string, goalIntent: string): CopilotContext {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    return createContext(goalIntent);
  }
  if (!parsed || typeof parsed !== 'object') return createContext(goalIntent);

  const candidate = parsed as Partial<CopilotContext> & Record<string, unknown>;
  if (candidate.version === 2 && candidate.entries) {
    return {
      version: 2,
      goalIntent: candidate.goalIntent || goalIntent,
      entries: candidate.entries as Record<string, ContextEntry>,
    };
  }

  const migrated = createContext(goalIntent);
  const at = new Date(0).toISOString();
  for (const [key, value] of Object.entries(candidate)) {
    if (RESERVED_KEYS.includes(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    migrated.entries[key] = { value, source: 'CURRENT_SESSION_INFERENCE', at };
  }
  return migrated;
}

export function serializeContext(context: CopilotContext): string {
  return JSON.stringify(context);
}

/**
 * Write one value, honouring precedence.
 *
 * Returns whether the write actually landed, so callers can tell the difference
 * between "stored" and "silently ignored because something stronger holds it".
 */
export function putEntry(
  context: CopilotContext,
  key: string,
  entry: Omit<ContextEntry, 'at'> & { at?: string },
): boolean {
  if (RESERVED_KEYS.includes(key)) return false;
  if (entry.value === null || entry.value === undefined || entry.value === '') return false;

  const at = entry.at ?? new Date().toISOString();
  const existing = context.entries[key];

  if (existing) {
    const existingRank = rankOf(existing.source);
    const incomingRank = rankOf(entry.source);
    // A weaker source never overwrites a stronger one.
    if (incomingRank > existingRank) return false;
    // Same authority: the more recent statement wins, so corrections apply.
    if (incomingRank === existingRank && at < existing.at) return false;
  }

  context.entries[key] = { ...entry, at };
  return true;
}

/** Record a literal answer. The highest authority there is. */
export function recordAnswer(
  context: CopilotContext,
  input: { key: string; questionId: string; question?: string; value: unknown },
): boolean {
  return putEntry(context, input.key, {
    value: input.value,
    source: 'CURRENT_USER_ANSWER',
    questionId: input.questionId,
    question: input.question,
  });
}

/**
 * Merge what the model claims it extracted this turn.
 *
 * Anything that merely repeats a memory hint we injected is discarded: the model
 * reading its own prompt back is not the user saying something. Everything else
 * enters as a session inference, which loses to any literal answer on the same key.
 */
export function applyModelExtraction(
  context: CopilotContext,
  extracted: Record<string, unknown> | undefined,
  injectedMemory: Array<{ key: string; value: string }> = [],
  corrections: Record<string, unknown> = {},
): { applied: string[]; rejected: string[] } {
  const applied: string[] = [];
  const rejected: string[] = [];

  const parroted = new Set(
    injectedMemory.map((m) => `${m.key}=${String(m.value).trim().toLowerCase()}`),
  );
  const memoryKeys = new Set(injectedMemory.map((m) => m.key));
  const spokenTo = (key: string) => {
    const existing = context.entries[key];
    return existing ? rankOf(existing.source) === 0 : false;
  };

  // An explicit correction is the user speaking again, so it enters at user
  // authority and supersedes the earlier statement by recency.
  for (const [key, value] of Object.entries(corrections)) {
    if (RESERVED_KEYS.includes(key)) {
      rejected.push(key);
      continue;
    }
    const ok = putEntry(context, key, { value, source: 'CURRENT_USER_MESSAGE' });
    (ok ? applied : rejected).push(key);
  }

  for (const [key, value] of Object.entries(extracted ?? {})) {
    if (key in corrections) continue;
    if (RESERVED_KEYS.includes(key)) {
      rejected.push(key);
      continue;
    }
    // Reading an injected hint back to us is not the user saying it.
    if (parroted.has(`${key}=${String(value).trim().toLowerCase()}`)) {
      rejected.push(key);
      continue;
    }
    // Nor is mutating one: if the hints mentioned preferred_activity and the user
    // has never spoken to that key, the model does not get to fill it in.
    if (memoryKeys.has(key) && !spokenTo(key)) {
      rejected.push(key);
      continue;
    }
    const ok = putEntry(context, key, { value, source: 'CURRENT_SESSION_INFERENCE' });
    (ok ? applied : rejected).push(key);
  }
  return { applied, rejected };
}

/** Memory hints enter the context explicitly, at the weakest useful authority. */
export function applyMemoryHints(
  context: CopilotContext,
  memory: Array<{ key: string; value: string; confidence?: number }>,
): void {
  for (const hint of memory) {
    putEntry(context, hint.key, {
      value: hint.value,
      source: 'LONG_TERM_MEMORY',
      confidence: hint.confidence,
    });
  }
}

// ------------------------------------------------------------------ reading

/** Plain key → value, for anything that just needs the current picture. */
export function toPlainObject(context: CopilotContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(context.entries)) out[key] = entry.value;
  return out;
}

/** Only what the user literally answered — the ground truth for plan generation. */
export function literalAnswers(context: CopilotContext) {
  return Object.entries(context.entries)
    .filter(([, entry]) => entry.source === 'CURRENT_USER_ANSWER')
    .map(([key, entry]) => ({
      key,
      questionId: entry.questionId,
      question: entry.question,
      value: entry.value,
    }));
}

/** Everything the user said this session, answers and free text alike. */
export function currentSessionFacts(context: CopilotContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(context.entries)) {
    if (entry.source === 'CURRENT_USER_ANSWER' || entry.source === 'CURRENT_USER_MESSAGE') {
      out[key] = entry.value;
    }
  }
  return out;
}

/** Values that came from anywhere weaker — useful, but not something they said. */
export function inferredValues(context: CopilotContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(context.entries)) {
    if (entry.source === 'CURRENT_SESSION_INFERENCE' || entry.source === 'MODEL_INFERENCE') {
      out[key] = entry.value;
    }
  }
  return out;
}

/** Provenance dump, for debugging and for the harness's integrity assertions. */
export function describeProvenance(context: CopilotContext) {
  return Object.entries(context.entries).map(([key, entry]) => ({
    key,
    value: entry.value,
    source: entry.source,
    questionId: entry.questionId ?? null,
  }));
}
