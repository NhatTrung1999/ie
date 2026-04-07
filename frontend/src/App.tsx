import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { NotFoundScreen } from '@/components/common/not-found-screen';
import { UNAUTHORIZED_EVENT } from '@/lib/api-client';
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

  useEffect(() => {
    void dispatch(bootstrapSession());
  }, [dispatch]);

  useEffect(() => {
    const handleUnauthorized = () => {
      dispatch(signOut());
      navigate('/login', { replace: true });
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [dispatch, navigate]);

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
        Checking session...
      </div>
    );
  }

  return (
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
  );
}

export default App;
