import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";

/**
 * Guards a route so only signed-in users can view it. Team data is no longer
 * readable anonymously, so every data page requires a session.
 */
export function AuthedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

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

  return <>{children}</>;
}
