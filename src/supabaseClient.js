import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("✔ Supabase URL:", supabaseUrl);
console.log("✔ Supabase KEY (10 chars):", supabaseKey?.substring(0, 10));

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // 🔥 ESTA ES LA CLAVE PARA QUE NO USE COOKIES
    flowType: "pkce",

    // 🔥 Mantener sesión 100% en localStorage (Chrome no lo bloquea)
    persistSession: true,
    storage: localStorage,

    // 🔥 Refresca tokens
    autoRefreshToken: true,

    // 🔥 Necesario para login
    detectSessionInUrl: true,
  },
});
