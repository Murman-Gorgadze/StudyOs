import { useState } from 'react';
import { Check, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from './ui';
import type { TodayTask } from '../lib/types';

/**
 * A single completable task. Completion is optimistic so the tap feels instant,
 * and rolls back if the server rejects it.
 *
 * State is never signalled by colour alone: a completed task gets a check glyph,
 * strikethrough text and an accessible pressed state as well as the tint.
 */
export default function TaskRow({
  task,
  onChanged,
}: {
  task: TodayTask;
  onChanged?: (task: TodayTask, delta: number) => void;
}) {
  const [status, setStatus] = useState(task.status);
  const [busy, setBusy] = useState(false);
  const [justEarned, setJustEarned] = useState<number | null>(null);
  const { push } = useToast();

  const completed = status === 'COMPLETED';

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = completed ? 'PENDING' : 'COMPLETED';
    setStatus(next);

    try {
      if (next === 'COMPLETED') {
        const result = await api.post<{ reward: number; unlocked?: string[] }>(
          `/task-occurrences/${task.occurrenceId}/complete`,
        );
        if (result.reward > 0) {
          setJustEarned(result.reward);
          setTimeout(() => setJustEarned(null), 700);
        }
        push(result.reward > 0 ? `Nice! +${result.reward} 🪙` : 'Nice!');
        onChanged?.({ ...task, status: 'COMPLETED' }, 1);
      } else {
        await api.post(`/task-occurrences/${task.occurrenceId}/undo`);
        onChanged?.({ ...task, status: 'PENDING' }, -1);
      }
    } catch (err) {
      setStatus(task.status);
      push(err instanceof Error ? err.message : 'Could not update that task', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={completed}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all"
      style={{
        background: completed ? '#f5f4ff' : '#fff',
        border: `1px solid ${completed ? '#e8e6f5' : '#e8e6f5'}`,
        opacity: busy ? 0.75 : 1,
        cursor: busy ? 'wait' : 'pointer',
        // Comfortable touch target on mobile.
        minHeight: 52,
      }}
    >
      <span
        className={`flex items-center justify-center rounded-full flex-shrink-0 ${completed ? 'animate-check-in' : ''}`}
        style={{
          width: 24,
          height: 24,
          background: completed ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'transparent',
          border: completed ? 'none' : '2px solid #ddd0ff',
          color: '#fff',
        }}
        aria-hidden="true"
      >
        {completed && <Check size={14} strokeWidth={3.5} />}
      </span>

      <span className="flex-1 min-w-0">
        <span
          className="block truncate"
          style={{
            fontSize: '0.9rem',
            fontWeight: completed ? 500 : 600,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            color: completed ? '#8b88b0' : '#1a1635',
            textDecoration: completed ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </span>
        {task.reminderTime && (
          <span
            className="flex items-center gap-1 mt-0.5"
            style={{ fontSize: '0.7rem', color: '#b8b5d5' }}
          >
            <Clock size={10} /> {task.reminderTime}
          </span>
        )}
      </span>

      <span className="relative flex-shrink-0">
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b' }}>
          +{task.reward}🪙
        </span>
        {justEarned !== null && (
          <span
            className="absolute right-0 -top-1 animate-coin-pop pointer-events-none"
            style={{ fontSize: '0.8rem', fontWeight: 800, color: '#f59e0b' }}
          >
            +{justEarned}
          </span>
        )}
      </span>

      <span className="sr-only">{completed ? 'Completed' : 'Not completed'}</span>
    </button>
  );
}
