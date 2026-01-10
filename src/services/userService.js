import { supabase } from "../supabaseClient";

/**
 * Crea un usuario en Supabase Auth (modo client-side).
 * Nota: Para uso productivo, considera usar un backend con la service role key.
 */
export async function createUser({ email, password, full_name }) {
  // 1) Crear usuario en Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
    },
  });
  if (error) throw error;

  const userId = data?.user?.id;

  // 2) Crear perfil en tabla profiles (para que aparezca en vistas)
  if (userId) {
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name,
          email,
          status: "active",
        },
        { onConflict: "id" }
      );
    if (profileErr) {
      console.warn("No se pudo crear/actualizar perfil:", profileErr?.message || profileErr);
    }
  }

  return data;
}
