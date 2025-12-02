// src/modals/RolePermsModal.jsx
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

export default function RolePermsModal({ role, onClose }) {
  const [allPerms, setAllPerms] = useState([]);
  const [assigned, setAssigned] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  // --------------------------------------------------
  // 1. Cargar permisos del sistema + permisos del rol
  // --------------------------------------------------
  useEffect(() => {
    if (!role?.id) return;
    (async () => {
      setLoading(true);

      const [{ data: perms }, { data: rp }] = await Promise.all([
        supabase.from("permissions").select("key, description").order("key"),
        supabase
          .from("role_permissions")
          .select("permission_key")
          .eq("role_id", role.id),
      ]);

      setAllPerms(perms ?? []);
      setAssigned(new Set((rp ?? []).map((x) => x.permission_key)));
      setLoading(false);
    })();
  }, [role?.id]);

  const isOn = (key) => assigned.has(key);

  // --------------------------------------------------
  // 2. Guardar cambios
  // --------------------------------------------------
  async function toggle(key) {
    if (!role?.id) return;

    try {
      if (isOn(key)) {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .match({ role_id: role.id, permission_key: key });

        if (error) throw error;
        setAssigned((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role_id: role.id, permission_key: key });

        if (error) throw error;
        setAssigned((prev) => new Set(prev).add(key));
      }
    } catch (e) {
      alert("❌ No se pudo actualizar: " + (e?.message || e));
    }
  }

  // --------------------------------------------------
  // 3. GRUPOS (Permisos técnicos + Interfaces)
  // --------------------------------------------------

  const SYSTEM_PERMS = {
    "Usuarios": ["user.read", "user.write", "user.status.write"],
    "Roles": ["role.read", "role.write", "perm.read", "perm.write"],
    "Horarios": ["horario.read", "horario.write"],
    "Restricciones": ["restric.read", "restric.write"],
    "Auditoría": ["audit.read"],
  };

  const UI_PERMS = {
    "Interfaces Docente": [
      "ui.restric.docente",
      "ui.horario.docente",
      "ui.horario.general",
    ],
    "Interfaces Gestión": [
      "ui.docentes",
      "ui.aulas",
      "ui.franjas",
      "ui.asignacion",
      "ui.restricciones.panel",
    ],
    "Interfaces Admin": [
      "ui.admin.docentes",
      "ui.admin.roles",
      "ui.admin.cuentas",
      "ui.audit",
    ],
  };

  // --------------------------------------------------
  // 4. Render por grupo
  // --------------------------------------------------
  function renderGroup(title, items) {
    const filtered = items.filter((k) => {
      if (!q.trim()) return true;
      return k.toLowerCase().includes(q.toLowerCase());
    });

    if (filtered.length === 0) return null;

    return (
      <div className="mb-3 rounded-lg sm:rounded-xl border bg-white shadow-sm">
        <div className="px-3 py-2 border-b bg-slate-50 font-semibold text-sm">
          {title}
        </div>

        <div className="divide-y">
          {filtered.map((key) => {
            const perm = allPerms.find((p) => p.key === key);
            const desc = perm?.description || "—";

            return (
              <div key={key} className="flex items-center justify-between p-2">
                <div>
                  <div className="font-mono text-xs">{key}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </div>

                <button
                  onClick={() => toggle(key)}
                  className={
                    "px-3 py-1 rounded-md sm:rounded-lg text-sm " +
                    (isOn(key)
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-200 text-gray-700")
                  }
                >
                  {isOn(key) ? "✓" : "—"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // 5. UI
  // --------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl border overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-semibold">
            Configuración del rol:{" "}
            <span className="text-violet-700">{role?.nombre}</span>
          </h3>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border bg-white"
          >
            Cerrar
          </button>
        </div>

        {/* Buscador */}
        <div className="p-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar permiso o interfaz…"
            className="w-full px-3 py-2 border rounded-lg sm:rounded-xl mb-4"
          />

          {loading ? (
            <div className="p-4 text-gray-500">Cargando permisos…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[65vh] overflow-auto">

              {/* Columna izquierda */}
              <div>
                <h4 className="text-sm font-bold text-slate-600 mb-2">
                  🔧 Permisos Técnicos
                </h4>

                {Object.entries(SYSTEM_PERMS).map(([title, items]) =>
                  renderGroup(title, items)
                )}
              </div>

              {/* Columna derecha */}
              <div>
                <h4 className="text-sm font-bold text-slate-600 mb-2">
                  🖥 Interfaces Visibles
                </h4>

                {Object.entries(UI_PERMS).map(([title, items]) =>
                  renderGroup(title, items)
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

