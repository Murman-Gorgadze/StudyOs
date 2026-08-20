import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Skeleton, useAsync, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Notification } from '../lib/types';

const ICONS: Record<Notification['type'], string> = {
  REMINDER: '⏰',
  FRIEND: '👥',
  PROGRESS: '📈',
  LEADERBOARD: '🏆',
  ACHIEVEMENT: '🎖️',
};

const SETTINGS = [
  { key: 'taskReminders', label: 'Task reminders' },
  { key: 'friendActivity', label: 'Friend activity' },
  { key: 'leaderboardUpdates', label: 'Leaderboard updates' },
  { key: 'achievements', label: 'Achievements' },
] as const;

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export default function Notifications() {
  const { data, loading, error, reload } = useAsync(
    () => api.get<{ notifications: Notification[]; unread: number }>('/notifications'),
    [],
  );

  // Opening this page is the read receipt.
  useEffect(() => {
    if (data && data.unread > 0) {
      api.post('/notifications/read').catch(() => {});
    }
  }, [data]);

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <h1
        className="mb-6"
        style={{
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: 800,
          fontSize: 'clamp(1.4rem, 2.5vw, 1.75rem)',
          color: '#1a1635',
          letterSpacing: '-0.02em',
        }}
      >
        Notifications
      </h1>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton height={68} radius={16} />
          <Skeleton height={68} radius={16} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && data.notifications.length > 0 ? (
        <div className="flex flex-col gap-2 mb-9">
          {data.notifications.map((n) => {
            const body = (
              <div
                className="card shadow-card flex items-start gap-3 p-4"
                style={{
                  background: n.readAt ? '#fff' : '#fdfcff',
                  borderColor: n.readAt ? '#e8e6f5' : '#ddd0ff',
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }} aria-hidden="true">
                  {ICONS[n.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    style={{
                      fontSize: '0.88rem',
                      color: '#1a1635',
                      fontWeight: n.readAt ? 500 : 700,
                      fontFamily: 'Plus Jakarta Sans',
                    }}
                  >
                    {n.title}
                  </div>
                  {n.body && (
                    <div style={{ fontSize: '0.8rem', color: '#6b688f', marginTop: 2 }}>{n.body}</div>
                  )}
                  <div style={{ fontSize: '0.72rem', color: '#b8b5d5', marginTop: 3 }}>
                    {timeAgo(n.createdAt)}
                  </div>
                </div>
                {!n.readAt && (
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{ width: 8, height: 8, background: '#7c3aed', marginTop: 6 }}
                    aria-label="Unread"
                  />
                )}
              </div>
            );

            return n.data.goalId ? (
              <Link key={n.id} to={`/app/goals/${n.data.goalId}`}>
                {body}
              </Link>
            ) : (
              <div key={n.id}>{body}</div>
            );
          })}
        </div>
      ) : (
        <div className="mb-9">
          <EmptyState
            emoji="🔔"
            title="Nothing yet"
            body="Reminders, friend activity and achievements will show up here."
          />
        </div>
      )}

      <NotificationSettings />
    </div>
  );
}

function NotificationSettings() {
  const { user, setUser } = useAuth();
  const { push } = useToast();
  if (!user) return null;

  async function toggle(key: (typeof SETTINGS)[number]['key']) {
    const next = !user!.notifications[key];
    try {
      const result = await api.patch<{ user: typeof user }>('/profile', {
        notifications: { [key]: next },
      });
      if (result.user) setUser(result.user);
    } catch {
      push('Could not save that setting', 'error');
    }
  }

  return (
    <section>
      <h2
        className="mb-3"
        style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontSize: '1rem', color: '#1a1635' }}
      >
        Notification settings
      </h2>
      <div className="card shadow-card p-2">
        {SETTINGS.map(({ key, label }) => {
          const on = user.notifications[key];
          return (
            <div key={key} className="flex items-center justify-between px-3 py-3">
              <span style={{ fontSize: '0.88rem', color: '#1a1635' }}>{label}</span>
              <button
                role="switch"
                aria-checked={on}
                aria-label={label}
                onClick={() => toggle(key)}
                className="relative rounded-full flex-shrink-0"
                style={{
                  width: 44,
                  height: 26,
                  background: on ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : '#ede9f8',
                  transition: 'background .18s',
                }}
              >
                <span
                  className="absolute rounded-full"
                  style={{
                    width: 20,
                    height: 20,
                    top: 3,
                    left: on ? 21 : 3,
                    background: '#fff',
                    transition: 'left .18s',
                    boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
