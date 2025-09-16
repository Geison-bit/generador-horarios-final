import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";
import { Building2, Save, X, Pencil, Trash2, Search, Loader2 } from "lucide-react";

export default function AulasForm() {
  const [formData, setFormData] = useState({ nombre: "", piso: "", tipo: "" });
  const [errors, setErrors] = useState({});
  const [aulas, setAulas] = useState([]);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [aulaEditandoId, setAulaEditandoId] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivel = params.get("nivel") || "Secundaria";

  const inputNombreRef = useRef(null);

  useEffect(() => {
    cargarAulas();
  }, [nivel]);

  // --- Helpers ---
  const norm = (s) => s.trim().replace(/\s+/g, " ");
  const pisoToNum = (p) => {
    const m = String(p || "").match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };

  const sortAulas = (items) =>
    [...items].sort((a, b) => pisoToNum(a.piso) - pisoToNum(b.piso) || a.nombre.localeCompare(b.nombre));

  const aulasFiltradas = useMemo(() => {
    const q = norm(filter).toLowerCase();
    if (!q) return aulas;
    return aulas.filter((a) =>
      [a.nombre, a.piso, a.tipo].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [filter, aulas]);

  // --- Carga ---
  async function cargarAulas() {
    setLoading(true);
    const { data, error } = await supabase
      .from("aulas")
      .select()
      .eq("nivel", nivel);
    if (error) console.error(error);
    setAulas(sortAulas(data || []));
    setLoading(false);
  }

  // --- Validación ---
  async function validateForm() {
    const newErrors = {};
    const nombreLimpio = norm(formData.nombre);
    const pisoNum = parseInt(formData.piso, 10);

    if (!nombreLimpio) newErrors.nombre = "El nombre es obligatorio.";
    else if (nombreLimpio.length < 3) newErrors.nombre = "Debe tener al menos 3 caracteres.";
    else {
      const { data, error } = await supabase
        .from("aulas")
        .select("id")
        .eq("nivel", nivel)
        .ilike("nombre", nombreLimpio); // coincidencia exacta case-insensitive
      if (!error && data && data.length > 0 && (!modoEdicion || data[0].id !== aulaEditandoId)) {
        newErrors.nombre = "Ya existe un aula con este nombre.";
      }
    }

    if (!formData.piso) newErrors.piso = "El piso es obligatorio.";
    else if (isNaN(pisoNum) || pisoNum <= 0) newErrors.piso = "Debe ser un número positivo.";

    if (!formData.tipo) newErrors.tipo = "Seleccione un tipo.";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // --- Handlers ---
  function handleInputChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!(await validateForm())) return;

    setSaving(true);
    const payload = {
      nombre: norm(formData.nombre),
      tipo: formData.tipo,
      piso: `Piso ${formData.piso}`,
      nivel,
    };

    if (modoEdicion && aulaEditandoId) {
      const { error } = await supabase.from("aulas").update(payload).eq("id", aulaEditandoId);
      if (error) alert("❌ No se pudo actualizar el aula.");
    } else {
      const { error } = await supabase.from("aulas").insert(payload);
      if (error) alert("❌ No se pudo crear el aula.");
    }

    setSaving(false);
    cancelarEdicion();
    cargarAulas();
  }

  function editarAula(aula) {
    setModoEdicion(true);
    setAulaEditandoId(aula.id);
    setFormData({ nombre: aula.nombre, piso: aula.piso.replace("Piso ", "").trim(), tipo: aula.tipo });
    setErrors({});
    setTimeout(() => inputNombreRef.current?.focus(), 0);
  }

  function cancelarEdicion() {
    setModoEdicion(false);
    setAulaEditandoId(null);
    setFormData({ nombre: "", tipo: "", piso: "" });
    setErrors({});
  }

  async function eliminarAula(id) {
    if (!window.confirm("¿Estás seguro de que deseas eliminar esta aula?")) return;
    const { error } = await supabase.from("aulas").delete().eq("id", id);
    if (error) alert("No se pudo eliminar el aula. Revise si está relacionada a horarios o asignaciones.");
    else cargarAulas();
  }

  // --- UI ---
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-semibold text-slate-800 flex items-center gap-2">
          <Building2 className="size-6 text-blue-600" /> Registrar Aula — {nivel}
        </h2>
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar por nombre, piso o tipo…"
            className="w-60 rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Formulario */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 md:p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"
      >
        <div className="flex flex-col">
          <label htmlFor="nombre" className="mb-1 text-sm font-medium text-slate-700">
            Nombre del Aula
          </label>
          <input
            ref={inputNombreRef}
            id="nombre"
            name="nombre"
            type="text"
            placeholder="Ej: A-101"
            value={formData.nombre}
            onChange={handleInputChange}
            maxLength={15}
            className={`rounded-lg border px-3 py-2 text-sm ${errors.nombre ? "border-rose-500" : "border-slate-300"} focus:outline-none focus:ring-2 focus:ring-blue-600`}
          />
          {errors.nombre && <p className="text-rose-600 text-xs mt-1">{errors.nombre}</p>}
        </div>

        <div className="flex flex-col">
          <label htmlFor="piso" className="mb-1 text-sm font-medium text-slate-700">
            Número de Piso
          </label>
          <input
            id="piso"
            name="piso"
            type="number"
            placeholder="Ej: 3"
            value={formData.piso}
            onChange={handleInputChange}
            min="1"
            className={`rounded-lg border px-3 py-2 text-sm ${errors.piso ? "border-rose-500" : "border-slate-300"} focus:outline-none focus:ring-2 focus:ring-blue-600 w-28`}
          />
          {errors.piso && <p className="text-rose-600 text-xs mt-1">{errors.piso}</p>}
        </div>

        <div className="flex flex-col">
          <label htmlFor="tipo" className="mb-1 text-sm font-medium text-slate-700">
            Tipo de Aula
          </label>
          <select
            id="tipo"
            name="tipo"
            value={formData.tipo}
            onChange={handleInputChange}
            className={`rounded-lg border px-3 py-2 text-sm ${errors.tipo ? "border-rose-500" : "border-slate-300"} focus:outline-none focus:ring-2 focus:ring-blue-600`}
          >
            <option value="">Seleccione…</option>
            <option value="Teórica">Teórica</option>
            <option value="Laboratorio">Laboratorio</option>
            <option value="Cómputo">Cómputo</option>
          </select>
          {errors.tipo && <p className="text-rose-600 text-xs mt-1">{errors.tipo}</p>}
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white shadow ${
              modoEdicion ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
            } disabled:opacity-70`}
            title={modoEdicion ? "Guardar cambios" : "Agregar aula"}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {modoEdicion ? "Guardar cambios" : "Agregar aula"}
          </button>
          {modoEdicion && (
            <button
              type="button"
              onClick={cancelarEdicion}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-500 px-4 py-2 text-white shadow hover:bg-slate-600"
            >
              <X className="size-4" /> Cancelar
            </button>
          )}
        </div>
      </form>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-700">
            <tr>
              <th className="border-b border-slate-200 px-4 py-3">Nombre</th>
              <th className="border-b border-slate-200 px-4 py-3">Piso</th>
              <th className="border-b border-slate-200 px-4 py-3">Tipo</th>
              <th className="border-b border-slate-200 px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Cargando aulas…
                </td>
              </tr>
            ) : aulasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No hay aulas registradas.
                </td>
              </tr>
            ) : (
              aulasFiltradas.map((aula) => (
                <tr key={aula.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-200 px-4 py-2">{aula.nombre}</td>
                  <td className="border-b border-slate-200 px-4 py-2">{aula.piso}</td>
                  <td className="border-b border-slate-200 px-4 py-2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                      {aula.tipo}
                    </span>
                  </td>
                  <td className="border-b border-slate-200 px-4 py-2">
                    <div className="flex justify-center items-center gap-2">
                      <button
                        onClick={() => editarAula(aula)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-blue-600 hover:bg-blue-50"
                        title="Editar aula"
                      >
                        <Pencil className="size-4" /> Editar
                      </button>
                      <button
                        onClick={() => eliminarAula(aula.id)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-rose-600 hover:bg-rose-50"
                        title="Eliminar aula"
                      >
                        <Trash2 className="size-4" /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
