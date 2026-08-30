import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import { Copy, Layers3, Loader2, Plus, Save, Trash2 } from "lucide-react";

const gradoLabel = (grado) => grado?.nombre || `${grado?.ordinal || grado?.id || ""}°`;

const sortSecciones = (items) =>
  [...items].sort((a, b) => {
    const nombreCmp = String(a.nombre).localeCompare(String(b.nombre));
    if (nombreCmp !== 0) return nombreCmp;
    const ao = a.grados?.ordinal ?? a.grado_id;
    const bo = b.grados?.ordinal ?? b.grado_id;
    return ao - bo;
  });

const groupBySeccion = (items) =>
  items.reduce((acc, item) => {
    const key = item.nombre || "Sin seccion";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

export default function SeccionesForm() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivel = params.get("nivel") || "Secundaria";

  const versionNum = 1;
  const [grados, setGrados] = useState([]);
  const [secciones, setSecciones] = useState([]);
  const [form, setForm] = useState({ grado_id: "", nombre: "A", copiar_de: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const seccionesOrdenadas = useMemo(() => sortSecciones(secciones), [secciones]);
  const seccionesAgrupadas = useMemo(() => groupBySeccion(seccionesOrdenadas), [seccionesOrdenadas]);
  const seccionesDelGrado = useMemo(
    () => seccionesOrdenadas.filter((s) => String(s.grado_id) === String(form.grado_id)),
    [seccionesOrdenadas, form.grado_id]
  );

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, versionNum]);

  async function cargarDatos() {
    setLoading(true);
    setError("");
    try {
      const [gradosResp, seccionesResp] = await Promise.all([
        supabase
          .from("grados")
          .select("id, nombre, nivel, ordinal")
          .eq("nivel", nivel)
          .order("ordinal", { ascending: true }),
        supabase
          .from("secciones")
          .select("id, grado_id, nombre, nivel, version_num, activo")
          .eq("nivel", nivel)
          .eq("version_num", versionNum),
      ]);

      if (gradosResp.error) throw gradosResp.error;
      if (seccionesResp.error) throw seccionesResp.error;

      const gradosData = gradosResp.data || [];
      const gradosById = new Map(gradosData.map((g) => [g.id, g]));

      setGrados(gradosData);
      setSecciones(
        (seccionesResp.data || [])
          .filter((s) => s.activo !== false)
          .map((s) => ({
            ...s,
            grados: gradosById.get(s.grado_id) || null,
          }))
      );

      if (!form.grado_id && gradosResp.data?.[0]?.id) {
        setForm((prev) => ({ ...prev, grado_id: String(gradosResp.data[0].id) }));
      }
    } catch (e) {
      console.error(e);
      setError(
        e?.code === "42P01"
          ? "La tabla secciones todavia no existe. Primero ejecuta la migracion SQL."
          : "No se pudieron cargar las secciones."
      );
    } finally {
      setLoading(false);
    }
  }

  async function copiarDatosSeccion(origenId, destinoId) {
    if (!origenId || !destinoId) return;

    const [horasResp, asigResp] = await Promise.all([
      supabase
        .from("horas_curso_grado")
        .select("curso_id, grado_id, horas, nivel, version_num")
        .eq("seccion_id", origenId)
        .eq("nivel", nivel)
        .eq("version_num", versionNum),
      supabase
        .from("asignaciones")
        .select("curso_id, grado_id, docente_id, horas, nivel, version_num")
        .eq("seccion_id", origenId)
        .eq("nivel", nivel)
        .eq("version_num", versionNum),
    ]);

    if (horasResp.error) throw horasResp.error;
    if (asigResp.error) throw asigResp.error;

    const horas = (horasResp.data || []).map((r) => ({ ...r, seccion_id: destinoId }));
    const asignaciones = (asigResp.data || []).map((r) => ({ ...r, seccion_id: destinoId }));

    if (horas.length) {
      const { error } = await supabase
        .from("horas_curso_grado")
        .upsert(horas, { onConflict: "curso_id,grado_id,seccion_id,nivel,version_num" });
      if (error) throw error;
    }

    if (asignaciones.length) {
      const { error } = await supabase
        .from("asignaciones")
        .upsert(asignaciones, { onConflict: "curso_id,grado_id,seccion_id,nivel,version_num" });
      if (error) throw error;
    }
  }

  async function guardarSeccion(e) {
    e.preventDefault();
    if (!form.grado_id) return alert("Selecciona un grado.");
    if (!form.nombre.trim()) return alert("Ingresa el nombre de la seccion.");

    setSaving(true);
    setError("");
    try {
      const payload = {
        grado_id: Number(form.grado_id),
        nombre: form.nombre.trim().toUpperCase(),
        nivel,
        version_num: versionNum,
      };

      const { data, error: insertError } = await supabase
        .from("secciones")
        .upsert(payload, { onConflict: "grado_id,nombre,nivel,version_num" })
        .select("id")
        .single();
      if (insertError) throw insertError;

      if (form.copiar_de && data?.id) {
        await copiarDatosSeccion(Number(form.copiar_de), data.id);
      }

      setForm((prev) => ({ ...prev, nombre: "", copiar_de: "" }));
      await cargarDatos();
    } catch (e2) {
      console.error(e2);
      setError("No se pudo guardar la seccion.");
    } finally {
      setSaving(false);
    }
  }

  async function eliminarSeccion(id) {
    const ok = window.confirm(
      "Eliminar esta seccion tambien puede eliminar sus asignaciones, horas y horarios relacionados. Deseas continuar?"
    );
    if (!ok) return;

    const { error: deleteError } = await supabase.from("secciones").delete().eq("id", id);
    if (deleteError) {
      console.error(deleteError);
      alert("No se pudo eliminar la seccion.");
      return;
    }
    await cargarDatos();
  }

  async function crearSeccionesBasicas() {
    if (!grados.length) return;
    setSaving(true);
    try {
      const rows = grados.map((g) => ({
        grado_id: g.id,
        nombre: "A",
        nivel,
        version_num: versionNum,
      }));
      const { error: upsertError } = await supabase
        .from("secciones")
        .upsert(rows, { onConflict: "grado_id,nombre,nivel,version_num" });
      if (upsertError) throw upsertError;
      await cargarDatos();
    } catch (e) {
      console.error(e);
      alert("No se pudieron crear las secciones base.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="mt-4 mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl md:text-2xl font-semibold text-slate-800">
            <Layers3 className="size-6 text-blue-600" />
            Secciones - {nivel}
          </h1>
          <p className="text-sm text-slate-600">
            Crea grupos como 1 A, 1 B o 2 A para usar en asignaciones y horarios.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={crearSeccionesBasicas}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Copy className="size-4" />
            Crear A en todos
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form
        onSubmit={guardarSeccion}
        className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4"
      >
        <div>
          <label htmlFor="seccion-grado" className="mb-1 block text-sm font-medium text-slate-700">
            Grado
          </label>
          <select
            id="seccion-grado"
            value={form.grado_id}
            onChange={(e) => setForm((prev) => ({ ...prev, grado_id: e.target.value, copiar_de: "" }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {grados.map((g) => (
              <option key={g.id} value={g.id}>
                {gradoLabel(g)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="seccion-nombre" className="mb-1 block text-sm font-medium text-slate-700">
            Seccion
          </label>
          <input
            id="seccion-nombre"
            value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
            placeholder="A, B, C"
            maxLength={8}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
          />
        </div>

        <div>
          <label htmlFor="seccion-copiar" className="mb-1 block text-sm font-medium text-slate-700">
            Copiar datos de
          </label>
          <select
            id="seccion-copiar"
            value={form.copiar_de}
            onChange={(e) => setForm((prev) => ({ ...prev, copiar_de: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">No copiar</option>
            {seccionesDelGrado.map((s) => (
              <option key={s.id} value={s.id}>
                {gradoLabel(s.grados)} {s.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving || loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar
          </button>
        </div>
      </form>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
          Cargando secciones...
        </div>
      ) : seccionesOrdenadas.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
          No hay secciones registradas.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(seccionesAgrupadas).map(([nombreSeccion, items]) => (
            <section key={nombreSeccion} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Seccion {nombreSeccion}</h2>
                  <p className="text-xs text-slate-500">{items.length} grados</p>
                </div>
              </header>
              <div className="divide-y divide-slate-100">
                {items.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{gradoLabel(s.grados)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => eliminarSeccion(s.id)}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="size-4" />
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
        <div className="flex items-start gap-2">
          <Plus className="mt-0.5 size-4 text-blue-700" />
          <p>
            Para crear 1 B: selecciona primer grado, escribe B y opcionalmente copia los datos de 1 A.
          </p>
        </div>
      </div>
    </div>
  );
}
