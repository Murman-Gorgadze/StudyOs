import { useState } from 'react';
import { ArrowRight, Plus, TrendingUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import TaskRow from '../components/TaskRow';
import { EmptyState, ErrorState, Skeleton, useAsync } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CATEGORY_EMOJI, type GoalSummary, type TodayResponse } from '../lib/types';

/**
 * Home answers "what should I do today?" before "what are my statistics?".
 * Today's tasks sit at the top and are completable in place — no need to open
 * each goal one at a time.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = useAsync(() => api.get<TodayResponse>('/today'), []);
  const goals = useAsync(() => api.get<{ goals: GoalSummary[] }>('/goals?status=ACTIVE'), []);

  // Kept locally so completing a task updates the header instantly.
  const [delta, setDelta] = useState(0);
  const [coinDelta, setCoinDelta] = useState(0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const summary = today.data?.summary;
  const completed = (summary?.completed ?? 0) + delta;
  const required = summary?.required ?? 0;
  const percent = required === 0 ? 0 : Math.round((completed / required) * 100);
  const remaining = Math.max(0, required - completed);
  const coinsToday = (summary?.coinsToday ?? 0) + coinDelta;

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <h1
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: 800,
              fontSize: 'clamp(1.4rem, 2.5vw, 1.75rem)',
              color: '#1a1635',
              marginBottom: 4,
              letterSpacing: '-0.02em',
            }}
          >
            {greeting}, {user?.name ?? 'there'} 👋
          </h1>
          <p style={{ color: '#8b88b0', fontSize: '0.9rem' }}>
            Ready to make some progress today?
          </p>
        </div>
        <Link to="/app/goals/new" className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm self-start">
          <Plus size={15} /> New Goal
        </Link>
      </div>

      {/* ---------------------------------------------- today's progress */}
      <div
        className="rounded-2xl p-5 sm:p-6 mb-6 shadow-card"
        style={{
          background: 'linear-gradient(135deg, #f0ebff 0%, #eff6ff 100%)',
          border: '1px solid #ddd0ff',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={13} color="white" />
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#6b688f',
                  fontFamily: 'Plus Jakarta Sans',
                  letterSpacing: '0.06em',
                }}
              >
                TODAY'S PROGRESS
              </span>
            </div>

            {today.loading ? (
              <Skeleton height={54} />
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3 flex-wrap">
                  <span
                    style={{
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: 900,
                      fontSize: '2.75rem',
                      color: '#1a1635',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {completed}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: 600,
                      fontSize: '1.3rem',
                      color: '#b8b5d5',
                    }}
                  >
                    /{required}
                  </span>
                  <span style={{ color: '#6b688f', fontSize: '0.9rem' }}>tasks completed</span>
                </div>
                <div className="progress-bar-track mb-2.5" style={{ height: 10 }}>
                  <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                </div>
                <p style={{ fontSize: '0.8rem', color: '#8b88b0' }}>
                  {required === 0
                    ? 'Nothing scheduled today — enjoy the rest day.'
                    : remaining === 0
                      ? "Every task done today. That's the whole list 🎉"
                      : `Complete ${remaining} more ${remaining === 1 ? 'task' : 'tasks'} to hit your daily goal 💪`}
                </p>
              </>
            )}
          </div>

          <div className="flex gap-6 sm:gap-8">
            {[
              { icon: '🪙', label: 'Coins today', value: String(coinsToday), valueColor: '#f59e0b' },
              { icon: '🔥', label: 'Day streak', value: String(summary?.streak ?? 0), valueColor: '#f97316' },
              { icon: '🎯', label: 'Goals', value: String(goals.data?.goals.length ?? 0), valueColor: '#7c3aed' },
            ].map(({ icon, label, value, valueColor }) => (
              <div key={label} className="text-center">
                <div style={{ fontSize: 22, marginBottom: 5 }} aria-hidden="true">
                  {icon}
                </div>
                <div
                  style={{
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: 900,
                    fontSize: '1.4rem',
                    color: valueColor,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {value}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#8b88b0', marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ------------------------------------------- today's tasks */}
        <div className="xl:col-span-2">
          <h2
            className="mb-4"
            style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontSize: '1rem', color: '#1a1635' }}
          >
            Today
          </h2>

          {today.loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton height={120} radius={16} />
              <Skeleton height={120} radius={16} />
            </div>
          ) : today.error ? (
            <ErrorState message={today.error} onRetry={today.reload} />
          ) : today.data && today.data.groups.length > 0 ? (
            <div className="flex flex-col gap-4">
              {today.data.groups.map((group) => (
                <div key={group.goalId} className="card shadow-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Link to={`/app/goals/${group.goalId}`} className="flex items-center gap-2 min-w-0">
                      <span style={{ fontSize: 17 }} aria-hidden="true">
                        {CATEGORY_EMOJI[group.category]}
                      </span>
                      <span
                        className="truncate"
                        style={{
                          fontFamily: 'Plus Jakarta Sans',
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          color: '#1a1635',
                        }}
                      >
                        {group.goalTitle}
                      </span>
                    </Link>
                    {group.streak > 0 && (
                      <span style={{ fontSize: '0.72rem', color: '#f97316', fontWeight: 700 }}>
                        🔥 {group.streak}d
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.tasks.map((task) => (
                      <TaskRow
                        key={task.occurrenceId}
                        task={task}
                        onChanged={(t, d) => {
                          setDelta((prev) => prev + d);
                          setCoinDelta((prev) => prev + d * t.reward);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              emoji="🎯"
              title="Ready to start?"
              body="Create your first goal and turn it into a challenge."
              action={
                <button className="btn-primary px-5 py-2.5 text-sm" onClick={() => navigate('/app/goals/new')}>
                  Create Your First Goal
                </button>
              }
            />
          )}

          {/* ------------------------------------------ active goals */}
          {goals.data && goals.data.goals.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-4 mt-8">
                <h2
                  style={{
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: 700,
                    fontSize: '1rem',
                    color: '#1a1635',
                  }}
                >
                  My Goals
                </h2>
                <Link
                  to="/app/goals"
                  className="flex items-center gap-1 text-sm"
                  style={{ color: '#7c3aed', fontWeight: 700, fontFamily: 'Plus Jakarta Sans' }}
                >
                  View all <ArrowRight size={13} />
                </Link>
              </div>
              <div className="flex flex-col gap-3">
                {goals.data.goals.slice(0, 3).map((goal) => (
                  <GoalRow key={goal.id} goal={goal} />
                ))}
                <Link
                  to="/app/goals/new"
                  className="card p-5 flex items-center justify-center gap-2 w-full card-hover shadow-card"
                  style={{ border: '1.5px dashed #ddd0ff', background: '#fdfcff' }}
                >
                  <Plus size={16} style={{ color: '#b8b5d5' }} />
                  <span
                    style={{
                      fontSize: '0.875rem',
                      color: '#8b88b0',
                      fontWeight: 700,
                      fontFamily: 'Plus Jakarta Sans',
                    }}
                  >
                    Create new goal
                  </span>
                </Link>
              </div>
            </>
          )}
        </div>

        {/* ------------------------------------------------- side column */}
        <div className="flex flex-col gap-5">
          <FriendActivity />
        </div>
      </div>
    </div>
  );
}

function GoalRow({ goal }: { goal: GoalSummary }) {
  return (
    <Link to={`/app/goals/${goal.id}`} className="card card-hover p-5 text-left shadow-card block">
      <div className="flex items-center gap-4">
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ width: 46, height: 46, fontSize: 20, background: '#f0ebff', border: '1px solid #ddd0ff' }}
          aria-hidden="true"
        >
          {CATEGORY_EMOJI[goal.category]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <span
              className="truncate"
              style={{
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: 700,
                fontSize: '0.95rem',
                color: '#1a1635',
              }}
            >
              {goal.title}
            </span>
            <span
              style={{
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: 800,
                fontSize: '0.9rem',
                color: '#7c3aed',
              }}
            >
              {Math.round(goal.progress)}%
            </span>
          </div>
          <div className="progress-bar-track mb-2" style={{ height: 5 }}>
            <div className="progress-bar-fill" style={{ width: `${goal.progress}%` }} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span style={{ fontSize: '0.72rem', color: '#8b88b0' }}>
              {goal.todayRequired === 0
                ? 'No tasks today'
                : `${Math.max(0, goal.todayRequired - goal.todayCompleted)} left today`}
            </span>
            {goal.streak > 0 && (
              <span style={{ fontSize: '0.72rem', color: '#f97316', fontWeight: 600 }}>
                🔥 {goal.streak}d
              </span>
            )}
            {goal.participantCount > 1 && (
              <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>
                👥 {goal.participantCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Lightweight friend activity — deliberately not a full social feed in Phase 1. */
function FriendActivity() {
  const { data, loading } = useAsync(
    () => api.get<{ friends: Array<{ id: string; name: string; avatarEmoji: string; currentStreak: number; sharedGoals: number }> }>('/friends'),
    [],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2
          style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontSize: '1rem', color: '#1a1635' }}
        >
          Friends
        </h2>
        <Link
          to="/app/friends"
          className="flex items-center gap-1 text-sm"
          style={{ color: '#7c3aed', fontWeight: 700, fontFamily: 'Plus Jakarta Sans' }}
        >
          View <ArrowRight size={13} />
        </Link>
      </div>

      <div className="card rounded-2xl p-4 shadow-card">
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton height={34} />
            <Skeleton height={34} />
          </div>
        ) : data && data.friends.length > 0 ? (
          data.friends.slice(0, 5).map((friend) => (
            <div key={friend.id} className="flex items-center gap-2.5 py-2">
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  width: 30,
                  height: 30,
                  fontSize: 14,
                  background: '#f5f4ff',
                  border: '1px solid #e8e6f5',
                }}
                aria-hidden="true"
              >
                {friend.avatarEmoji}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="truncate"
                  style={{ fontSize: '0.83rem', fontWeight: 600, color: '#1a1635' }}
                >
                  {friend.name}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#b8b5d5' }}>
                  {friend.sharedGoals > 0
                    ? `${friend.sharedGoals} shared ${friend.sharedGoals === 1 ? 'goal' : 'goals'}`
                    : 'No shared goals yet'}
                </div>
              </div>
              {friend.currentStreak > 0 && (
                <span style={{ fontSize: 11, color: '#f97316', fontWeight: 700 }}>
                  🔥{friend.currentStreak}
                </span>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-4">
            <div style={{ fontSize: 26 }} aria-hidden="true">
              👋
            </div>
            <p style={{ fontSize: '0.8rem', color: '#8b88b0', marginTop: 6 }}>
              Productivity is better together.
            </p>
            <Link
              to="/app/friends"
              className="btn-secondary inline-block mt-3 px-4 py-2"
              style={{ fontSize: '0.8rem' }}
            >
              Find friends
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
