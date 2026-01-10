import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import ProtectedRoute from "../auth/ProtectedRoute";
import { withAudit } from "../services/auditService";
import Breadcrumbs from "./Breadcrumbs";
import RolePermsModal from "./RolePermsModal";

const emptyRole = { id: null, nombre: "", descripcion: "" };

export default function RolesAdmin() {
  return (
    <ProtectedRoute>
      <RolesAdminInner />
    </ProtectedRoute>
  );
}

export function RolesAdminInner() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivelURL = params.get("nivel") || "Secundaria";

  const [roles, setRoles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [q, setQ] = useState("");
  const [openRoleForm, setOpenRoleForm] = useState(false);
  const [roleForm, setRoleForm] = useState(emptyRole);
  const [loading, setLoading] = useState(false);
  const [soloActivos, setSoloActivos] = useState(true);
  const [openPermsFor, setOpenPermsFor] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // ================== CARGA ==================
  const loadAll = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const [{ data: rolesRaw, error: rolesErr }, { data: usuariosRaw, error: usersErr }, { data: asignRaw, error: asignErr }] =
        await Promise.all([
          supabase.from("roles").select("id, name, description").order("name", { ascending: true }),
          supabase
            .from("view_user_accounts")
            .select("user_id, full_name, status")
            .order("full_name", { ascending: true }),
          supabase.from("user_roles").select("user_id, role_id"),
        ]);

      if (rolesErr || usersErr || asignErr) {
        const err = rolesErr || usersErr || asignErr;
        throw err;
      }

      setRoles(
        (rolesRaw || []).map((r) => ({
          id: r.id,
          nombre: r.name,
          descripcion: r.description || "",
        }))
      );

    setUsuarios(
      (usuariosRaw || []).map((u) => ({
        id: u.user_id,
        nombreCompleto: u.full_name || "Sin Perfil",
        // Si status viene vacÃ­o/null lo consideramos activo para no ocultar usuarios nuevos
        activo: !u.status || (u.status || "").toLowerCase() === "active",
      }))
    );

      setAsignaciones(asignRaw || []);
    } catch (e) {
      console.error("Error cargando roles/usuarios:", e);
      setErrorMsg("No se pudo cargar la informacion de roles o usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [nivelURL]);

  // ================== FILTROS ==================
  const usuariosFiltrados = useMemo(() => {
    let base = usuarios;
    const s = q.trim().toLowerCase();
    if (soloActivos) base = base.filter((x) => x.activo);
    if (!s) return base;

    return base.filter((u) => (u.nombreCompleto || "").toLowerCase().includes(s));
  }, [usuarios, q, soloActivos]);

  // ================== TOGGLE ROLE ==================
  const hasRole = (userId, roleId) => asignaciones.some((a) => a.user_id === userId && a.role_id === roleId);

  const toggle = async (userId, roleId) => {
    try {
      if (hasRole(userId, roleId)) {
        await withAudit(
          async () => {
            await supabase.from("user_roles").delete().match({ user_id: userId, role_id: roleId });
          },
          {
            action: "user_role_remove",
            entity: "user_roles",
            details: { user_id: userId, role_id: roleId },
          }
        );

        setAsignaciones((prev) => prev.filter((a) => !(a.user_id === userId && a.role_id === roleId)));
      } else {
        await withAudit(
          async () => {
            await supabase.from("user_roles").insert({ user_id: userId, role_id: roleId });
          },
          {
            action: "user_role_add",
            entity: "user_roles",
            details: { user_id: userId, role_id: roleId },
          }
        );

        setAsignaciones((prev) => [...prev, { user_id: userId, role_id: roleId }]);
      }
    } catch (e) {
      alert("Error al actualizar rol: " + e.message);
    }
  };

  // ================== CRUD ROLES ==================
  const onNewRole = () => {
    setRoleForm(emptyRole);
    setOpenRoleForm(true);
  };

  const onEditRole = (r) => {
    setRoleForm(r);
    setOpenRoleForm(true);
  };

  const onDeleteRole = async (r) => {
    if (!confirm(`Eliminar el rol "${r.nombre}"?`)) return;

    try {
      await supabase.from("roles").delete().eq("id", r.id);
      await loadAll();
    } catch (e) {
      alert("No se pudo eliminar: " + e.message);
    }
  };

  const onSaveRole = async (e) => {
    e.preventDefault();
    const nombre = roleForm.nombre.trim();
    const descripcion = roleForm.descripcion.trim();

    if (!nombre) {
      alert("El nombre es obligatorio");
      return;
    }

    try {
      if (roleForm.id) {
        await supabase.from("roles").update({ name: nombre, description: descripcion }).eq("id", roleForm.id);
      } else {
        await supabase.from("roles").insert({ name: nombre, description: descripcion });
      }

      setOpenRoleForm(false);
      await loadAll();
    } catch (e) {
      alert("Error guardando rol: " + e.message);
    }
  };

  // ================== UI ==================
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="flex items-center justify-between mb-4 mt-4">
        <h1 className="text-xl sm:text-2xl font-semibold">Gestion de Roles ({nivelURL})</h1>

        <button onClick={onNewRole} className="px-3 py-2 rounded-lg sm:rounded-xl bg-blue-600 text-white">
          Nuevo rol
        </button>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="border rounded-2xl">
            <div className="p-3 border-b">
              <h2 className="font-medium">Roles</h2>
            </div>
            <ul className="divide-y">
              {roles.map((r) => (
                <li key={r.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{r.nombre}</div>
                    <div className="text-xs text-gray-500">{r.descripcion}</div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setOpenPermsFor(r)} className="px-2 py-1 bg-violet-600 text-white rounded-md sm:rounded-lg">
                      Permisos
                    </button>
                    <button onClick={() => onEditRole(r)} className="px-2 py-1 bg-amber-500 text-white rounded-md sm:rounded-lg">
                      Editar
                    </button>
                    <button onClick={() => onDeleteRole(r)} className="px-2 py-1 bg-rose-600 text-white rounded-md sm:rounded-lg">
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}

              {roles.length === 0 && <li className="p-4 text-gray-500">Sin roles</li>}
            </ul>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="border rounded-2xl">
            <div className="p-3 border-b flex justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-medium">Asignacion de roles a usuarios</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
                  Solo activos
                </label>
              </div>

              <input value={q} onChange={(e) => setQ(e.target.value)} className="px-3 py-2 border rounded-lg sm:rounded-xl" placeholder="Buscar usuario..." />
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Usuario</th>
                    {roles.map((r) => (
                      <th key={r.id} className="px-3 py-2 text-center">
                        {r.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {usuariosFiltrados.map((u) => (
                    <tr key={u.id} className="border-t">
                      <td className="px-3 py-2">{u.nombreCompleto}</td>

                      {roles.map((r) => {
                        const on = hasRole(u.id, r.id);
                        return (
                          <td key={`${u.id}-${r.id}`} className="px-3 py-2 text-center">
                            <button
                              onClick={() => toggle(u.id, r.id)}
                              className={`px-2 py-1 rounded-md sm:rounded-lg ${
                                on ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                              }`}
                            >
                              {on ? "✓" : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {openRoleForm && (
        <div className="fixed inset-0 bg-black/30 grid place-items-center p-4">
          <form onSubmit={onSaveRole} className="bg-white p-4 rounded-2xl max-w-lg w-full shadow-xl">
            <h2 className="text-lg sm:text-xl font-semibold mb-3">{roleForm.id ? "Editar rol" : "Nuevo rol"}</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm">Nombre del rol</label>
                <input
                  value={roleForm.nombre}
                  onChange={(e) => setRoleForm((f) => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg sm:rounded-xl"
                />
              </div>

              <div>
                <label className="text-sm">Descripcion</label>
                <textarea
                  rows={3}
                  value={roleForm.descripcion}
                  onChange={(e) => setRoleForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg sm:rounded-xl"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpenRoleForm(false)} className="px-3 py-2 border rounded-lg sm:rounded-xl">
                Cancelar
              </button>

              <button className="px-3 py-2 rounded-lg sm:rounded-xl bg-blue-600 text-white">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {openPermsFor && <RolePermsModal role={openPermsFor} onClose={() => setOpenPermsFor(null)} />}
    </div>
  );
}

