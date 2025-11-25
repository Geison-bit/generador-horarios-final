import { supabase } from "../supabaseClient";

// Crear usuario solamente con email + password
export async function createUser({ email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + "/login",
    },
  });

  if (error) throw error;

  return data;
}
