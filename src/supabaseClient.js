import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("🔍 URL:", supabaseUrl); // agrega esto temporalmente
console.log("🔍 KEY:", supabaseKey);

export const supabase = createClient(supabaseUrl, supabaseKey);
