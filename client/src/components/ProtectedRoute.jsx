import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Wraps routes that need a logged-in user.
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-saffron-700">Loading…</div>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
