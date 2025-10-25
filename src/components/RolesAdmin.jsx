import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "./Breadcrumbs";
import RolePermsModal from "./RolePermsModal"; // ⬅️ nuevo

const emptyRole = { id: null, nombre: "", descripcion: "" };

export default function RolesAdmin() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivelURL = params.get("nivel") || "Secundaria";

  const [roles, setRoles] = useState([]);
  const [docentes, setDocentes] = useState([]);          // {id,nombre,apellido,activo?}
  const [asignaciones, setAsignaciones] = useState([]);  // {docente_id, role_id}
  const [q, setQ] = useState("");
  const [openRoleForm, setOpenRoleForm] = useState(false);
  const [roleForm, setRoleForm] = useState(emptyRole);
  const [loading, setLoading] = useState(false);
  const [soloActivos, setSoloActivos] = useState(true);

  // modal de permisos
  const [openPermsFor, setOpenPermsFor] = useState(null); // {id, nombre} | null

  // -------- Carga inicial / por nivel
  const loadAll = async () => {
    setLoading(true);

    const qRoles = supabase
      .from("roles")
      .select("id,nombre,descripcion")
      .order("nombre", { ascending: true });

    let qDocentes = supabase
      .from("docentes")
      .select("id,nombre,apellido,nivel,activo")
      .order("apellido", { ascending: true });
    if (nivelURL) qDocentes = qDocentes.eq("nivel", nivelURL);

    const qAsign = supabase.from("docente_roles").select("docente_id,role_id");

    const [r1, r2, r3] = await Promise.all([qRoles, qDocentes, qAsign]);

    if (!r1.error) setRoles(r1.data || []);
    if (!r2.error) {
      const ds = (r2.data || []).map((d) => ({
        id: d.id,
        nombre: d.nombre,
        apellido: d.apellido,
        activo: d.activo ?? true,
      }));
      setDocentes(ds);
    }
    if (!r3.error) setAsignaciones(r3.data || []);

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivelURL]);

  // -------- Búsqueda y filtro activos
  const docentesFiltrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = docentes;
    if (soloActivos) base = base.filter((d) => d.activo === true);
    if (!s) return base;
    return base.filter((d) =>
      `${d.apellido} ${d.nombre}`.toLowerCase().includes(s)
    );
  }, [docentes, q, soloActivos]);

  // -------- Helpers de asignación
  const hasRole = (docenteId, roleId) =>
    asignaciones.some((a) => a.docente_id === docenteId && a.role_id === roleId);

  const toggle = async (docenteId, roleId) => {
    try {
      if (hasRole(docenteId, roleId)) {
        const { error } = await supabase
          .from("docente_roles")
          .delete()
          .match({ docente_id: docenteId, role_id: roleId });
        if (error) throw error;
        setAsignaciones((prev) =>
          prev.filter((a) => !(a.docente_id === docenteId && a.role_id === roleId))
        );
      } else {
        const { error } = await supabase
          .from("docente_roles")
          .insert({ docente_id: docenteId, role_id: roleId });
        if (error) throw error;
        setAsignaciones((prev) => [...prev, { docente_id: docenteId, role_id: roleId }]);
      }
    } catch (e) {
      alert("❌ Error al actualizar rol del docente: " + (e?.message || e));
    }
  };

  // -------- CRUD de roles
  const onNewRole = () => { setRoleForm(emptyRole); setOpenRoleForm(true); };
  const onEditRole = (r) => { setRoleForm(r); setOpenRoleForm(true); };

  const onSaveRole = async (e) => {
    e?.preventDefault?.();
    const nombre = roleForm.nombre?.trim();
    const descripcion = roleForm.descripcion?.trim() || "";
    if (!nombre) {
      alert("El nombre del rol es obligatorio.");
      return;
    }

    setLoading(true);
    try {
      let resp;
      if (roleForm.id) {
        resp = await supabase
          .from("roles")
          .update({ nombre, descripcion })
          .eq("id", roleForm.id)
          .select()
          .single();
      } else {
        resp = await supabase
          .from("roles")
          .insert({ nombre, descripcion })
          .select()
          .single();
      }
      if (resp.error) throw resp.error;

      setOpenRoleForm(false);
      await loadAll();
    } catch (e) {
      alert("❌ Error guardando rol: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // -------- UI
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="flex items-center justify-between mb-4 mt-4">
        <h1 className="text-2xl font-semibold">Gestión de Roles ({nivelURL})</h1>
        <button
          onClick={onNewRole}
          className="px-3 py-2 rounded-xl bg-blue-600 text-white"
        >
          Nuevo rol
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de roles */}
        <div className="lg:col-span-1">
          <div className="border rounded-2xl">
            <div className="p-3 border-b flex items-center justify-between">
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
                    <button
                      onClick={() => setOpenPermsFor(r)}
                      className="px-2 py-1 rounded-lg bg-violet-600 text-white"
                      title="Gestionar permisos"
                    >
                      Permisos
                    </button>
                    <button
                      onClick={() => onEditRole(r)}
                      className="px-2 py-1 rounded-lg bg-amber-500 text-white"
                    >
                      Editar
                    </button>
                  </div>
                </li>
              ))}
              {roles.length === 0 && (
                <li className="p-3 text-gray-500">Sin roles</li>
              )}
            </ul>
          </div>
        </div>

        {/* Matriz de asignación */}
        <div className="lg:col-span-2">
          <div className="border rounded-2xl">
            <div className="p-3 border-b flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-medium">Asignación de roles a docentes</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={soloActivos}
                    onChange={(e) => setSoloActivos(e.target.checked)}
                  />
                  Solo activos
                </label>
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar docente…"
                className="px-3 py-2 border rounded-xl w-64"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Docente</th>
                    {roles.map((r) => (
                      <th key={r.id} className="px-3 py-2 text-center">
                        {r.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docentesFiltrados.map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="px-3 py-2">
                        {d.apellido} {d.nombre}{" "}
                        {d.activo ? "" : (
                          <span className="text-xs text-gray-400">(inactivo)</span>
                        )}
                      </td>
                      {roles.map((r) => {
                        const on = hasRole(d.id, r.id);
                        return (
                          <td key={`${d.id}-${r.id}`} className="px-3 py-2 text-center">
                            <button
                              onClick={() => toggle(d.id, r.id)}
                              className={`px-2 py-1 rounded-lg ${
                                on
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-200 text-gray-600"
                              }`}
                              title="Asignar/Remover"
                            >
                              {on ? "✓" : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {docentesFiltrados.length === 0 && (
                    <tr>
                      <td
                        className="px-3 py-6 text-center text-gray-500"
                        colSpan={1 + roles.length}
                      >
                        {loading ? "Cargando…" : "Sin docentes"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal crear/editar rol */}
      {openRoleForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <form
            onSubmit={onSaveRole}
            className="bg-white rounded-2xl p-4 w-full max-w-lg shadow-xl"
          >
            <h2 className="text-xl font-semibold mb-3">
              {roleForm.id ? "Editar rol" : "Nuevo rol"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm">Nombre del rol</label>
                <input
                  className="w-full px-3 py-2 border rounded-xl"
                  value={roleForm.nombre}
                  onChange={(e) =>
                    setRoleForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="text-sm">Descripción</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-xl"
                  rows={3}
                  value={roleForm.descripcion}
                  onChange={(e) =>
                    setRoleForm((f) => ({ ...f, descripcion: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenRoleForm(false)}
                className="px-3 py-2 rounded-xl border"
              >
                Cancelar
              </button>
              <button
                disabled={loading}
                className="px-3 py-2 rounded-xl bg-blue-600 text-white"
              >
                {loading ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal permisos */}
      {openPermsFor && (
        <RolePermsModal role={openPermsFor} onClose={() => setOpenPermsFor(null)} />
      )}
    </div>
  );
}
