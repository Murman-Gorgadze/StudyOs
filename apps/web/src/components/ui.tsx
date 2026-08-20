import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';

// Primitives shared across every screen. Colours, radii and shadows all come
// from the tokens in index.css so nothing here invents new styling.

export function ProgressBar({ value, height = 8 }: { value: number; height?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="progress-bar-track w-full"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-bar-fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function ProgressCircle({
  value,
  size = 72,
  stroke = 7,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#ede9f8" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#goalify-progress)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (clamped / 100) * circumference}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)' }}
        />
        <defs>
          <linearGradient id="goalify-progress" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: { background: '#f5f4ff', color: '#6b688f', border: '#e8e6f5' },
    primary: { background: '#f0ebff', color: '#7c3aed', border: '#ddd0ff' },
    success: { background: '#e8f9f0', color: '#0f9d58', border: '#c6f0dc' },
    warning: { background: '#fff5e6', color: '#b26a00', border: '#ffe3b8' },
    danger: { background: '#ffeef0', color: '#c8253c', border: '#ffd3d9' },
  }[tone];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
      style={{
        background: tones.background,
        color: tones.color,
        border: `1px solid ${tones.border}`,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >
      {children}
    </span>
  );
}

export function StreakBadge({ days, size = 'md' }: { days: number; size?: 'sm' | 'md' }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        color: '#f97316',
        fontWeight: 700,
        fontSize: size === 'sm' ? 11 : 13,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
      title={`${days} day streak`}
    >
      <span aria-hidden="true">🔥</span>
      {days} {size === 'sm' ? '' : days === 1 ? 'day' : 'days'}
    </span>
  );
}

export function PrivacyBadge({ visibility }: { visibility: 'PRIVATE' | 'PUBLIC' }) {
  return visibility === 'PRIVATE' ? (
    <Badge tone="neutral">🔒 Private</Badge>
  ) : (
    <Badge tone="primary">🌍 Public</Badge>
  );
}

export function Avatar({
  emoji,
  size = 38,
  ring = false,
}: {
  emoji: string;
  size?: number;
  ring?: boolean;
}) {
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
        fontSize: size * 0.45,
        boxShadow: ring ? '0 0 0 3px #ddd0ff' : undefined,
      }}
      aria-hidden="true"
    >
      {emoji}
    </div>
  );
}

export function AvatarGroup({ people, max = 4 }: { people: Array<{ avatarEmoji: string; name: string }>; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <div key={p.name + i} style={{ marginLeft: i === 0 ? 0 : -10 }} title={p.name}>
          <div style={{ boxShadow: '0 0 0 2px #fff', borderRadius: 999 }}>
            <Avatar emoji={p.avatarEmoji} size={28} />
          </div>
        </div>
      ))}
      {extra > 0 && (
        <span
          className="flex items-center justify-center rounded-full"
          style={{
            marginLeft: -10,
            width: 28,
            height: 28,
            background: '#f0ebff',
            color: '#7c3aed',
            border: '2px solid #fff',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

export function EmptyState({
  emoji,
  title,
  body,
  action,
}: {
  emoji: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="card shadow-card flex flex-col items-center text-center px-6 py-12">
      <div style={{ fontSize: 44 }} aria-hidden="true">
        {emoji}
      </div>
      <h3 className="mt-3" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1a1635' }}>
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm" style={{ fontSize: '.9rem', color: '#6b688f', lineHeight: 1.6 }}>
        {body}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', radius = 10 }: { height?: number; width?: string | number; radius?: number }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        background: 'linear-gradient(90deg, #f0ebff 25%, #e8e6f5 37%, #f0ebff 63%)',
        backgroundSize: '400% 100%',
        animation: 'shimmer 1.4s ease infinite',
      }}
      aria-hidden="true"
    />
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card shadow-card px-6 py-10 text-center" role="alert">
      <div style={{ fontSize: 34 }} aria-hidden="true">
        ⚠️
      </div>
      <p className="mt-2" style={{ fontWeight: 700, color: '#1a1635' }}>
        {message}
      </p>
      {onRetry && (
        <button className="btn-secondary mt-4 px-4 py-2" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(26,22,53,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="card shadow-card-lg w-full sm:max-w-lg max-h-[85vh] overflow-y-auto animate-slide-up"
        style={{ borderRadius: '20px 20px 0 0' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-4"
          style={{ background: '#fff', borderBottom: '1px solid #e8e6f5' }}
        >
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1a1635' }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-lg"
            style={{ width: 32, height: 32, color: '#6b688f' }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-4 flex gap-3 justify-end" style={{ borderTop: '1px solid #e8e6f5' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- toasts

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'reward';
}

const ToastContext = createContext<{ push: (message: string, tone?: Toast['tone']) => void } | null>(
  null,
);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed z-[200] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-bounce-in px-4 py-2.5 rounded-xl shadow-card-lg flex items-center gap-2"
            style={{
              background: toast.tone === 'error' ? '#ffeef0' : '#1a1635',
              color: toast.tone === 'error' ? '#c8253c' : '#fff',
              border: toast.tone === 'error' ? '1px solid #ffd3d9' : 'none',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 700,
              fontSize: '.85rem',
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

// ------------------------------------------------------------------- fetching

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading, reload: () => setNonce((n) => n + 1), setData };
}
