// --- GUARDAR COMO: src/components/GestionCuentas.jsx ---
import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "./Breadcrumbs";
import { useAuth } from "../auth/AuthContext";


import ProtectedRoute from "../auth/ProtectedRoute";

/** =========================
 *  Componente principal
 *  ========================= */
function GestionCuentasInner() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const { session } = useAuth(); // sesión del admin

  /** =========================
   *  Cargar usuarios desde la vista
   *  ========================= */
  async function loadUsers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("view_user_accounts")
        .select("user_id, full_name, status, role_name");

      if (error) throw error;

      const mapped = (data ?? []).map((u) => ({
        id: u.user_id,
        nombreCompleto: u.full_name || "Sin Perfil",
        rol: u.role_name || "Sin rol",
        estado: u.status || "Indefinido",
      }));

      setUsers(mapped);
    } catch (err) {
      console.error("Error cargando usuarios:", err);
      alert("Error cargando usuarios: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const handleUserCreated = () => {
    setShowModal(false);
    loadUsers();
  };

  /** =========================
   *  ACTIVAR / DESACTIVAR USUARIO
   *  ========================= */
  async function toggleUserStatus(userId, newStatus) {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: newStatus })
        .eq("id", userId);

      if (error) throw error;

      alert(
        `Usuario ${
          newStatus === "active" ? "activado" : "desactivado"
        } correctamente`
      );

      loadUsers(); // Refrescar la tabla
    } catch (err) {
      console.error(err);
      alert("Error cambiando estado: " + (err?.message || err));
    }
  }

  /** =========================
   *  EDITAR NOMBRE DEL PERFIL
   *  ========================= */
  async function editarNombre(user) {
    const nuevoNombre = window.prompt(
      "Ingresa el nombre completo para este usuario:",
      user?.nombreCompleto || ""
    );
    if (!nuevoNombre || !user?.id) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: nuevoNombre.trim() })
        .eq("id", user.id);

      if (error) throw error;
      alert("Nombre actualizado");
      loadUsers();
    } catch (err) {
      console.error(err);
      alert("Error al actualizar nombre: " + (err?.message || err));
    }
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="flex justify-between items-center my-4">
        <h1 className="text-2xl font-semibold">Gestión de Cuentas de Usuario</h1>
        {/* Botón de crear usuario removido a pedido */}
      </div>

      {loading ? (
        <p>Cargando usuarios...</p>
      ) : (
        <div className="overflow-auto border rounded-2xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Nombre (Perfil)</th>
                <th className="px-3 py-2 text-left">Rol de Sistema</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => {
                const activo = (user.estado || "").toLowerCase() === "active";

                return (
                  <tr key={user.id} className="border-t">
                    <td className="px-3 py-2">{user.nombreCompleto}</td>

                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded-full text-xs">
                        {user.rol}
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      {activo ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs">
                          Activo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs">
                          {user.estado}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      {activo ? (
                        <button
                          onClick={() => toggleUserStatus(user.id, "banned")}
                          className="px-2 py-1 bg-red-500 text-white rounded-lg text-xs"
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleUserStatus(user.id, "active")}
                          className="px-2 py-1 bg-green-500 text-white rounded-lg text-xs"
                        >
                          Activar
                        </button>
                      )}
                      <button
                        onClick={() => editarNombre(user)}
                        className="ml-2 px-2 py-1 bg-gray-200 text-gray-800 rounded-lg text-xs hover:bg-gray-300"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}

              {users.length === 0 && (
                <tr className="border-t">
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    No se encontraron perfiles de usuario.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

/** =========================
 *  Página protegida
 *  ========================= */
export default function GestionCuentasPage() {
  return (
    <ProtectedRoute need={["user.read"]}>
      <GestionCuentasInner />
    </ProtectedRoute>
  );
}

/** =========================
 *  Modal: Crear Usuario
 *  ========================= */
function CrearUsuarioModal({ onClose, onSuccess, session }) {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    roleName: "docente",
    docenteId: "",
  });

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Cargar roles del sistema
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("roles").select("name");
      if (!error) setRoles(data || []);
    })();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((s) => ({ ...s, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!session?.access_token) {
      setErrorMsg("No estás autenticado. Inicia sesión nuevamente.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`;

      const payload = {
        email: formData.email.trim(),
        password: formData.password,
        roleName: formData.roleName,
        full_name: formData.full_name?.trim() || "",
        docenteId: formData.docenteId
          ? parseInt(formData.docenteId, 10)
          : undefined,
      };

      const res = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || "Error en Edge Function");

      alert("¡Usuario creado exitosamente!");
      onSuccess();
    } catch (err) {
      console.error("Error al crear usuario:", err);
      setErrorMsg(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    formData.email.trim() !== "" &&
    formData.password.trim() !== "" &&
    formData.full_name.trim() !== "" &&
    formData.roleName.trim() !== "" &&
    !loading;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
        <h2 className="text-xl font-semibold">Crear Nuevo Usuario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            name="email"
            placeholder="Correo electrónico"
            required
            className="w-full px-3 py-2 border rounded-lg"
            value={formData.email}
            onChange={handleChange}
          />

          <input
            type="password"
            name="password"
            placeholder="Contraseña (temporal)"
            required
            className="w-full px-3 py-2 border rounded-lg"
            value={formData.password}
            onChange={handleChange}
          />

          <hr />
          <h3 className="text-sm font-medium text-gray-600">Perfil</h3>

          <input
            type="text"
            name="full_name"
            placeholder="Nombre Completo"
            className="w-full px-3 py-2 border rounded-lg"
            value={formData.full_name}
            onChange={handleChange}
            required
          />

          <h3 className="text-sm font-medium text-gray-600">Rol del Sistema</h3>
          <select
            name="roleName"
            required
            className="w-full px-3 py-2 border rounded-lg bg-white"
            value={formData.roleName}
            onChange={handleChange}
          >
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>

          <h3 className="text-sm font-medium text-gray-600">Vincular (Opcional)</h3>
          <input
            type="text"
            name="docenteId"
            placeholder="ID de Docente (opcional)"
            className="w-full px-3 py-2 border rounded-lg"
            value={formData.docenteId}
            onChange={handleChange}
          />

          {errorMsg && (
            <p className="text-red-500 text-sm whitespace-pre-wrap">{errorMsg}</p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
            >
              {loading ? "Creando..." : "Crear Usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
