import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { ToastProvider } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import MyGoals from './pages/MyGoals';
import CreateGoal from './pages/CreateGoal';
import GoalDetail from './pages/GoalDetail';
import Discover from './pages/Discover';
import Friends from './pages/Friends';
import Leaderboard from './pages/Leaderboard';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Rewards from './pages/Rewards';
import JoinByCode from './pages/JoinByCode';
import CreateGoalChoice from './pages/CreateGoalChoice';
import CopilotInterview from './pages/CopilotInterview';
import DraftReview from './pages/DraftReview';

function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center h-screen" style={{ background: '#f5f4ff' }}>
      <div
        className="animate-float"
        style={{ fontSize: 36 }}
        role="status"
        aria-label="Loading"
      >
        ⚡
      </div>
    </div>
  );
}

/** Gate for everything behind sign-in. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Signed-in users should not sit on the landing or auth screens. */
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<RedirectIfAuthed><Landing /></RedirectIfAuthed>} />
            <Route path="/login" element={<RedirectIfAuthed><Auth mode="login" /></RedirectIfAuthed>} />
            <Route path="/register" element={<RedirectIfAuthed><Auth mode="register" /></RedirectIfAuthed>} />

            {/* Public: a shared invite link must open for signed-out visitors too. */}
            <Route path="/join/:code" element={<JoinByCode />} />

            <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="goals" element={<MyGoals />} />
              {/* Manual creation stays reachable on its own path — AI is optional. */}
              <Route path="goals/new" element={<CreateGoalChoice />} />
              <Route path="goals/new/manual" element={<CreateGoal />} />
              <Route path="goals/new/ai" element={<CopilotInterview />} />
              <Route path="goals/new/ai/:sessionId" element={<CopilotInterview />} />
              <Route path="goals/drafts/:id" element={<DraftReview />} />
              <Route path="goals/:id" element={<GoalDetail />} />
              <Route path="discover" element={<Discover />} />
              <Route path="friends" element={<Friends />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
              <Route path="profile/:id" element={<Profile />} />
              <Route path="rewards" element={<Rewards />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
