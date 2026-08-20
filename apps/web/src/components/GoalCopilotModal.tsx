import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal, useToast } from './ui';
import { ApiError, api } from '../lib/api';
import type { GoalCopilotAnswer } from '../lib/types';

const QUICK_ASKS = [
  'Make this easier',
  'Why am I falling behind?',
  'Give me one more rest day',
  'How am I doing?',
];

/**
 * Ask the Copilot about a goal that already exists.
 *
 * It explains and *proposes*. Nothing is applied automatically: changing a live
 * schedule affects future occurrences and the user's streak, so any change is a
 * separate, explicit decision. Past history is never rewritten.
 */
export default function GoalCopilotModal({
  goalId,
  goalTitle,
  open,
  onClose,
}: {
  goalId: string;
  goalTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const { push } = useToast();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GoalCopilotAnswer | null>(null);

  async function ask(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const answer = await api.post<GoalCopilotAnswer>(`/goals/${goalId}/copilot`, {
        message: text.trim(),
      });
      setResult(answer);
      setMessage('');
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'The Copilot could not answer', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Ask Copilot about ${goalTitle}`}>
      {result && (
        <>
          <div
            className="mb-4 px-4 py-3.5 rounded-xl"
            style={{ background: '#f0ebff', border: '1px solid #ddd0ff' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} style={{ color: '#7c3aed' }} />
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#7c3aed',
                  fontFamily: 'Plus Jakarta Sans',
                  letterSpacing: '0.05em',
                }}
              >
                COPILOT
              </span>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#1a1635', lineHeight: 1.6 }}>
              {result.analysis.explanation}
            </p>
          </div>

          {/* The numbers come from the app, not the model. */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              {
                label: `Last ${result.summary.periodDays} days`,
                value: `${Math.round(result.summary.completionRate * 100)}%`,
              },
              { label: 'Streak', value: `🔥 ${result.summary.currentStreak}` },
              {
                label: 'Done',
                value: `${result.summary.completedTaskOccurrences}/${result.summary.eligibleTaskOccurrences}`,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl px-2 py-2.5 text-center"
                style={{ background: '#f5f4ff', border: '1px solid #e8e6f5' }}
              >
                <div
                  style={{
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    color: '#1a1635',
                  }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#8b88b0', marginTop: 2 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {result.analysis.suggestions.length > 0 && (
            <div className="mb-4">
              <div
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#6b688f',
                  letterSpacing: '0.05em',
                  fontFamily: 'Plus Jakarta Sans',
                  marginBottom: 8,
                }}
              >
                SUGGESTIONS
              </div>
              <div className="flex flex-col gap-2">
                {result.analysis.suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="px-3.5 py-3 rounded-xl"
                    style={{ background: '#fff', border: '1px solid #e8e6f5' }}
                  >
                    <p style={{ fontSize: '0.85rem', color: '#1a1635', lineHeight: 1.5 }}>
                      {s.summary}
                    </p>
                    {s.taskTitle && (
                      <p style={{ fontSize: '0.72rem', color: '#b8b5d5', marginTop: 3 }}>
                        {s.taskTitle}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3" style={{ fontSize: '0.75rem', color: '#b8b5d5', lineHeight: 1.5 }}>
                These are suggestions only — nothing has changed. Edit the goal yourself if you
                want to apply one. Your past history is never rewritten.
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        {QUICK_ASKS.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            disabled={busy}
            className="px-3 py-1.5 rounded-full"
            style={{
              background: '#f5f4ff',
              border: '1px solid #e8e6f5',
              color: '#6b688f',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        placeholder="Ask anything about this goal…"
        className="w-full px-4 py-3 text-sm resize-none"
      />

      <button
        className="btn-primary w-full mt-3 py-3 text-sm"
        onClick={() => ask(message)}
        disabled={busy || !message.trim()}
        style={{ opacity: busy || !message.trim() ? 0.5 : 1 }}
      >
        {busy ? 'Looking at your progress…' : 'Ask'}
      </button>
    </Modal>
  );
}
