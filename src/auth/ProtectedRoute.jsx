import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="inline-flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-sm text-slate-700 shadow ring-1 ring-slate-200">
        <Loader2 className="size-4 animate-spin text-blue-700" />
        Cargando sesión...
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
