// src/auth/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children, need = [] }) {
  const { initializedSession, loading, user, permissions } = useAuth();
  const location = useLocation();

  console.groupCollapsed(
    `%c[ROUTE] ProtectedRoute → ${location.pathname}`,
    "color:#03a9f4;font-weight:bold"
  );
  console.log("initializedSession:", initializedSession);
  console.log("loading:", loading);
  console.log("user:", user);
  console.log("required perms:", need);
  console.log("user perms:", permissions);
  console.groupEnd();

  // 1) Esperando carga inicial de sesión
  if (!initializedSession) {
    return (
      <div style={{ padding: 40, fontSize: 18 }}>Cargando… (session)</div>
    );
  }

  // 2) Roles/permisos cargando
  if (loading) {
    return (
      <div style={{ padding: 40, fontSize: 18 }}>Cargando… (roles)</div>
    );
  }

  // 3) No hay usuario → login
  if (!user) {
    console.warn("[ROUTE] ❌ Sin usuario → /login");
    return <Navigate to="/login" replace />;
  }

  // 4) Validar permisos
  if (need.length > 0) {
    const ok = need.every((p) => permissions.includes(p));
    if (!ok) {
      console.warn("[ROUTE] ❌ Permisos insuficientes → /403");
      return <Navigate to="/403" replace />;
    }
  }

  console.log("[ROUTE] ✔ Acceso permitido");
  return children;
}

