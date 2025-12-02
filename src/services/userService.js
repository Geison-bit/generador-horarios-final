import { supabase } from "../supabaseClient";

// Crear usuario con email + password + nombre de perfil
export async function createUser({ email, password, full_name }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + "/login",
      data: { full_name },
    },
  });

  if (error) throw error;

  // Intentar actualizar perfil con el nombre (por si no lo setea el trigger)
  const userId = data?.user?.id;
  if (userId && full_name) {
    try {
      await supabase
        .from("profiles")
        .update({ full_name })
        .eq("id", userId);
    } catch (err) {
      console.warn("No se pudo actualizar full_name en profiles:", err?.message || err);
    }
  }

  return data;
}
