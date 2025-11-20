// src/auth/AuthContext.jsx
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

  // ============================================================
  // 🔥 LIMPIEZA REAL del cache (solo si hay sesión corrupta)
  // ============================================================
  async function resetSupabaseCache() {
    console.warn("%c[AUTH] Cache corrupto detectado → limpiando", "color:red");
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-"))
        .forEach((k) => localStorage.removeItem(k));

      sessionStorage.clear();
      await indexedDB.deleteDatabase("supabase-auth");
    } catch (e) {
      console.error("Error al limpiar cache:", e);
    }
  }

  // ============================================================
  // 🔥 VALIDAR BAN
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
  // CARGAR ROLES + PERMISOS
  // ============================================================
  async function fetchPermsAndRoles(u) {
    try {
      console.log("[AUTH] Cargando roles/permisos…");

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
      console.error("Error roles/permisos:", e);
    }
  }

  // ============================================================
  // 🔥 CARGA INICIAL DE SESIÓN — CORREGIDA
  // ============================================================
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    console.log("%c[AUTH] === CARGA INICIAL ===", "color:green");

    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session;

      // ⚠ Supabase a veces devuelve session.user=null. NO limpiar aquí.
      if (s) {
        if (!s.user) {
          console.log(
            "%c[AUTH] Usuario aún no cargado (rehidratación).",
            "color:gray"
          );
        } else {
          console.log("[AUTH] Usuario inicial:", s.user.email);

          // Validar BAN
          const allowed = await validateBan(s.user);
          if (!allowed) {
            setInitializedSession(true);
            return;
          }

          setSession(s);
          setUser(s.user);
          await fetchPermsAndRoles(s.user);
        }
      }

      setInitializedSession(true);
    });

    // ============================================================
    // 🔥 ESCUCHAR EVENTOS DE AUTH
    // ============================================================
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        console.log(`%c[AUTH EVENT] ${event}`, "color:orange");

        const u = s?.user || null;

        // ------------------------------------------------------------
        // 🔥 CASO REAL de sesión corrupta (session=null + sb-tokens)
        // ------------------------------------------------------------
        if (!u && event !== "SIGNED_OUT") {
          return; // Supabase rehidratará user luego
        }

        // ===============================
        // LOGOUT
        // ===============================
        if (event === "SIGNED_OUT") {
          console.log("[AUTH] Sesión cerrada");
          setUser(null);
          setSession(null);
          setRoles([]);
          setPermissions([]);
          setLoading(false);
          return;
        }

        // ===============================
        // SIGNED_IN o REFRESH
        // ===============================
        if (u) {
          console.log("[AUTH] Usuario activo:", u.email);

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
  // 🔥 CONTROL FINAL DE LOADING
  // ============================================================
  useEffect(() => {
    // No usuario → listo para redirigir a login
    if (initializedSession && !user) {
      setLoading(false);
      return;
    }

    if (initializedSession && user && (roles.length > 0 || permissions.length > 0)) {
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
    }),
    [session, user, roles, permissions, loading, initializedSession]
  );

  return <authCtx.Provider value={value}>{children}</authCtx.Provider>;
}

export function useAuth() {
  return useContext(authCtx);
}
