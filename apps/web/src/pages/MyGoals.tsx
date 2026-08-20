import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, PrivacyBadge, Skeleton, useAsync } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_EMOJI, CATEGORY_LABEL, type GoalSummary } from '../lib/types';

const TABS = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'ALL', label: 'All' },
] as const;

export default function MyGoals() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('ACTIVE');
  const { data, loading, error, reload } = useAsync(
    () => api.get<{ goals: GoalSummary[] }>(tab === 'ALL' ? '/goals' : `/goals?status=${tab}`),
    [tab],
  );

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: 800,
              fontSize: 'clamp(1.4rem, 2.5vw, 1.75rem)',
              color: '#1a1635',
              letterSpacing: '-0.02em',
            }}
          >
            My Goals
          </h1>
          <p style={{ color: '#8b88b0', fontSize: '0.9rem', marginTop: 4 }}>
            Everything you're working on, in one place.
          </p>
        </div>
        <Link to="/app/goals/new" className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm self-start">
          <Plus size={15} /> New Goal
        </Link>
      </div>

      <div className="flex gap-2 mb-6" role="tablist" aria-label="Filter goals">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-xl text-sm"
            style={{
              background: tab === t.key ? '#f0ebff' : '#fff',
              border: `1px solid ${tab === t.key ? '#ddd0ff' : '#e8e6f5'}`,
              color: tab === t.key ? '#7c3aed' : '#6b688f',
              fontWeight: 700,
              fontFamily: 'Plus Jakarta Sans',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton height={168} radius={16} />
          <Skeleton height={168} radius={16} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && data.goals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      ) : (
        <EmptyState
          emoji="🎯"
          title="Ready to start?"
          body="Create your first goal and turn it into a challenge."
          action={
            <Link to="/app/goals/new" className="btn-primary inline-block px-5 py-2.5 text-sm">
              Create Your First Goal
            </Link>
          }
        />
      )}
    </div>
  );
}

export function GoalCard({ goal }: { goal: GoalSummary }) {
  const remaining = Math.max(0, goal.todayRequired - goal.todayCompleted);

  return (
    <Link to={`/app/goals/${goal.id}`} className="card card-hover shadow-card p-5 block">
      <div className="flex items-start gap-3.5 mb-4">
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ width: 46, height: 46, fontSize: 20, background: '#f0ebff', border: '1px solid #ddd0ff' }}
          aria-hidden="true"
        >
          {CATEGORY_EMOJI[goal.category]}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="truncate"
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: 700,
              fontSize: '1rem',
              color: '#1a1635',
            }}
          >
            {goal.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span style={{ fontSize: '0.75rem', color: '#8b88b0' }}>
              {CATEGORY_LABEL[goal.category]}
            </span>
            <span style={{ color: '#ddd0ff' }}>·</span>
            <PrivacyBadge visibility={goal.visibility} />
          </div>
        </div>
        <span
          style={{
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: 800,
            fontSize: '1.05rem',
            color: '#7c3aed',
          }}
        >
          {Math.round(goal.progress)}%
        </span>
      </div>

      {goal.description && (
        <p
          className="mb-3.5 line-clamp-2"
          style={{ fontSize: '0.82rem', color: '#6b688f', lineHeight: 1.55 }}
        >
          {goal.description}
        </p>
      )}

      <div className="progress-bar-track mb-3" style={{ height: 6 }}>
        <div className="progress-bar-fill" style={{ width: `${goal.progress}%` }} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {goal.streak > 0 && (
          <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 700 }}>
            🔥 {goal.streak} {goal.streak === 1 ? 'day' : 'days'}
          </span>
        )}
        <span style={{ fontSize: '0.75rem', color: '#8b88b0' }}>
          {goal.todayRequired === 0
            ? 'No tasks today'
            : remaining === 0
              ? 'Today complete ✓'
              : `${remaining} ${remaining === 1 ? 'task' : 'tasks'} remaining`}
        </span>
        {goal.participantCount > 1 && (
          <span style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 600 }}>
            👥 {goal.participantCount}
          </span>
        )}
      </div>
    </Link>
  );
}
