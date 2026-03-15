import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogIn, Mail, Lock, Loader2, ShieldCheck, Eye, EyeOff, CalendarDays } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = new URLSearchParams(location.search).get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Error leyendo la sesión:", sessionError);
        return;
      }
      if (data?.session) navigate(redirectTo, { replace: true });
    })();
  }, [navigate, redirectTo]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      setMessage("Inicio de sesión exitoso. Redirigiendo…");
      setTimeout(() => navigate(redirectTo, { replace: true }), 350);
    } catch (err) {
      const msg = err?.message || "No se pudo iniciar sesión.";
      const humanMessage = msg.toLowerCase().includes("invalid")
        ? "Correo o contraseña incorrectos."
        : msg;
      setError(humanMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Panel Izquierdo - Branding (Oculto en móviles) */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-700 items-center justify-center p-12 relative overflow-hidden">
        {/* Elemento decorativo de fondo simulando restricciones/nodos */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
        
        <div className="relative z-10 text-white max-w-lg">
          <div className="mb-6 inline-flex items-center justify-center rounded-xl bg-blue-600/50 p-3 shadow-inner border border-blue-500/50">
            <CalendarDays className="size-10" />
          </div>
          <h1 className="text-4xl font-bold mb-4 tracking-tight">
            Motor de Horarios Inteligente
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed">
            Genera, optimiza y administra la asignación de recursos académicos utilizando modelos avanzados de programación por restricciones (CSP).
          </p>
        </div>
      </div>

      {/* Panel Derecho - Formulario de Login */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 sm:p-12 lg:p-16">
        <div className="w-full max-w-md">
          {/* Cabecera del formulario */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 mb-6">
              <ShieldCheck className="size-3.5" />
              Acceso Institucional Seguro
            </div>
            <h2 className="text-3xl font-semibold text-slate-900 mb-2">Bienvenido de nuevo</h2>
            <p className="text-slate-500">
              Ingresa tus credenciales para acceder al panel de configuración.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@institucion.edu"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 pl-10 text-sm text-slate-800 shadow-sm transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                {/* Añadido enlace de recuperación */}
                <a href="#" className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 pl-10 pr-10 text-sm text-slate-800 shadow-sm transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 animate-in fade-in slide-in-from-top-1">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 animate-in fade-in slide-in-from-top-1">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
              {loading ? "Autenticando..." : "Ingresar al sistema"}
            </button>
          </form>

          {/* Mostrar el aviso solo si estamos en entorno de desarrollo local */}
          {import.meta.env.DEV && (
            <div className="mt-8 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500 text-center">
              <span className="font-semibold text-slate-700">Modo Dev:</span> Asegúrate de tener `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en tu archivo .env.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}