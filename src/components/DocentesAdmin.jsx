// src/components/DocentesAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "./Breadcrumbs"; // ✅ agregado

// Modelo base alineado a tu BD
const emptyForm = {
  id: null,
  nombre: "",
  apellido: "",
  tipo_profesor: "Contratado", // Contratado | Nombrado
  jornada_total: 0,            // horas por semana
  aula_id: null,               // FK a aulas.id
  nivel: "Secundaria",
  especialidades: "",          // opcional
  activo: true,                // opcional
};

export default function DocentesAdmin() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivelURL = params.get("nivel") || "Secundaria";

  const [rows, setRows] = useState([]);
  const [aulas, setAulas] = useState([]); // {id,codigo}
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, nivel: nivelURL });

  // ---------- Cargar aulas
  const loadAulas = async () => {
    const { data, error } = await supabase
      .from("aulas")
      .select("id, codigo")
      .order("codigo", { ascending: true });
    if (!error) setAulas(data || []);
  };

  // ---------- Cargar docentes
  const loadDocentes = async () => {
    setLoading(true);
    let query = supabase
      .from("docentes")
      .select("id, nombre, apellido, tipo_profesor, jornada_total, aula_id, nivel, activo, especialidades")
      .order("apellido", { ascending: true });

    if (nivelURL) query = query.eq("nivel", nivelURL);

    const { data, error } = await query;
    if (error) {
      console.error("❌ Error cargando docentes:", error);
      setRows([]);
    } else {
      const normalized = (data || []).map((d) => ({
        id: d.id,
        nombre: d.nombre,
        apellido: d.apellido,
        tipo_profesor: d.tipo_profesor,
        jornada_total: d.jornada_total,
        aula_id: d.aula_id,
        nivel: d.nivel,
        especialidades: d.especialidades ?? "",
        activo: d.activo ?? true,
      }));
      setRows(normalized);
    }
    setLoading(false);
  };

  useEffect(() => {
    setForm((f) => ({ ...f, nivel: nivelURL }));
    loadAulas();
    loadDocentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivelURL]);

  // ---------- Búsqueda local
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      `${r.apellido} ${r.nombre} ${r.tipo_profesor} ${r.jornada_total} ${r.especialidades}`
        .toLowerCase()
        .includes(s)
    );
  }, [rows, q]);

  // ---------- Helpers
  const aulaLabel = (id) => aulas.find((a) => a.id === id)?.codigo || "";

  const onNew = () => {
    setForm({ ...emptyForm, nivel: nivelURL });
    setOpenForm(true);
  };

  const onEdit = (r) => {
    setForm({ ...r });
    setOpenForm(true);
  };

  // Guardado tolerante a columnas opcionales
  const saveWithFallback = async (table, payload, id) => {
    const tryOnce = async (data) => {
      if (id) return await supabase.from(table).update(data).eq("id", id).select().single();
      return await supabase.from(table).insert(data).select().single();
    };
    let resp = await tryOnce(payload);
    if (resp.error && (resp.error.code === "42703" || /column .* does not exist/i.test(resp.error.message))) {
      const match = resp.error.message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i);
      const badKey = match?.[1];
      if (badKey && badKey in payload) {
        const { [badKey]: _omit, ...rest } = payload;
        resp = await tryOnce(rest);
      }
    }
    return resp;
  };

  const onSave = async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    const payload = {
      nombre: form.nombre?.trim(),
      apellido: form.apellido?.trim(),
      tipo_profesor: form.tipo_profesor,
      jornada_total: Number(form.jornada_total || 0),
      aula_id: form.aula_id ? Number(form.aula_id) : null,
      nivel: form.nivel,
      especialidades: form.especialidades?.trim(),
      activo: !!form.activo,
    };
    const resp = await saveWithFallback("docentes", payload, form.id || null);
    if (resp.error) {
      alert("❌ Error guardando docente: " + resp.error.message);
      setLoading(false);
      return;
    }
    setOpenForm(false);
    await loadDocentes();
    setLoading(false);
  };

  const toggleActivo = async (r) => {
    const { error } = await supabase.from("docentes").update({ activo: !r.activo }).eq("id", r.id);
    if (error) {
      console.error("❌ Error toggle activo:", error);
      if (error.code === "42703" || /column .*activo/i.test(error.message)) {
        alert("La columna 'activo' no existe. Ejecuta:\nALTER TABLE docentes ADD COLUMN activo boolean DEFAULT true;");
      } else {
        alert(error.message);
      }
      return;
    }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, activo: !r.activo } : x)));
  };

  // ---------- UI
  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* ✅ Breadcrumbs arriba */}
      <Breadcrumbs />

      <div className="flex items-center justify-between mb-4 mt-4">
        <h1 className="text-2xl font-semibold">Gestión de Docentes ({nivelURL})</h1>
        <button onClick={onNew} className="px-3 py-2 rounded-xl bg-blue-600 text-white hover:opacity-90">
          Nuevo Docente
        </button>
      </div>

      <div className="mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por apellidos, nombres, especialidades o aula…"
          className="w-full px-3 py-2 border rounded-xl"
        />
      </div>

      <div className="overflow-x-auto border rounded-2xl">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Apellido</th>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Horas</th>
              <th className="px-3 py-2">Aula</th>
              <th className="px-3 py-2">Especialidades</th>
              <th className="px-3 py-2">Activo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.apellido}</td>
                <td className="px-3 py-2">{r.nombre}</td>
                <td className="px-3 py-2 text-center">{r.tipo_profesor}</td>
                <td className="px-3 py-2 text-center">{r.jornada_total}</td>
                <td className="px-3 py-2">{aulaLabel(r.aula_id)}</td>
                <td className="px-3 py-2">{r.especialidades}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleActivo(r)}
                    className={`px-2 py-1 rounded-lg ${r.activo ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}
                    title="Activar/Desactivar"
                  >
                    {r.activo ? "Sí" : "No"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => onEdit(r)} className="px-2 py-1 rounded-lg bg-amber-500 text-white">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={8}>
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* -------- Modal -------- */}
      {openForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <form onSubmit={onSave} className="bg-white rounded-2xl p-4 w-full max-w-2xl shadow-xl">
            <h2 className="text-xl font-semibold mb-3">{form.id ? "Editar docente" : "Nuevo docente"}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Apellido</label>
                <input
                  className="w-full px-3 py-2 border rounded-xl"
                  value={form.apellido}
                  onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm">Nombre</label>
                <input
                  className="w-full px-3 py-2 border rounded-xl"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm">Tipo</label>
                <select
                  className="w-full px-3 py-2 border rounded-xl"
                  value={form.tipo_profesor}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_profesor: e.target.value }))}
                >
                  <option>Contratado</option>
                  <option>Nombrado</option>
                </select>
              </div>
              <div>
                <label className="text-sm">Horas (jornada semanal)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full px-3 py-2 border rounded-xl"
                  value={form.jornada_total}
                  onChange={(e) => setForm((f) => ({ ...f, jornada_total: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm">Aula</label>
                <select
                  className="w-full px-3 py-2 border rounded-xl"
                  value={form.aula_id || ""}
                  onChange={(e) => setForm((f) => ({ ...f, aula_id: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">— Sin aula —</option>
                  {aulas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.codigo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm">Nivel</label>
                <select
                  className="w-full px-3 py-2 border rounded-xl"
                  value={form.nivel}
                  onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value }))}
                >
                  <option>Primaria</option>
                  <option>Secundaria</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm">Especialidades (opcional, separadas por coma)</label>
                <input
                  className="w-full px-3 py-2 border rounded-xl"
                  value={form.especialidades}
                  onChange={(e) => setForm((f) => ({ ...f, especialidades: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="chk-activo"
                  type="checkbox"
                  checked={!!form.activo}
                  onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                />
                <label htmlFor="chk-activo" className="text-sm">
                  Activo (opcional)
                </label>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpenForm(false)} className="px-3 py-2 rounded-xl border">
                Cancelar
              </button>
              <button disabled={loading} className="px-3 py-2 rounded-xl bg-blue-600 text-white">
                {loading ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
