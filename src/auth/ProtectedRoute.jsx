import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function ProtectedRoute({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  const redirectTo = `${location.pathname}${location.search}`;

  useEffect(() => {
    let mounted = true;

    async function verifySession() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        console.error("Error al obtener la sesión:", error);
        setChecking(false);
        return;
      }
      if (!data?.session) {
        navigate(`/login?redirect=${encodeURIComponent(redirectTo)}`, { replace: true });
        return;
      }
      setChecking(false);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (!session && event === "SIGNED_OUT") {
        navigate(`/login?redirect=${encodeURIComponent(redirectTo)}`, { replace: true });
      }
    });

    verifySession();

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [navigate, redirectTo]);

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="inline-flex items-center gap-3 rounded-lg bg-white px-4 py-3 text-sm text-slate-700 shadow ring-1 ring-slate-200">
          <Loader2 className="size-4 animate-spin text-blue-700" />
          Verificando sesión...
        </div>
      </div>
    );
  }

  return children;
}
