import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("sin rol");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSessionAndRole() {
      try {
        setLoading(true);
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const currentSession = data?.session ?? null;
        if (cancelled) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          const { data: roleRow, error: roleError } = await supabase
            .from("user_roles")
            .select("role_id")
            .eq("user_id", currentSession.user.id)
            .maybeSingle();

          if (roleError && !["PGRST116", "42703", "PGRST205", "404"].includes(roleError.code)) {
            throw roleError;
          }

          setRole(roleRow?.role_id ?? "sin rol");
        } else {
          setRole("sin rol");
        }
      } catch (err) {
        console.error("Error al cargar sesión/rol:", err);
        try {
          await supabase.auth.signOut();
        } catch (signOutErr) {
          console.error("Error al cerrar sesión forzada:", signOutErr);
        }
        if (!cancelled) {
          setSession(null);
          setUser(null);
          setRole("sin rol");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSessionAndRole();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (!newSession) {
        setRole("sin rol");
      }
    });

    return () => {
      cancelled = true;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole("sin rol");
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return ctx;
}
