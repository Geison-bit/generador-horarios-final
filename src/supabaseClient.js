import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    flowType: "pkce",

    // ⭐ Importante
    persistSession: true,
    storage: localStorage,

    autoRefreshToken: true,
    detectSessionInUrl: true,

    // ⭐ Evita sesiones corruptas generando su propia clave interna
    storageKey: "sb-auth-state",

    // ⭐ Manejo de sesiones corruptas
    onSession: (event, session) => {
      console.log("[SUPABASE] Event:", event);

      // Sesión corrupta → tokens sin usuario
      if (session && !session.user) {
        console.warn("⚠ Sesión corrupta detectada → reiniciando...");
        localStorage.clear();
        sessionStorage.clear();
        indexedDB.deleteDatabase("supabase-auth");
        window.location.reload();
      }

      // Logout → limpiar todo
      if (event === "SIGNED_OUT") {
        localStorage.clear();
        sessionStorage.clear();
        indexedDB.deleteDatabase("supabase-auth");
      }
    }
  },
});
