// src/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

export const authCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔥 NUEVO: mensaje global para usuario baneado
  const [bannedMessage, setBannedMessage] = useState("");

  /* ================================
      VALIDAR ESTADO DEL PERFIL
  ================================= */
  async function checkProfileStatus(u) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", u.id)
        .single();

      if (error) {
        console.warn("[AUTH] No se pudo leer perfil:", error);
        return true;
      }

      if (!data) return true;

      console.log("[AUTH] Estado del usuario:", data.status);

      // ⛔ Usuario marcado como BANNED
      if (data.status?.toLowerCase() === "banned") {
        console.log("⛔ Usuario BANNED → cerrando sesión…");

        // Guardamos mensaje
        setBannedMessage(
          "Acceso denegado: tu cuenta ha sido desactivada por el administrador."
        );

        await supabase.auth.signOut();
        return false;
      }

      return true;
    } catch (e) {
      console.error("[AUTH] Error validando perfil:", e);
      return true;
    }
  }

  /* ================================
      CARGAR ROLES Y PERMISOS
  ================================= */
  async function fetchPermsAndRoles(u) {
    if (!u) return;

    try {
      const { data: rData } = await supabase
        .from("user_roles")
        .select("roles(name)")
        .eq("user_id", u.id);

      const roleNames = [...new Set(rData?.map((r) => r.roles?.name))];
      setRoles(roleNames || []);

      // Si es ADMIN → permisos completos
      if (roleNames.includes("admin")) {
        const { data: allPerms } = await supabase
          .from("permissions")
          .select("key");

        setPermissions(allPerms?.map((p) => p.key) || []);
        return;
      }

      const { data: pData } = await supabase
        .from("v_user_permissions")
        .select("permission_key")
        .eq("user_id", u.id);

      setPermissions(pData?.map((r) => r.permission_key) || []);
    } catch (e) {
      console.error("[AUTH] Error roles/permisos:", e);
    }
  }

  /* ================================
      CARGA INICIAL DE SESIÓN
  ================================= */
  useEffect(() => {
    let cancelled = false;

    async function loadInitialSession() {
      try {
        const {
          data: { session: s },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        setSession(s);
        const u = s?.user ?? null;
        setUser(u);

        if (u) {
          const allowed = await checkProfileStatus(u);
          if (!allowed) {
            if (!cancelled) setLoading(false);
            return;
          }

          await fetchPermsAndRoles(u);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitialSession();

    /* ================================
        LISTENER DE SESIÓN
    ================================= */
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        console.log("[AUTH] Evento auth:", event);

        if (event === "SIGNED_IN") {
          setLoading(true);

          const {
            data: { session: fresh },
          } = await supabase.auth.getSession();

          if (cancelled) return;

          setSession(fresh);
          const u = fresh?.user ?? null;
          setUser(u);

          if (u) {
            const allowed = await checkProfileStatus(u);
            if (!allowed) {
              if (!cancelled) setLoading(false);
              return;
            }

            await fetchPermsAndRoles(u);
          }

          if (!cancelled) setLoading(false);
          return;
        }

        if (event === "SIGNED_OUT") {
          setSession(null);
          setUser(null);
          setRoles([]);
          setPermissions([]);

          return;
        }

        if (currentSession) {
          setSession(currentSession);
          const u = currentSession?.user ?? null;
          setUser(u);

          if (u) await fetchPermsAndRoles(u);

          setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  /* ================================
      CONTEXTO MEMOIZADO
  ================================= */
  const value = useMemo(
    () => ({
      session,
      user,
      roles,
      permissions,
      loading,
      bannedMessage, // 👉 Agregado
      setBannedMessage,
    }),
    [session, user, roles, permissions, loading, bannedMessage]
  );

  return <authCtx.Provider value={value}>{children}</authCtx.Provider>;
}

export function useAuth() {
  return useContext(authCtx);
}
