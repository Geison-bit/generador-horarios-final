// ============================================================
// src/auth/AuthContext.jsx
// ============================================================
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../supabaseClient";

export const authCtx = createContext(null);

export function AuthProvider({ children }) {
  const initialized = useRef(false);

  const [initializedSession, setInitializedSession] = useState(false);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔥 NUEVO — controla logout suave
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // ============================================================
  // VALIDAR BAN
  // ============================================================
  async function validateBan(u) {
    const { data, error } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", u.id)
      .single();

    if (error) {
      console.warn("[AUTH] Error leyendo perfil:", error);
      return true;
    }

    if (!data) return true;

    if (data.status?.toLowerCase() === "banned") {
      console.warn("⛔ Usuario BANNED → cerrando sesión");
      await supabase.auth.signOut();
      return false;
    }

    return true;
  }

  // ============================================================
  // CARGAR ROLES Y PERMISOS
  // ============================================================
  async function fetchPermsAndRoles(u) {
    try {
      const { data: rData } = await supabase
        .from("user_roles")
        .select("roles(name)")
        .eq("user_id", u.id);

      const roleNames = (rData || []).map((r) => r.roles?.name);
      setRoles(roleNames);

      if (roleNames.includes("admin")) {
        const { data: all } = await supabase.from("permissions").select("key");
        setPermissions(all.map((p) => p.key));
        return;
      }

      const { data: pData } = await supabase
        .from("v_user_permissions")
        .select("permission_key")
        .eq("user_id", u.id);

      setPermissions((pData || []).map((r) => r.permission_key));
    } catch (e) {
      console.error("[AUTH] Error roles/permisos:", e);
    }
  }

  // ============================================================
  // CARGA INICIAL — estable sin loops
  // ============================================================
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    console.log("%c[AUTH] === CARGA INICIAL ===", "color:green");

    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session;

      if (s?.user) {
        const allowed = await validateBan(s.user);
        if (!allowed) {
          setInitializedSession(true);
          return;
        }

        setSession(s);
        setUser(s.user);
        await fetchPermsAndRoles(s.user);
      }

      setInitializedSession(true);
    });

    // ============================================================
    // EVENTOS DE SUPABASE
    // ============================================================
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        console.log(`%c[AUTH EVENT] ${event}`, "color:orange");

        const u = s?.user || null;

        // LOGOUT
        if (event === "SIGNED_OUT") {
          console.log("[AUTH] Sesión cerrada");
          setIsLoggingOut(false); // 🔥 terminar estado logout
          setUser(null);
          setSession(null);
          setRoles([]);
          setPermissions([]);
          setLoading(false);
          return;
        }

        // SIGNED_IN / REFRESH
        if (u) {
          const allowed = await validateBan(u);
          if (!allowed) return;

          setSession(s);
          setUser(u);
          await fetchPermsAndRoles(u);
        }

        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // ============================================================
  // CONTROL FINAL DE LOADING
  // ============================================================
  useEffect(() => {
    if (initializedSession && !user) {
      setLoading(false);
      return;
    }

    if (
      initializedSession &&
      user &&
      (roles.length > 0 || permissions.length > 0)
    ) {
      setLoading(false);
    }
  }, [initializedSession, user, roles, permissions]);

  // ============================================================
  // CONTEXTO FINAL
  // ============================================================
  const value = useMemo(
    () => ({
      session,
      user,
      roles,
      permissions,
      loading,
      initializedSession,
      isLoggingOut,
      setIsLoggingOut,
    }),
    [
      session,
      user,
      roles,
      permissions,
      loading,
      initializedSession,
      isLoggingOut,
    ]
  );

  return <authCtx.Provider value={value}>{children}</authCtx.Provider>;
}

export function useAuth() {
  return useContext(authCtx);
}
