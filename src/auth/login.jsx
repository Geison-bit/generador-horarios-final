// src/auth/Login.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "./AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  // Redirección a donde quería entrar antes
  const from = location.state?.from?.pathname || "/";

  const { bannedMessage, setBannedMessage, user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /* ============================================================
        Mostrar mensaje si el admin desactivó la cuenta
  ============================================================ */
  useEffect(() => {
    if (bannedMessage) {
      setError(bannedMessage);
      setBannedMessage("");
    }
  }, [bannedMessage]);

  /* ============================================================
        Si ya hay usuario → NO dejar entrar al login
  ============================================================ */
  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user]);

  /* ============================================================
        LOGIN
  ============================================================ */
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

    // Login correcto
    navigate(from, { replace: true });
  };

  /* ============================================================
        RENDER
  ============================================================ */
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-2xl shadow-md w-full max-w-md"
      >
        <h1 className="text-2xl font-bold text-center mb-6 text-blue-700">
          Iniciar Sesión
        </h1>

        {error && (
          <p className="text-red-600 mb-3 text-sm text-center">{error}</p>
        )}

        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border w-full p-2 rounded mb-3"
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border w-full p-2 rounded mb-4"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
