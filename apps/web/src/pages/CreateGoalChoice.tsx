import { ArrowLeft, ArrowRight, PenLine, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Skeleton, useAsync } from '../components/ui';
import { api } from '../lib/api';
import type { CopilotStatus } from '../lib/types';

/**
 * The fork in the road for goal creation.
 *
 * Manual creation is always available and always complete on its own — the AI is
 * an option, never a requirement. If the Copilot is not configured, this screen
 * simply does not offer it.
 */
export default function CreateGoalChoice() {
  const navigate = useNavigate();
  const { data, loading } = useAsync(() => api.get<CopilotStatus>('/copilot/status'), []);

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <Link
        to="/app/goals"
        className="flex items-center gap-2 mb-6"
        style={{ color: '#8b88b0', fontSize: '0.875rem', fontWeight: 500 }}
      >
        <ArrowLeft size={15} /> Back to goals
      </Link>

      <h1
        style={{
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: 800,
          fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)',
          color: '#1a1635',
          letterSpacing: '-0.02em',
        }}
      >
        How would you like to create your goal?
      </h1>
      <p style={{ color: '#8b88b0', fontSize: '0.9rem', marginTop: 6, marginBottom: 26 }}>
        Both end up in the same place — pick whichever suits you.
      </p>

      {/* --------------------------------------------- resume an interview */}
      {!loading && data?.resumable?.length ? (
        <div className="mb-5">
          {data.resumable.slice(0, 2).map((session) => (
            <button
              key={session.id}
              onClick={() => navigate(`/app/goals/new/ai/${session.id}`)}
              className="card card-hover shadow-card w-full p-4 flex items-center gap-3 text-left mb-2"
              style={{ background: '#f0ebff', borderColor: '#ddd0ff' }}
            >
              <span style={{ fontSize: 20 }} aria-hidden="true">
                ⏳
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className="block truncate"
                  style={{
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    color: '#1a1635',
                  }}
                >
                  Continue “{session.initialGoalText}”
                </span>
                <span className="block" style={{ fontSize: '0.75rem', color: '#6b688f' }}>
                  {session.questionCount} question{session.questionCount === 1 ? '' : 's'} answered
                </span>
              </span>
              <ArrowRight size={16} style={{ color: '#7c3aed' }} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {loading ? (
          <Skeleton height={150} radius={16} />
        ) : data?.enabled ? (
          <button
            onClick={() => navigate('/app/goals/new/ai')}
            className="card card-hover shadow-card p-6 text-left"
            style={{ borderColor: '#ddd0ff' }}
          >
            <div className="flex items-start gap-4">
              <span
                className="flex items-center justify-center rounded-2xl flex-shrink-0"
                style={{
                  width: 52,
                  height: 52,
                  background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                  boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
                }}
              >
                <Sparkles size={24} color="white" />
              </span>
              <span className="flex-1">
                <span
                  className="block"
                  style={{
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    color: '#1a1635',
                  }}
                >
                  Create with AI
                </span>
                <span
                  className="block mt-1.5"
                  style={{ fontSize: '0.88rem', color: '#6b688f', lineHeight: 1.55 }}
                >
                  Tell your Copilot what you want to achieve. It asks a few questions, then
                  builds a plan around what you actually enjoy and when you're free.
                </span>
              </span>
              <ArrowRight size={18} style={{ color: '#7c3aed', marginTop: 4 }} />
            </div>
          </button>
        ) : null}

        <button
          onClick={() => navigate('/app/goals/new/manual')}
          className="card card-hover shadow-card p-6 text-left"
        >
          <div className="flex items-start gap-4">
            <span
              className="flex items-center justify-center rounded-2xl flex-shrink-0"
              style={{ width: 52, height: 52, background: '#f5f4ff', border: '1px solid #e8e6f5' }}
            >
              <PenLine size={22} style={{ color: '#6b688f' }} />
            </span>
            <span className="flex-1">
              <span
                className="block"
                style={{
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 800,
                  fontSize: '1.1rem',
                  color: '#1a1635',
                }}
              >
                Create manually
              </span>
              <span
                className="block mt-1.5"
                style={{ fontSize: '0.88rem', color: '#6b688f', lineHeight: 1.55 }}
              >
                Set the goal, tasks and schedule yourself. Full control, no questions asked.
              </span>
            </span>
            <ArrowRight size={18} style={{ color: '#b8b5d5', marginTop: 4 }} />
          </div>
        </button>
      </div>

      {!loading && !data?.enabled && (
        <p className="mt-5 text-center" style={{ fontSize: '0.8rem', color: '#b8b5d5' }}>
          The AI Copilot isn't configured on this server, so goals are created manually.
        </p>
      )}
    </div>
  );
}
