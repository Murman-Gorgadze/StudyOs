import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Skeleton, useAsync } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_EMOJI, CATEGORY_LABEL, type Challenge, type GoalCategory } from '../lib/types';
import { EnterCodeCard } from './JoinByCode';

export default function Discover() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [category, setCategory] = useState<GoalCategory | 'ALL'>('ALL');

  const { data, loading, error, reload } = useAsync(() => {
    const params = new URLSearchParams();
    if (submitted) params.set('q', submitted);
    if (category !== 'ALL') params.set('category', category);
    const qs = params.toString();
    return api.get<{ challenges: Challenge[] }>(`/discover${qs ? `?${qs}` : ''}`);
  }, [submitted, category]);

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1
          style={{
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: 800,
            fontSize: 'clamp(1.4rem, 2.5vw, 1.75rem)',
            color: '#1a1635',
            letterSpacing: '-0.02em',
          }}
        >
          Find a challenge
        </h1>
        <p style={{ color: '#8b88b0', fontSize: '0.9rem', marginTop: 4 }}>
          Join people working toward the same goals.
        </p>
      </div>

      <div className="mb-5">
        <EnterCodeCard />
      </div>

      <form
        className="relative mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <Search
          size={17}
          className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: '#b8b5d5' }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search challenges"
          aria-label="Search challenges"
          className="w-full pl-11 pr-4 py-3 text-sm"
        />
      </form>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
        {(['ALL', ...(Object.keys(CATEGORY_LABEL) as GoalCategory[])] as const).map((key) => {
          const active = category === key;
          return (
            <button
              key={key}
              onClick={() => setCategory(key as GoalCategory | 'ALL')}
              aria-pressed={active}
              className="px-3.5 py-2 rounded-xl whitespace-nowrap"
              style={{
                background: active ? '#f0ebff' : '#fff',
                border: `1px solid ${active ? '#ddd0ff' : '#e8e6f5'}`,
                color: active ? '#7c3aed' : '#6b688f',
                fontWeight: 700,
                fontSize: '0.8rem',
                fontFamily: 'Plus Jakarta Sans',
              }}
            >
              {key === 'ALL' ? 'All' : `${CATEGORY_EMOJI[key]} ${CATEGORY_LABEL[key]}`}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton height={190} radius={16} />
          <Skeleton height={190} radius={16} />
          <Skeleton height={190} radius={16} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && data.challenges.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))}
        </div>
      ) : submitted || category !== 'ALL' ? (
        <EmptyState
          emoji="🔍"
          title="No challenges match that"
          body="Try a different search or category."
          action={
            <button
              className="btn-secondary px-5 py-2.5 text-sm"
              onClick={() => {
                setQuery('');
                setSubmitted('');
                setCategory('ALL');
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <EmptyState
          emoji="🌍"
          title="Find your next challenge."
          body="No public challenges yet. Create one and make it public so others can join."
          action={
            <Link to="/app/goals/new" className="btn-primary inline-block px-5 py-2.5 text-sm">
              Create a challenge
            </Link>
          }
        />
      )}
    </div>
  );
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const days = challenge.deadline
    ? Math.max(
        0,
        Math.round(
          (new Date(challenge.deadline).getTime() - new Date(challenge.startDate).getTime()) /
            86_400_000,
        ) + 1,
      )
    : null;

  return (
    <div className="card card-hover shadow-card p-5 flex flex-col">
      <div className="flex items-start gap-3 mb-3">
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ width: 42, height: 42, fontSize: 19, background: '#f0ebff', border: '1px solid #ddd0ff' }}
          aria-hidden="true"
        >
          {CATEGORY_EMOJI[challenge.category]}
        </div>
        <div className="min-w-0 flex-1">
          <h3
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: 700,
              fontSize: '0.98rem',
              color: '#1a1635',
              lineHeight: 1.35,
            }}
          >
            {challenge.title}
          </h3>
          <div style={{ fontSize: '0.72rem', color: '#8b88b0', marginTop: 2 }}>
            {CATEGORY_LABEL[challenge.category]}
          </div>
        </div>
      </div>

      <p
        className="mb-4 flex-1 line-clamp-3"
        style={{ fontSize: '0.83rem', color: '#6b688f', lineHeight: 1.55 }}
      >
        {challenge.description}
      </p>

      <div className="flex items-center gap-3 mb-4 flex-wrap" style={{ fontSize: '0.75rem', color: '#8b88b0' }}>
        <span className="flex items-center gap-1">
          <Users size={12} /> {challenge.participantCount.toLocaleString()}{' '}
          {challenge.participantCount === 1 ? 'participant' : 'participants'}
        </span>
        {days && <span>{days} days</span>}
      </div>

      <Link
        to={`/app/goals/${challenge.id}`}
        className={challenge.hasJoined ? 'btn-secondary' : 'btn-primary'}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '0.65rem 1rem',
          fontSize: '0.85rem',
        }}
      >
        {challenge.hasJoined ? 'Open Challenge' : 'View Challenge'}
      </Link>
    </div>
  );
}
