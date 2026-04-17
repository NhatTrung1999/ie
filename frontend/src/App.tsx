import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { NotFoundScreen } from '@/components/common/not-found-screen';
import { UNAUTHORIZED_EVENT } from '@/lib/api-client';
import { isElectron } from '@/lib/electron-bridge';
import { DashboardPage } from '@/pages/dashboard-page';
import { LoginPage } from '@/pages/login-page';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  bootstrapSession,
  signIn,
  signOut,
} from '@/store/slices/auth-slice';

function App() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isAuthenticated, isBootstrapping, sessionUser } = useAppSelector(
    (state) => state.auth,
  );
  const offline = isElectron();

  useEffect(() => {
    void dispatch(bootstrapSession());
  }, [dispatch]);

  useEffect(() => {
    // Offline mode: không có JWT nên bỏ qua handler 401
    if (offline) return;

    const handleUnauthorized = () => {
      dispatch(signOut());
      navigate('/login', { replace: true });
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [dispatch, navigate, offline]);

  const handleSignIn = async (payload: {
    username: string;
    password: string;
    category: string;
  }) => {
    const result = await dispatch(signIn(payload));

    if (signIn.fulfilled.match(result)) {
      navigate('/dashboard', { replace: true });
      return;
    }

    throw new Error(
      typeof result.payload === 'string'
        ? result.payload
        : 'Unable to sign in right now.',
    );
  };

  const handleSignOut = () => {
    dispatch(signOut());
    navigate('/login', { replace: true });
  };

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        {offline ? 'Khởi động IE Offline...' : 'Checking session...'}
      </div>
    );
  }

  // Offline mode: hiển thị IP như subtitle
  const displaySubtitle = offline
    ? ((sessionUser as any).ip ?? sessionUser.category)
    : sessionUser.category;

  return (
    <Routes>
      {/* Offline mode: /login luôn redirect về dashboard */}
      <Route
        path="/login"
        element={
          isAuthenticated || offline ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoginPage onSignIn={handleSignIn} />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute isAuthenticated={isAuthenticated}>
            <DashboardPage
              displayName={sessionUser.username}
              subtitle={displaySubtitle}
              onSignOut={handleSignOut}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={<Navigate to={isAuthenticated || offline ? '/dashboard' : '/login'} replace />}
      />
      <Route path="*" element={<NotFoundScreen isAuthenticated={isAuthenticated} />} />
    </Routes>
  );
}

export default App;
