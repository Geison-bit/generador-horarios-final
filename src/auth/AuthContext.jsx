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
  const [rolesLoaded, setRolesLoaded] = useState(false); // sabemos que ya intentamos cargar roles/permisos
  const [loading, setLoading] = useState(true);
  const [bannedMessage, setBannedMessage] = useState("");

  // Limpieza de cache (solo si se detecta sesion corrupta)
  async function resetSupabaseCache() {
    console.warn("%c[AUTH] Cache corrupto -> limpiando", "color:red");
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

  // Validar si el usuario esta baneado
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
      console.warn("\u26d4 Usuario BANNED -> cerrando sesion");
      setBannedMessage(
        "Tu cuenta fue bloqueada por un administrador. Si crees que es un error, contacta al colegio."
      );
      await supabase.auth.signOut();
      return false;
    }

    return true;
  }

  // Cargar roles y permisos
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
        setPermissions((all || []).map((p) => p.key));
        return;
      }

      const { data: pData } = await supabase
        .from("v_user_permissions")
        .select("permission_key")
        .eq("user_id", u.id);

      setPermissions((pData || []).map((r) => r.permission_key));
    } catch (e) {
      console.error("Error roles/permisos:", e);
      setPermissions([]);
      setRoles((prev) => prev || []);
    } finally {
      setRolesLoaded(true);
    }
  }

  // Carga inicial de sesion
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    console.log("%c[AUTH] === CARGA INICIAL ===", "color:green");

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const s = data.session;

        // Supabase puede rehidratar user luego
        if (s) {
          if (!s.user) {
            console.log(
              "%c[AUTH] Usuario aun no cargado (rehidratacion).",
              "color:gray"
            );
          } else {
            console.log("[AUTH] Usuario inicial:", s.user.email);

            const allowed = await validateBan(s.user);
            if (!allowed) {
              setInitializedSession(true);
              setLoading(false);
              return;
            }

            setSession(s);
            setUser(s.user);
            setRolesLoaded(false);
            await fetchPermsAndRoles(s.user);
          }
        }

        setInitializedSession(true);
      })
      .catch((err) => {
        console.error("[AUTH] getSession error:", err);
        setInitializedSession(true);
        setLoading(false);
      });

    // Escuchar eventos de auth
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        console.log(`%c[AUTH EVENT] ${event}`, "color:orange");

        const u = s?.user || null;

        // Caso de sesion corrupta: dejar que Supabase la rehidrate
        if (!u && event !== "SIGNED_OUT") {
          return;
        }

        if (event === "SIGNED_OUT") {
          console.log("[AUTH] Sesion cerrada");
          setUser(null);
          setSession(null);
          setRoles([]);
          setPermissions([]);
          setRolesLoaded(true);
          setInitializedSession(true);
          setLoading(false);
          return;
        }

        if (u) {
          console.log("[AUTH] Usuario activo:", u.email);

          const allowed = await validateBan(u);
          if (!allowed) {
            setRolesLoaded(true);
            setLoading(false);
            return;
          }

          setSession(s);
          setUser(u);
          setRolesLoaded(false);
          await fetchPermsAndRoles(u);
        }

        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Control final de loading
  useEffect(() => {
    // Sin usuario -> listo para redirigir a login
    if (initializedSession && !user) {
      setLoading(false);
      return;
    }

    if (initializedSession && user && rolesLoaded) {
      setLoading(false);
    }
  }, [initializedSession, user, rolesLoaded]);

  const value = useMemo(
    () => ({
      session,
      user,
      roles,
      permissions,
      loading,
      initializedSession,
      bannedMessage,
      setBannedMessage,
    }),
    [session, user, roles, permissions, loading, initializedSession, bannedMessage]
  );

  return <authCtx.Provider value={value}>{children}</authCtx.Provider>;
}

export function useAuth() {
  return useContext(authCtx);
}

