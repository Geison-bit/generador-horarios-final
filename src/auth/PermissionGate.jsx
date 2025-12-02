// src/auth/PermissionGate.jsx
import { useAuth } from "./AuthContext.jsx";

/**
 * Oculta/Deshabilita acciones si no hay permisos.
 * <PermissionGate need="user.write"><button>Crear</button></PermissionGate>
 */
export function PermissionGate({ need, children, fallback = null }) {
  const { permissions, loading } = useAuth();
  if (loading) return null;
  const req = Array.isArray(need) ? need : [need];
  const ok = req.every((p) => permissions.includes(p));
  return ok ? children : fallback;
}

