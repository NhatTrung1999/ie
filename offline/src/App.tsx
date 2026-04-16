import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { NotFoundScreen } from '@/components/common/not-found-screen';
import { OfflineStatusBar } from '@/components/common/offline-status-bar';
import { UNAUTHORIZED_EVENT } from '@/lib/api-client';
import { syncManager } from '@/lib/sync-manager';
import { DashboardPage } from '@/pages/dashboard-page';
import { LoginPage } from '@/pages/login-page';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { bootstrapSession, signIn, signOut } from '@/store/slices/auth-slice';

function App() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isAuthenticated, isBootstrapping, sessionUser } = useAppSelector(
    (state) => state.auth,
  );

  // Bootstrap session on mount
  useEffect(() => {
    void dispatch(bootstrapSession());
  }, [dispatch]);

  // Handle server-side 401
  useEffect(() => {
    const handleUnauthorized = () => {
      // Only sign out if online (offline 401 is impossible)
      if (navigator.onLine) {
        dispatch(signOut());
        navigate('/login', { replace: true });
      }
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [dispatch, navigate]);

  // Initialize SyncManager (offline ↔ online handler)
  useEffect(() => {
    syncManager.init();
    return () => syncManager.destroy();
  }, []);

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
      typeof result.payload === 'string' ? result.payload : 'Unable to sign in right now.',
    );
  };

  const handleSignOut = () => {
    dispatch(signOut());
    navigate('/login', { replace: true });
  };

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Checking session...
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
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
                subtitle={sessionUser.category}
                onSignOut={handleSignOut}
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
        />
        <Route path="*" element={<NotFoundScreen isAuthenticated={isAuthenticated} />} />
      </Routes>

      {/* Offline status bar — fixed at bottom, only shows when needed */}
      <OfflineStatusBar />
    </>
  );
}

export default App;
