import React, { useEffect, useMemo, useState } from "react";
import {
  listPermissions, listRoles, listRolePerms,
  toggleRolePerm, setRowForRoles, setColForPerms
} from "../../services/rbacService";
import { PermissionGate } from "../../auth/PermissionGate";

export default function RolePermsMatrix() {
  const [roles, setRoles] = useState([]);        // [{id, nombre}]
  const [perms, setPerms] = useState([]);        // [{key, nombre, codigo, descripcion}]
  const [links, setLinks] = useState([]);        // [{role_id, permission_key}]
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [r, p, l] = await Promise.all([listRoles(), listPermissions(), listRolePerms()]);
      setRoles(r);
      setPerms(p);
      setLinks(l);
    } catch (e) {
      alert("Error cargando matriz: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadAll(); }, []);

  const has = (roleId, permKey) =>
    links.some(x => x.role_id === roleId && x.permission_key === permKey);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return perms;
    return perms.filter(p =>
      `${p.nombre} ${p.codigo} ${p.descripcion || ""}`.toLowerCase().includes(s)
    );
  }, [q, perms]);

  async function toggleCell(roleId, permKey) {
    const on = !has(roleId, permKey);
    try {
      // optimista
      setLinks(prev => on
        ? [...prev, { role_id: roleId, permission_key: permKey }]
        : prev.filter(x => !(x.role_id === roleId && x.permission_key === permKey))
      );
      await toggleRolePerm({ roleId, permKey, on });
    } catch (e) {
      // revertir
      setLinks(prev => !on
        ? [...prev, { role_id: roleId, permission_key: permKey }]
        : prev.filter(x => !(x.role_id === roleId && x.permission_key === permKey))
      );
      alert("No se pudo actualizar: " + (e?.message || e));
    }
  }

  async function applyRow(permKey, value) {
    try {
      const roleIds = roles.map(r => r.id);
      setLinks(prev => value
        ? [
            ...prev,
            ...roleIds
              .filter(rid => !prev.some(x => x.role_id === rid && x.permission_key === permKey))
              .map(rid => ({ role_id: rid, permission_key: permKey }))
          ]
        : prev.filter(x => x.permission_key !== permKey)
      );
      await setRowForRoles({ permKey, roleIds, value });
    } catch (e) {
      alert("No se pudo aplicar a la fila: " + (e?.message || e));
      loadAll();
    }
  }

  async function applyCol(roleId, value) {
    try {
      const permKeys = perms.map(p => p.key);
      setLinks(prev => value
        ? [
            ...prev,
            ...permKeys
              .filter(k => !prev.some(x => x.role_id === roleId && x.permission_key === k))
              .map(k => ({ role_id: roleId, permission_key: k }))
          ]
        : prev.filter(x => x.role_id !== roleId)
      );
      await setColForPerms({ roleId, permKeys, value });
    } catch (e) {
      alert("No se pudo aplicar a la columna: " + (e?.message || e));
      loadAll();
    }
  }

  if (loading) return <div className="p-4">Cargando matriz…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base sm:text-lg font-semibold">Matriz Permiso × Rol</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar permiso…"
          className="px-3 py-2 border rounded-lg sm:rounded-xl w-full sm:w-80"
        />
      </div>

      <div className="overflow-auto border rounded-2xl">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left w-[320px]">Permiso</th>
              {roles.map(r => (
                <th key={r.id} className="px-3 py-2 text-center whitespace-nowrap">
                  <div className="flex flex-col items-center gap-1">
                    <div className="font-medium">{r.nombre}</div>
                    <PermissionGate need={["perm.write"]} fallback={null}>
                      <div className="flex gap-1">
                        <button
                          onClick={() => applyCol(r.id, true)}
                          className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700"
                        >
                          Todos
                        </button>
                        <button
                          onClick={() => applyCol(r.id, false)}
                          className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700"
                        >
                          Ninguno
                        </button>
                      </div>
                    </PermissionGate>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map(p => (
              <tr key={p.key} className="border-t">
                <td className="px-3 py-2 align-top">
                  <div className="font-medium">{p.nombre}</div>
                  <div className="text-xs text-gray-500">{p.codigo}</div>
                  {p.descripcion && <div className="text-xs text-gray-600">{p.descripcion}</div>}

                  <PermissionGate need={["perm.write"]} fallback={null}>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => applyRow(p.key, true)}
                        className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700"
                      >
                        Aplicar a todos
                      </button>
                      <button
                        onClick={() => applyRow(p.key, false)}
                        className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700"
                      >
                        Quitar de todos
                      </button>
                    </div>
                  </PermissionGate>
                </td>

                {roles.map(r => {
                  const on = has(r.id, p.key);
                  return (
                    <td key={`${p.key}-${r.id}`} className="px-3 py-2 text-center">
                      <PermissionGate need={["perm.write"]} fallback={
                        <span className={`inline-block px-2 py-1 rounded ${on ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {on ? "✓" : "—"}
                        </span>
                      }>
                        <button
                          onClick={() => toggleCell(r.id, p.key)}
                          className={`px-2 py-1 rounded ${on ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}
                        >
                          {on ? "✓" : "—"}
                        </button>
                      </PermissionGate>
                    </td>
                  );
                })}
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={1 + roles.length}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

