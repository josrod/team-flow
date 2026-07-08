import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";

/**
 * Guards a route so only signed-in admins can view it.
 * - Not signed in → redirect to /auth
 * - Signed in but not admin → redirect to /
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
