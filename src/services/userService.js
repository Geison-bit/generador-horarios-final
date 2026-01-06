import { supabase } from "../supabaseClient";

/**
 * Crea un usuario en Supabase Auth (modo client-side).
 * Nota: Para uso productivo, considera usar un backend con la service role key.
 */
export async function createUser({ email, password, full_name }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
    },
  });

  if (error) {
    throw error;
  }

  return data;
}
