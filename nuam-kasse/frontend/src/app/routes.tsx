import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext";

function LoadingScreen() {
  return (
    <main className="auth-screen">
      <div className="auth-panel">
        <p className="home-header__eyebrow">Nuam Kasse</p>
        <h1>Sitzung wird geprüft</h1>
      </div>
    </main>
  );
}

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return <LoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (auth.user?.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";

  if (auth.isLoading) {
    return <LoadingScreen />;
  }

  if (auth.isAuthenticated) {
    return <Navigate to={auth.user?.must_change_password ? "/change-password" : from} replace />;
  }

  return <Outlet />;
}

export function AdminRoute() {
  const auth = useAuth();

  if (auth.user?.role !== "admin") {
    return <Navigate to="/settings" replace />;
  }

  return <Outlet />;
}
