// src/components/AsignacionDocenteCurso.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

// 🔎 Iconografía coherente con tus otras vistas (lucide-react)
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Clock8,
  Loader2,
  Plus,
  Save,
  Trash2,
  Users2,
  Users,
} from "lucide-react";

const grados = ["1°", "2°", "3°", "4°", "5°"]; // 1..5 (ids 1..5)

export default function AsignacionDocenteCurso() {
  const {
    docentes,
    setDocentes,
    asignaciones,
    setAsignaciones,
    horasCursos,
    setHorasCursos,
  } = useDocentes();

  const [docentesEspecializados, setDocentesEspecializados] = useState({});
  const [cursos, setCursos] = useState([]);
  const [nuevoCurso, setNuevoCurso] = useState("");
  const [bloquesUsados, setBloquesUsados] = useState(0);
  const [limiteBloques, setLimiteBloques] = useState(200);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nivel = new URLSearchParams(useLocation().search).get("nivel") || "Secundaria";
  const nivelSeguro = nivel || "Secundaria";

  // ------- Carga inicial -------
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        await Promise.all([
          cargarDocentes(),
          cargarDocentesConEspecialidad(),
          cargarCursos(),
          cargarHorasCursoGrado(),
          cargarAsignacionesExistentes(),
          cargarLimiteBloques(),
        ]);
      } catch (e) {
        console.error(e);
        setError("No se pudo cargar la información inicial.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel]);

  // ------- Recalcular bloques usados -------
  useEffect(() => {
    let total = 0;
    for (const curso of cursos) {
      const cursoId = curso.id;
      if (horasCursos[cursoId]) {
        for (const gradoId in horasCursos[cursoId]) {
          total += horasCursos[cursoId][gradoId] || 0;
        }
      }
    }
    setBloquesUsados(total);
  }, [horasCursos, cursos]);

  // ------- Derivados -------
  const progresoBloques = useMemo(() => {
    const total = Math.max(limiteBloques, 1);
    return Math.min(100, Math.round((bloquesUsados / total) * 100));
  }, [bloquesUsados, limiteBloques]);

  const { resumenHoras, docentesFiltrados } = useMemo(() => {
    const contador = {};
    for (const cursoId in asignaciones) {
      for (const gradoId in asignaciones[cursoId]) {
        const { docente_id } = asignaciones[cursoId][gradoId];
        const horas = horasCursos[cursoId]?.[gradoId] || 0;
        if (!contador[docente_id]) contador[docente_id] = 0;
        contador[docente_id] += horas;
      }
    }
    const filtrados = (docentes || []).filter((d) => d.nivel === nivelSeguro);
    return { resumenHoras: contador, docentesFiltrados: filtrados };
  }, [asignaciones, horasCursos, docentes, nivelSeguro]);

  // ------- Supabase fetchers -------
  async function cargarLimiteBloques() {
    const { data, error } = await supabase
      .from("franjas_horarias")
      .select("bloque")
      .eq("nivel", nivelSeguro);
    if (error) console.error(error);
    const bloquesPorDia = data?.length || 8; // fallback 8
    setLimiteBloques(bloquesPorDia * 5 * grados.length);
  }

  async function cargarDocentes() {
    const { data, error } = await supabase
      .from("docentes")
      .select("id, nombre, jornada_total, nivel")
      .eq("nivel", nivelSeguro)
      .eq("activo", true);
    if (error) console.error(error);
    setDocentes(data || []);
  }

  async function cargarDocentesConEspecialidad() {
    const { data, error } = await supabase
      .from("docentes")
      .select("id, nombre, docente_curso(curso_id), nivel")
      .eq("nivel", nivelSeguro)
      .eq("activo", true);
    if (error) console.error(error);
    const mapa = {};
    for (const d of data || []) {
      mapa[d.id] = {
        nombre: d.nombre,
        cursos: (d.docente_curso || []).map((dc) => dc.curso_id),
      };
    }
    setDocentesEspecializados(mapa);
  }

  async function cargarCursos() {
    const { data, error } = await supabase
      .from("cursos")
      .select("id, nombre, nivel")
      .eq("nivel", nivelSeguro)
      .order("nombre", { ascending: true });
    if (error) console.error(error);
    setCursos(data || []);
  }

  async function cargarHorasCursoGrado() {
    const { data, error } = await supabase
      .from("horas_curso_grado")
      .select("horas, curso_id, grado_id");
    if (error) console.error(error);
    const map = {};
    (data || []).forEach(({ curso_id, grado_id, horas }) => {
      if (!map[curso_id]) map[curso_id] = {};
      map[curso_id][grado_id] = horas;
    });
    setHorasCursos(map);
  }

  async function cargarAsignacionesExistentes() {
    const { data, error } = await supabase
      .from("asignaciones")
      .select("curso_id, grado_id, docente_id, nivel")
      .eq("nivel", nivelSeguro);
    if (error) console.error(error);
    const map = {};
    (data || []).forEach(({ curso_id, grado_id, docente_id }) => {
      if (!map[curso_id]) map[curso_id] = {};
      map[curso_id][grado_id] = { docente_id, curso_id, grado_id };
    });
    setAsignaciones(map);
  }

  // ------- Acciones -------
  async function agregarCurso() {
    if (!nuevoCurso.trim()) return;
    try {
      const { data, error } = await supabase
        .from("cursos")
        .insert({ nombre: nuevoCurso.trim(), nivel: nivelSeguro })
        .select();
      if (error) throw error;
      if (data) {
        const cursoId = data[0].id;
        const nuevasHoras = grados.map((_, idx) => ({
          curso_id: cursoId,
          grado_id: idx + 1,
          horas: 0,
        }));
        await supabase.from("horas_curso_grado").insert(nuevasHoras);
        setNuevoCurso("");
        await Promise.all([cargarCursos(), cargarHorasCursoGrado()]);
      }
    } catch (e) {
      console.error(e);
      setError("No se pudo agregar el curso.");
    }
  }

  async function editarHoras(cursoId, gradoId, nuevaHora) {
    const horaAnterior = horasCursos[cursoId]?.[gradoId] || 0;
    const nuevaHoraInt = parseInt(nuevaHora || 0, 10);
    const bloquesActualizados = bloquesUsados - horaAnterior + nuevaHoraInt;

    if (bloquesActualizados > limiteBloques) {
      alert(`⚠️ No puedes exceder los ${limiteBloques} bloques totales disponibles.`);
      return;
    }

    await supabase
      .from("horas_curso_grado")
      .upsert({ curso_id: cursoId, grado_id: gradoId, horas: nuevaHoraInt });
    await cargarHorasCursoGrado();
  }

  async function eliminarCurso(cursoId) {
    const confirmar = window.confirm(
      "¿Deseas eliminar este curso y todas sus asignaciones y horas? Esta acción es irreversible."
    );
    if (!confirmar) return;

    const { error } = await supabase.from("cursos").delete().eq("id", cursoId);
    if (error) {
      console.error("Error al eliminar el curso:", error);
      alert("❌ No se pudo eliminar el curso.");
      return;
    }

    alert("✅ Curso eliminado correctamente.");
    await Promise.all([
      cargarCursos(),
      cargarHorasCursoGrado(),
      cargarAsignacionesExistentes(),
    ]);
  }

  function handleAsignacion(cursoId, gradoId, docenteId) {
    const nuevaHora = horasCursos[cursoId]?.[gradoId] || 0;
    const nuevoId = parseInt(docenteId, 10);
    const actual = asignaciones[cursoId]?.[gradoId];
    const anteriorId = actual?.docente_id;

    let horasActuales = 0;
    for (const cId in asignaciones) {
      for (const gId in asignaciones[cId]) {
        const asignacion = asignaciones[cId][gId];
        if (asignacion.docente_id === nuevoId && !(cId == cursoId && gId == gradoId)) {
          horasActuales += horasCursos[cId]?.[gId] || 0;
        }
      }
    }

    const horasPrevias = anteriorId === nuevoId ? nuevaHora : 0;
    const nuevasHorasAsignadas = horasActuales - horasPrevias + nuevaHora;
    const docente = docentes.find((d) => d.id === nuevoId);
    const jornada = docente?.jornada_total || 0;

    if (nuevasHorasAsignadas > jornada) {
      alert(
        `❌ ${docente?.nombre || "El docente"} ya tiene asignadas ${horasActuales} horas y su jornada es de ${jornada}. No se puede asignar más.`
      );
      return;
    }

    setAsignaciones((prev) => ({
      ...prev,
      [cursoId]: {
        ...prev[cursoId],
        [gradoId]: {
          docente_id: nuevoId,
          curso_id: parseInt(cursoId, 10),
          grado_id: parseInt(gradoId, 10),
        },
      },
    }));
  }

  async function eliminarAsignacion(cursoId, gradoId) {
    setAsignaciones((prev) => {
      const actualizado = { ...prev };
      if (actualizado[cursoId]) {
        delete actualizado[cursoId][gradoId];
        if (Object.keys(actualizado[cursoId]).length === 0) delete actualizado[cursoId];
      }
      return actualizado;
    });

    await supabase
      .from("asignaciones")
      .delete()
      .eq("curso_id", cursoId)
      .eq("grado_id", gradoId)
      .eq("nivel", nivelSeguro);
  }

  function asignarATodosLosGrados(cursoId, docenteId) {
    setAsignaciones((prev) => ({
      ...prev,
      [cursoId]: grados.reduce((acc, _, idx) => {
        acc[idx + 1] = {
          docente_id: parseInt(docenteId, 10),
          curso_id: parseInt(cursoId, 10),
          grado_id: idx + 1,
        };
        return acc;
      }, {}),
    }));
  }

  async function guardarTodo() {
    setSaving(true);
    setError("");
    try {
      const registros = [];
      const horasPorDocente = {};

      for (const cursoId in asignaciones) {
        for (const gradoId in asignaciones[cursoId]) {
          const item = asignaciones[cursoId][gradoId];
          const horas = horasCursos[cursoId]?.[gradoId] || 0;
          if (!item?.docente_id || isNaN(horas) || horas <= 0) continue;
          registros.push({
            curso_id: parseInt(cursoId, 10),
            grado_id: parseInt(gradoId, 10),
            docente_id: parseInt(item.docente_id, 10),
            nivel: nivelSeguro,
          });
          if (!horasPorDocente[item.docente_id]) horasPorDocente[item.docente_id] = 0;
          horasPorDocente[item.docente_id] += horas;
        }
      }

      const { data: docentesConHoras, error: errorDocentes } = await supabase
        .from("docentes")
        .select("id, jornada_total")
        .eq("nivel", nivelSeguro)
        .eq("activo", true);
      if (errorDocentes) throw errorDocentes;

      for (const docenteId in horasPorDocente) {
        const docente = docentesConHoras.find((d) => d.id === parseInt(docenteId, 10));
        const disponible = docente?.jornada_total || 0;
        const asignadas = horasPorDocente[docenteId];
        if (asignadas > disponible) {
          alert(
            `❌ El docente con ID ${docenteId} tiene asignadas ${asignadas} horas, pero su jornada es de ${disponible}.`
          );
          setSaving(false);
          return;
        }
      }

      const registrosHoras = [];
      for (const cursoId in horasCursos) {
        for (const gradoId in horasCursos[cursoId]) {
          const valor = horasCursos[cursoId][gradoId];
          const horas = parseInt(valor, 10);
          if (isNaN(horas) || horas <= 0) continue;
          registrosHoras.push({ curso_id: parseInt(cursoId, 10), grado_id: parseInt(gradoId, 10), horas });
        }
      }

      const { error: errorHoras } = await supabase
        .from("horas_curso_grado")
        .upsert(registrosHoras, { onConflict: ["curso_id", "grado_id"] });
      if (errorHoras) throw errorHoras;

      const registrosUnicos = Array.from(
        new Map(registros.map((r) => [`${r.curso_id}-${r.grado_id}-${r.nivel}`, r])).values()
      );

      const { error } = await supabase
        .from("asignaciones")
        .upsert(registrosUnicos, { onConflict: "curso_id,grado_id,nivel" });
      if (error) throw error;

      alert("✅ Todo guardado correctamente.");
    } catch (e) {
      console.error(e);
      setError("Ocurrió un error al guardar.");
      alert("❌ Error al guardar asignaciones u horas.");
    } finally {
      setSaving(false);
    }
  }

  // ------- Render -------
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Breadcrumbs />

      {/* ======= Encabezado principal sticky con icono ======= */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 mt-4 mb-4 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-slate-200">
        <div className="px-4 md:px-6 py-3 max-w-7xl mx-auto">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="size-6 text-blue-600" />
              <div>
                <h1 className="text-xl md:text-2xl font-semibold text-slate-800 leading-tight">
                  Asignación de Docentes y Horas
                </h1>
                <div className="mt-1">
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                    <Users className="size-3.5" />
                    Nivel — <strong className="font-semibold text-slate-700">{nivelSeguro}</strong>
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={guardarTodo}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-white shadow-sm hover:bg-blue-800 disabled:opacity-70 w-full sm:w-auto"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Guardar todo
            </button>
          </div>
        </div>
      </div>

      {/* Barra de estado */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-700">
            <Users2 className="size-5" />
            <span className="text-sm">Docentes activos:</span>
            <strong>{docentesFiltrados.length}</strong>
          </div>
          <div className="w-full md:w-1/2">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Bloques usados</span>
              <span>
                {bloquesUsados} / {limiteBloques} ({progresoBloques}%)
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full ${progresoBloques >= 100 ? "bg-rose-500" : "bg-blue-600"}`}
                style={{ width: `${progresoBloques}%` }}
              />
            </div>
          </div>
        </div>
        {progresoBloques > 100 && (
          <p className="mt-2 flex items-center gap-2 text-sm text-rose-600">
            <AlertTriangle className="size-4" /> No puedes exceder el límite total de bloques.
          </p>
        )}
      </div>

      {/* Error global */}
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">
          {error}
        </div>
      )}

      {/* Crear curso */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={nuevoCurso}
            onChange={(e) => {
              const valor = e.target.value;
              const esValido = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]{0,30}$/.test(valor);
              if (esValido || valor === "") setNuevoCurso(valor);
            }}
            placeholder="Nombre del curso"
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            onClick={agregarCurso}
            disabled={!nuevoCurso.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700 disabled:opacity-60"
          >
            <Plus className="size-4" /> Agregar
          </button>
          <span
            className={`ml-4 text-sm font-semibold ${
              bloquesUsados > limiteBloques ? "text-rose-600" : "text-slate-700"
            }`}
          >
            Bloques usados: {bloquesUsados} / {limiteBloques}
          </span>
        </div>
      </div>

      {/* Tabla: Horas programadas */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto mb-8">
        <header className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
          <Clock8 className="size-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-800">Horas programadas por curso y grado</h3>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="border-t border-b border-slate-200 px-3 py-2 text-left">Curso</th>
              {grados.map((g, idx) => (
                <th key={idx} className="border-t border-b border-slate-200 px-3 py-2 text-center">
                  {g}
                </th>
              ))}
              <th className="border-t border-b border-slate-200 px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cursos.map((curso) => (
              <tr key={curso.id} className="odd:bg-white even:bg-slate-50/40">
                <td className="border-t border-slate-200 px-3 py-2 font-medium text-slate-800">
                  {curso.nombre}
                </td>
                {grados.map((_, idx) => (
                  <td key={idx} className="border-t border-slate-200 px-3 py-2 text-center">
                    <input
                      type="number"
                      min="2"
                      max="7"
                      value={horasCursos[curso.id]?.[idx + 1] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") return editarHoras(curso.id, idx + 1, 0);
                        const n = parseInt(v, 10);
                        if (n >= 2 && n <= 7) editarHoras(curso.id, idx + 1, n);
                        else alert("⚠️ Las horas deben estar entre 2 y 7.");
                      }}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </td>
                ))}
                <td className="border-t border-slate-200 px-3 py-2 text-center">
                  <button
                    onClick={() => eliminarCurso(curso.id)}
                    className="inline-flex items-center gap-1 text-rose-600 hover:underline"
                  >
                    <Trash2 className="size-4" /> Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Tabla: Asignación de docentes */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <header className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
          <Users2 className="size-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-800">Asignar docentes a cada curso y grado</h3>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="border-t border-b border-slate-200 px-3 py-2 text-left">Curso</th>
              {grados.map((g, idx) => (
                <th key={idx} className="border-t border-b border-slate-200 px-3 py-2 text-center">
                  {g}
                </th>
              ))}
              <th className="border-t border-b border-slate-200 px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cursos.map((curso) => (
              <tr key={curso.id} className="odd:bg-white even:bg-slate-50/40">
                <td className="border-t border-slate-200 px-3 py-2 font-medium text-slate-800">
                  {curso.nombre}
                </td>
                {grados.map((_, idx) => (
                  <td key={idx} className="border-t border-slate-200 px-3 py-2">
                    <select
                      value={asignaciones[curso.id]?.[idx + 1]?.docente_id || ""}
                      onChange={(e) => handleAsignacion(curso.id, idx + 1, e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">-- Asignar --</option>
                      {Object.entries(docentesEspecializados).map(([id, info]) =>
                        info.cursos.includes(curso.id) ? (
                          <option key={id} value={id}>
                            {info.nombre}
                          </option>
                        ) : null
                      )}
                    </select>
                    {asignaciones[curso.id]?.[idx + 1] && (
                      <button
                        onClick={() => eliminarAsignacion(curso.id, idx + 1)}
                        className="mt-1 text-xs text-rose-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                ))}
                <td className="border-t border-slate-200 px-3 py-2 text-center">
                  <button
                    onClick={() => {
                      const primerGrado = 1;
                      const docenteId = asignaciones[curso.id]?.[primerGrado]?.docente_id;
                      if (docenteId) asignarATodosLosGrados(curso.id, docenteId);
                      else alert("Primero asigna al menos un grado.");
                    }}
                    className="rounded bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700"
                  >
                    Asignar a todos
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Resumen por docente */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
          <BarChart3 className="size-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-800">Resumen de horas asignadas por docente</h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="border-t border-b border-slate-200 px-4 py-2 text-left">Docente</th>
                <th className="border-t border-b border-slate-200 px-4 py-2 text-center">Horas asignadas</th>
                <th className="border-t border-b border-slate-200 px-4 py-2 text-center">Horas faltantes</th>
              </tr>
            </thead>
            <tbody>
              {docentesFiltrados.map((docente) => {
                const asignadas = resumenHoras[docente.id] || 0;
                const faltantes = Math.max(docente.jornada_total - asignadas, 0);
                return (
                  <tr key={docente.id} className="odd:bg-white even:bg-slate-50/40">
                    <td className="border-t border-slate-200 px-4 py-2">{docente.nombre}</td>
                    <td className="border-t border-slate-200 px-4 py-2 text-center">{asignadas}</td>
                    <td
                      className={`border-t border-slate-200 px-4 py-2 text-center ${
                        faltantes > 0 ? "text-rose-600 font-semibold" : ""
                      }`}
                    >
                      {faltantes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {loading && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-white/60">
          <div className="rounded-xl bg-white p-4 shadow ring-1 ring-slate-200 inline-flex items-center gap-3">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm text-slate-700">Cargando…</span>
          </div>
        </div>
      )}
    </div>
  );
}
