// src/auth/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children, need = [] }) {
  const { user, permissions, loading } = useAuth();
  const location = useLocation();

  console.log("[ROUTE] ProtectedRoute ejecutado:", {
    loading,
    path: location.pathname,
    need,
    permissions,
    user,
  });

  // 🟦 1) Mientras carga la sesión → NO BLOQUEAR la ruta
  if (loading) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          fontSize: "1.25rem",
          fontWeight: "500",
        }}
      >
        Cargando…
      </div>
    );
  }

  // 🔴 2) Si no hay usuario → mandar a /login
  if (!user) {
    console.log("[ROUTE] Usuario NO logueado → /login");
    return <Navigate to="/login" replace />;
  }

  // 🔐 3) Validar permisos solo si la ruta los pide
  if (need.length > 0) {
    const hasAll = need.every((p) => permissions.includes(p));
    if (!hasAll) {
      console.log("[ROUTE] ❌ Sin permisos → /403");
      return <Navigate to="/403" replace />;
    }
  }

  console.log("[ROUTE] ✔ Acceso permitido → renderizando hijo");
  return children;
}
