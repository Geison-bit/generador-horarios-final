// src/auth/Login.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "./AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  const { bannedMessage, setBannedMessage, user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /* ================================================
        Mostrar mensaje de cuenta desactivada
  ================================================= */
  useEffect(() => {
    if (bannedMessage) {
      setError(bannedMessage);
      setBannedMessage("");
    }
  }, [bannedMessage, setBannedMessage]);

  /* ================================================
        Si ya hay usuario -> redirigir
  ================================================= */
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  /* ================================================
        LOGIN
  ================================================= */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Completa correo y contraseña.");
      return;
    }

    setLoading(true);

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (loginError) {
      setError("Credenciales inválidas.");
      setLoading(false);
      return;
    }

    const user = data.user;

    // Verificar BAN
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();

    if (profile?.status?.toLowerCase() === "banned") {
      await supabase.auth.signOut();
      setError(
        "Acceso denegado: tu cuenta ha sido desactivada por el administrador."
      );
      setLoading(false);
      return;
    }

    navigate(from, { replace: true });
  };

  /* ================================================
        RENDER CLARO / INSTITUCIONAL
  ================================================= */

  return (
    <div className="min-h-screen w-full bg-slate-100 flex items-center justify-center px-4 py-10">

      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-5">

        {/* PANEL IZQUIERDO 🔵 INSTITUCIONAL */}
        <div className="lg:col-span-3 bg-white rounded-3xl shadow-xl p-10 border border-slate-200">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600 bg-blue-50 border-blue-200">
            Generador de horarios escolares
          </div>

          <h1 className="mt-4 text-3xl font-black text-slate-900 leading-tight">
            Organiza docentes, aulas y restricciones sin caos.
          </h1>

          <p className="mt-3 text-slate-600 max-w-xl">
            Esta plataforma usa modelos de optimización y reglas de negocio para
            construir horarios claros y equilibrados. Inicia sesión para
            continuar donde lo dejaste.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg sm:rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">Control total</p>
              <p className="text-sm text-slate-600 mt-1">
                Administra disponibilidad docente, aulas y permisos desde un solo lugar.
              </p>
            </div>

            <div className="rounded-lg sm:rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">Horarios precisos</p>
              <p className="text-sm text-slate-600 mt-1">
                Genera propuestas con MiniZinc y revisa versionado por nivel.
              </p>
            </div>
          </div>
        </div>

        {/* FORMULARIO DERECHO */}
        <div className="lg:col-span-2">
          <form
            onSubmit={handleSubmit}
            className="h-full bg-white rounded-3xl p-8 shadow-xl border border-slate-200"
          >
            <div className="mb-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
                Acceso seguro
              </p>
              <h2 className="mt-2 text-xl sm:text-2xl font-bold text-slate-900">
                Inicia sesión
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Ingresa con tus credenciales institucionales.
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg sm:rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            {/* Email */}
            <label className="block mb-4 text-sm font-semibold text-slate-700">
              Correo electrónico
              <input
                type="email"
                placeholder="tu@colegio.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-lg sm:rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
              />
            </label>

            {/* Contraseña */}
            <label className="block mb-4 text-sm font-semibold text-slate-700">
              Contraseña
              <input
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-lg sm:rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
              />
            </label>

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              className="mt-3 w-full rounded-lg sm:rounded-xl bg-blue-600 px-4 py-1.5 sm:py-2.5 lg:py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:bg-blue-300"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>

            <p className="mt-4 text-center text-xs text-slate-500">
              Seguridad con Supabase Auth y permisos por rol.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

