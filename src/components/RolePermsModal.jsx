import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Modal para gestionar permisos de un rol (checklist).
 * Requisitos en BD:
 *  - permisos(id, codigo, nombre, descripcion)
 *  - rol_permisos(rol_id, permiso_id) PK compuesta
 */
export default function RolePermsModal({ role, onClose }) {
  const [permisos, setPermisos] = useState([]);          // catálogo completo
  const [rolePerms, setRolePerms] = useState(new Set()); // ids activos para el rol
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const [p1, p2] = await Promise.all([
        supabase.from("permisos")
          .select("id,codigo,nombre,descripcion")
          .order("nombre"),
        supabase.from("rol_permisos")
          .select("permiso_id")
          .eq("rol_id", role.id),
      ]);
      if (!p1.error) setPermisos(p1.data || []);
      if (!p2.error) setRolePerms(new Set((p2.data || []).map(r => r.permiso_id)));
    })();
  }, [role.id]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return permisos;
    return permisos.filter(p =>
      `${p.nombre} ${p.codigo} ${p.descripcion || ""}`.toLowerCase().includes(s)
    );
  }, [permisos, q]);

  const toggle = async (permisoId) => {
    const had = rolePerms.has(permisoId);
    // Optimista
    const next = new Set(rolePerms);
    if (had) next.delete(permisoId); else next.add(permisoId);
    setRolePerms(next);

    if (had) {
      const { error } = await supabase
        .from("rol_permisos")
        .delete()
        .match({ rol_id: role.id, permiso_id: permisoId });
      if (error) {
        alert("No se pudo quitar el permiso: " + error.message);
        setRolePerms(rolePerms); // revertir
      }
    } else {
      const { error } = await supabase
        .from("rol_permisos")
        .insert({ rol_id: role.id, permiso_id: permisoId });
      if (error) {
        alert("No se pudo asignar el permiso: " + error.message);
        setRolePerms(rolePerms); // revertir
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Permisos del rol: {role.nombre}</h2>
          <p className="text-sm text-slate-500">Marca qué acciones puede realizar este rol.</p>
        </div>

        <div className="p-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar permiso…"
            className="w-full px-3 py-2 border rounded-xl"
          />
        </div>

        <div className="max-h-[55vh] overflow-auto px-4 pb-4">
          <ul className="divide-y">
            {list.map((p) => {
              const on = rolePerms.has(p.id);
              return (
                <li key={p.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{p.nombre}</div>
                    <div className="text-xs text-slate-500">{p.codigo}</div>
                    {p.descripcion && (
                      <div className="text-sm text-slate-600">{p.descripcion}</div>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(p.id)}
                    />
                    <span className={`text-sm ${on ? "text-green-700" : "text-slate-500"}`}>
                      {on ? "Permitido" : "No permitido"}
                    </span>
                  </label>
                </li>
              );
            })}
            {list.length === 0 && (
              <li className="py-6 text-center text-slate-500">Sin resultados</li>
            )}
          </ul>
        </div>

        <div className="p-4 border-t flex justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-xl border">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
