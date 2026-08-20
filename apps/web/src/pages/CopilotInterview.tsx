import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Send, Sparkles, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Modal, useToast } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { WEEKDAY_LABEL, type CopilotQuestion, type InterviewTurn } from '../lib/types';

interface Bubble {
  role: 'assistant' | 'user';
  text: string;
}

/**
 * The conversational goal builder.
 *
 * Deliberately not a chat clone: it is a guided interview inside the product's
 * own visual language, with quick-select answers, a visible sense of progress,
 * and an always-available way out.
 */
export default function CopilotInterview() {
  const { sessionId: resumeId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();

  const [starting, setStarting] = useState(!resumeId);
  const [goalText, setGoalText] = useState('');
  const [busy, setBusy] = useState(false);
  const [turn, setTurn] = useState<InterviewTurn | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles, busy]);

  // Resuming: rebuild the conversation the user left behind.
  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    api
      .get<{
        sessionId: string;
        status: string;
        initialGoalText: string;
        questionCount: number;
        canGenerate: boolean;
        context: Record<string, unknown>;
        draftId: string | null;
        messages: Array<{ role: string; content: string }>;
        question: CopilotQuestion | null;
      }>(`/copilot/goal-sessions/${resumeId}`)
      .then((data) => {
        if (cancelled) return;
        if (data.draftId) {
          navigate(`/app/goals/drafts/${data.draftId}`, { replace: true });
          return;
        }
        setBubbles(
          data.messages.map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            text: m.content,
          })),
        );
        setTurn({
          sessionId: data.sessionId,
          status: data.status,
          assistantMessage: '',
          question: data.question,
          questionCount: data.questionCount,
          estimatedTotal: Math.max(data.questionCount + 1, 5),
          context: data.context,
          canGenerate: data.canGenerate,
        });
        setStarting(false);
      })
      .catch((err: Error) => {
        push(err.message, 'error');
        navigate('/app/goals/new', { replace: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  function applyTurn(next: InterviewTurn) {
    setTurn(next);
    if (next.assistantMessage) {
      setBubbles((prev) => [...prev, { role: 'assistant', text: next.assistantMessage }]);
    }
  }

  async function begin() {
    const text = goalText.trim();
    if (text.length < 3) return;
    setBusy(true);
    setBubbles([{ role: 'user', text }]);
    try {
      const next = await api.post<InterviewTurn>('/copilot/goal-sessions', { goal: text });
      setStarting(false);
      applyTurn(next);
    } catch (err) {
      setBubbles([]);
      push(err instanceof ApiError ? err.message : 'Could not reach the Copilot', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function answer(value: unknown, label: string, skipped = false) {
    if (!turn?.question || busy) return;
    const questionId = turn.question.id;
    setBusy(true);
    setBubbles((prev) => [...prev, { role: 'user', text: label }]);
    setTurn({ ...turn, question: null });

    try {
      const next = await api.post<InterviewTurn>(
        `/copilot/goal-sessions/${turn.sessionId}/answers`,
        { questionId, answer: value, skipped },
      );
      applyTurn(next);
    } catch (err) {
      // The answer is kept server-side; let them retry rather than lose the thread.
      push(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
      setTurn(turn);
      setBubbles((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!turn) return;
    setGenerating(true);
    try {
      const { draft } = await api.post<{ draft: { id: string } }>(
        `/copilot/goal-sessions/${turn.sessionId}/generate`,
        {},
      );
      navigate(`/app/goals/drafts/${draft.id}`, { replace: true });
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not build the plan', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function cancel(discard: boolean) {
    if (turn && discard) {
      await api.del(`/copilot/goal-sessions/${turn.sessionId}`).catch(() => {});
    }
    navigate('/app/goals', { replace: true });
  }

  // ------------------------------------------------------- opening screen

  if (starting) {
    return (
      <div className="p-5 sm:p-6 lg:p-8 max-w-xl mx-auto">
        <button
          onClick={() => navigate('/app/goals/new')}
          className="flex items-center gap-2 mb-6"
          style={{ color: '#8b88b0', fontSize: '0.875rem', fontWeight: 500 }}
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div className="card shadow-card p-6 sm:p-7">
          <div className="flex items-center gap-2.5 mb-5">
            <span
              className="flex items-center justify-center rounded-xl"
              style={{
                width: 38,
                height: 38,
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                boxShadow: '0 4px 12px rgba(124,58,237,0.35)',
              }}
            >
              <Sparkles size={19} color="white" />
            </span>
            <span
              style={{
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: 800,
                fontSize: '1.05rem',
                color: '#1a1635',
              }}
            >
              Goal Copilot
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: 800,
              fontSize: '1.5rem',
              color: '#1a1635',
              letterSpacing: '-0.02em',
            }}
          >
            What would you like to achieve?
          </h1>
          <p style={{ color: '#8b88b0', fontSize: '0.88rem', marginTop: 6, marginBottom: 18 }}>
            Say it however you like. I'll ask a few questions before suggesting anything.
          </p>

          <textarea
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) begin();
            }}
            rows={3}
            autoFocus
            placeholder="I want to become more active and lose some weight."
            className="w-full px-4 py-3.5 text-sm resize-none"
            aria-label="Your goal"
          />

          <div className="flex flex-wrap gap-2 mt-3">
            {[
              'I want to read more books',
              'I want to get fitter',
              'I want to save money for a trip',
            ].map((example) => (
              <button
                key={example}
                onClick={() => setGoalText(example)}
                className="px-3 py-1.5 rounded-full"
                style={{
                  background: '#f5f4ff',
                  border: '1px solid #e8e6f5',
                  color: '#6b688f',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                {example}
              </button>
            ))}
          </div>

          <button
            className="btn-primary w-full mt-5 py-3.5 text-sm flex items-center justify-center gap-2"
            onClick={begin}
            disabled={busy || goalText.trim().length < 3}
            style={{ opacity: busy || goalText.trim().length < 3 ? 0.55 : 1 }}
          >
            {busy ? 'Thinking…' : 'Continue'} {!busy && <ArrowRight size={15} />}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------- interview

  const question = turn?.question ?? null;
  const progress = turn ? Math.min(100, (turn.questionCount / turn.estimatedTotal) * 100) : 0;

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-2xl mx-auto flex flex-col" style={{ minHeight: '100%' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className="flex items-center justify-center rounded-xl"
            style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
          >
            <Sparkles size={17} color="white" />
          </span>
          <span
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: 800,
              fontSize: '1rem',
              color: '#1a1635',
            }}
          >
            Goal Copilot
          </span>
        </div>
        <button
          onClick={() => setCancelOpen(true)}
          aria-label="Close Copilot"
          className="flex items-center justify-center rounded-lg"
          style={{ width: 34, height: 34, color: '#8b88b0', border: '1px solid #e8e6f5' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* progress */}
      <div className="flex items-center gap-3 mb-4">
        <div className="progress-bar-track flex-1" style={{ height: 5 }}>
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span style={{ fontSize: '0.72rem', color: '#8b88b0', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {turn?.questionCount ?? 0} of ~{turn?.estimatedTotal ?? 5}
        </span>
      </div>

      {/* transcript */}
      <div
        ref={scrollRef}
        className="card shadow-card flex-1 p-4 sm:p-5 overflow-y-auto"
        style={{ maxHeight: '52vh' }}
      >
        <div className="flex flex-col gap-3">
          {bubbles.map((bubble, index) => (
            <div
              key={index}
              className={bubble.role === 'user' ? 'self-end' : 'self-start'}
              style={{ maxWidth: '86%' }}
            >
              <div
                className="px-3.5 py-2.5 rounded-2xl animate-slide-up"
                style={{
                  background: bubble.role === 'user' ? '#7c3aed' : '#f5f4ff',
                  color: bubble.role === 'user' ? '#fff' : '#1a1635',
                  border: bubble.role === 'user' ? 'none' : '1px solid #e8e6f5',
                  fontSize: '0.88rem',
                  lineHeight: 1.55,
                  borderBottomRightRadius: bubble.role === 'user' ? 6 : 16,
                  borderBottomLeftRadius: bubble.role === 'user' ? 16 : 6,
                }}
              >
                {bubble.text}
              </div>
            </div>
          ))}

          {busy && (
            <div className="self-start">
              <div
                className="px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5"
                style={{ background: '#f5f4ff', border: '1px solid #e8e6f5' }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="rounded-full animate-float"
                    style={{
                      width: 6,
                      height: 6,
                      background: '#b8b5d5',
                      animationDelay: `${i * 0.15}s`,
                      animationDuration: '1s',
                    }}
                  />
                ))}
                <span style={{ fontSize: '0.78rem', color: '#8b88b0', marginLeft: 4 }}>
                  Thinking about the best next question…
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* answer area */}
      <div className="mt-4">
        {question ? (
          <QuestionInput question={question} disabled={busy} onAnswer={answer} />
        ) : turn?.canGenerate ? (
          <div className="card shadow-card p-5 text-center">
            <p style={{ fontSize: '0.9rem', color: '#4b4870', marginBottom: 14 }}>
              That's everything I need. Ready to see your plan?
            </p>
            <button
              className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2"
              onClick={generate}
              disabled={generating}
            >
              <Sparkles size={15} />
              {generating ? 'Building your plan…' : 'Build my plan'}
            </button>
          </div>
        ) : null}
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Leave the Copilot?"
        footer={
          <>
            <button className="btn-ghost px-4 py-2.5 text-sm" onClick={() => cancel(false)}>
              Save for later
            </button>
            <button
              className="btn-primary px-4 py-2.5 text-sm"
              style={{ background: '#c8253c', boxShadow: 'none' }}
              onClick={() => cancel(true)}
            >
              Discard
            </button>
          </>
        }
      >
        <p style={{ fontSize: '0.9rem', color: '#4b4870', lineHeight: 1.6 }}>
          Your answers are saved. You can pick this back up from the create-goal screen, or
          discard it entirely.
        </p>
      </Modal>
    </div>
  );
}

/** Renders whichever input the question type calls for. */
function QuestionInput({
  question,
  disabled,
  onAnswer,
}: {
  question: CopilotQuestion;
  disabled: boolean;
  onAnswer: (value: unknown, label: string, skipped?: boolean) => void;
}) {
  const [multi, setMulti] = useState<string[]>([]);
  const [text, setText] = useState('');

  // A new question means a fresh input.
  useEffect(() => {
    setMulti([]);
    setText('');
  }, [question.id]);

  const chip = (active: boolean) => ({
    background: active ? '#f0ebff' : '#fff',
    border: `1.5px solid ${active ? '#7c3aed' : '#e8e6f5'}`,
    color: active ? '#7c3aed' : '#4b4870',
    fontWeight: 600,
    fontSize: '0.85rem',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    minHeight: 44,
  });

  const skip = question.optional ? (
    <button
      className="btn-ghost px-4 py-2.5 text-sm"
      onClick={() => onAnswer(null, 'Skipped', true)}
      disabled={disabled}
    >
      Skip
    </button>
  ) : null;

  if (question.type === 'SINGLE_SELECT' || question.type === 'MULTI_SELECT') {
    const isMulti = question.type === 'MULTI_SELECT';
    return (
      <div className="card shadow-card p-4">
        <div className="flex flex-wrap gap-2">
          {(question.options ?? []).map((option) => {
            const active = multi.includes(option);
            return (
              <button
                key={option}
                aria-pressed={isMulti ? active : undefined}
                disabled={disabled}
                onClick={() => {
                  if (!isMulti) return onAnswer(option, option);
                  // Functional update: two quick taps must not overwrite each other.
                  setMulti((prev) =>
                    prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
                  );
                }}
                className="px-4 py-2.5 rounded-xl"
                style={chip(isMulti && active)}
              >
                {option}
              </button>
            );
          })}
        </div>

        {question.allowCustomAnswer && (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) onAnswer(text.trim(), text.trim());
            }}
            placeholder="Or type your own…"
            className="w-full px-4 py-2.5 text-sm mt-3"
            disabled={disabled}
          />
        )}

        <div className="flex gap-2 mt-3">
          {skip}
          {isMulti && (
            <button
              className="btn-primary flex-1 py-2.5 text-sm"
              disabled={disabled || (multi.length === 0 && !text.trim())}
              style={{ opacity: disabled || (multi.length === 0 && !text.trim()) ? 0.5 : 1 }}
              onClick={() => {
                const values = text.trim() ? [...multi, text.trim()] : multi;
                onAnswer(values, values.join(', '));
              }}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    );
  }

  if (question.type === 'DAYS_OF_WEEK') {
    return (
      <div className="card shadow-card p-4">
        <div className="flex gap-1.5 flex-wrap">
          {WEEKDAY_LABEL.map((label) => {
            const active = multi.includes(label);
            return (
              <button
                key={label}
                aria-pressed={active}
                disabled={disabled}
                onClick={() =>
                  setMulti((prev) =>
                    prev.includes(label) ? prev.filter((d) => d !== label) : [...prev, label],
                  )
                }
                className="rounded-xl"
                style={{ ...chip(active), width: 52 }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          {skip}
          <button
            className="btn-primary flex-1 py-2.5 text-sm"
            disabled={disabled || multi.length === 0}
            style={{ opacity: disabled || multi.length === 0 ? 0.5 : 1 }}
            onClick={() => onAnswer(multi, multi.join(', '))}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  const inputType =
    question.type === 'NUMBER' ? 'number' : question.type === 'DATE' ? 'date' : question.type === 'TIME' ? 'time' : 'text';

  return (
    <div className="card shadow-card p-4">
      <div className="flex gap-2">
        <input
          type={inputType}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) submit();
          }}
          placeholder={question.type === 'FREE_TEXT' ? 'Type your answer…' : ''}
          className="flex-1 px-4 py-3 text-sm"
          disabled={disabled}
          autoFocus
          aria-label={question.prompt}
        />
        <button
          className="btn-primary px-4 flex items-center justify-center"
          onClick={submit}
          disabled={disabled || !text.trim()}
          style={{ opacity: disabled || !text.trim() ? 0.5 : 1 }}
          aria-label="Send answer"
        >
          <Send size={16} />
        </button>
      </div>
      {skip && <div className="mt-3">{skip}</div>}
    </div>
  );

  function submit() {
    if (!text.trim()) return;
    const value = question.type === 'NUMBER' ? Number(text) : text.trim();
    onAnswer(value, String(text).trim());
  }
}
