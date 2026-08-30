import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useDocentes } from "../../contexts/DocenteContext";
import { supabase } from "../../supabaseClient";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Clock8,
  Layers3,
  Loader2,
  Plus,
  Save,
  Trash2,
  Users2,
  Users,
} from "lucide-react";

const GRADOS_FALLBACK = [
  { id: 1, grado_id: 1, label: "1°" },
  { id: 2, grado_id: 2, label: "2°" },
  { id: 3, grado_id: 3, label: "3°" },
  { id: 4, grado_id: 4, label: "4°" },
  { id: 5, grado_id: 5, label: "5°" },
];

const hasMissingColumn = (error, column) =>
  error?.code === "42703" || new RegExp(`column .*${column}`, "i").test(error?.message || "");

const hasMissingTable = (error) => error?.code === "42P01";

const labelSeccion = (s) => {
  const grado = s.grados?.nombre || `${s.grados?.ordinal || s.grado_id}°`;
  return `${grado} ${s.nombre}`;
};

const sortTargets = (items) =>
  [...items].sort((a, b) => {
    const seccionCmp = String(a.nombre || "").localeCompare(String(b.nombre || ""));
    if (seccionCmp !== 0) return seccionCmp;
    const ao = a.grados?.ordinal ?? a.grado_id;
    const bo = b.grados?.ordinal ?? b.grado_id;
    return ao - bo;
  });

export default function AsignacionDocenteCurso() {
  const { docentes, setDocentes, asignaciones, setAsignaciones, horasCursos, setHorasCursos } =
    useDocentes();

  const [docentesEspecializados, setDocentesEspecializados] = useState({});
  const [cursos, setCursos] = useState([]);
  const [secciones, setSecciones] = useState([]);
  const [usaSecciones, setUsaSecciones] = useState(false);
  const [nuevoCurso, setNuevoCurso] = useState("");
  const [bloquesUsados, setBloquesUsados] = useState(0);
  const [limiteBloques, setLimiteBloques] = useState(200);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nivel = new URLSearchParams(useLocation().search).get("nivel") || "Secundaria";
  const nivelSeguro = nivel || "Secundaria";
  const versionNum = 1;

  const targets = useMemo(() => {
    if (usaSecciones && secciones.length) {
      return sortTargets(secciones).map((s) => ({
        id: s.id,
        grado_id: s.grado_id,
        seccion_id: s.id,
        seccion_nombre: s.nombre,
        label: labelSeccion(s),
      }));
    }
    return GRADOS_FALLBACK.map((g) => ({ ...g, seccion_id: null }));
  }, [usaSecciones, secciones]);

  const targetGroups = useMemo(() => {
    if (!usaSecciones) return [{ nombre: "Grados", items: targets }];
    const groups = new Map();
    targets.forEach((target) => {
      const key = target.seccion_nombre || "Sin seccion";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(target);
    });
    return Array.from(groups.entries()).map(([nombre, items]) => ({ nombre, items }));
  }, [targets, usaSecciones]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        await Promise.all([cargarDocentes(), cargarDocentesConEspecialidad(), cargarCursos()]);
        await cargarSecciones();
      } catch (e) {
        console.error(e);
        setError("No se pudo cargar la informacion inicial.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivelSeguro, versionNum]);

  useEffect(() => {
    (async () => {
      if (!targets.length) return;
      setLoading(true);
      try {
        await Promise.all([
          cargarHorasCursoTarget(),
          cargarAsignacionesExistentes(),
          cargarLimiteBloques(),
        ]);
      } catch (e) {
        console.error(e);
        setError("No se pudieron cargar horas o asignaciones.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.length, usaSecciones, nivelSeguro, versionNum]);

  useEffect(() => {
    let total = 0;
    for (const curso of cursos) {
      const cursoId = curso.id;
      if (horasCursos[cursoId]) {
        for (const targetId in horasCursos[cursoId]) total += horasCursos[cursoId][targetId] || 0;
      }
    }
    setBloquesUsados(total);
  }, [horasCursos, cursos]);

  const progresoBloques = useMemo(() => {
    const total = Math.max(limiteBloques, 1);
    return Math.min(100, Math.round((bloquesUsados / total) * 100));
  }, [bloquesUsados, limiteBloques]);

  const { resumenHoras, docentesFiltrados } = useMemo(() => {
    const contador = {};
    for (const cursoId in asignaciones) {
      for (const targetId in asignaciones[cursoId]) {
        const { docente_id } = asignaciones[cursoId][targetId];
        const horas = horasCursos[cursoId]?.[targetId] || 0;
        if (!contador[docente_id]) contador[docente_id] = 0;
        contador[docente_id] += horas;
      }
    }
    const filtrados = (docentes || []).filter(
      (d) => d.nivel === nivelSeguro && d.version_num === versionNum
    );
    return { resumenHoras: contador, docentesFiltrados: filtrados };
  }, [asignaciones, horasCursos, docentes, nivelSeguro, versionNum]);

  const resumenPorGrupo = useMemo(() => {
    const bloquesPorColumna = Math.max(1, Math.round(limiteBloques / Math.max(targets.length, 1)));
    return targetGroups.map((group) => {
      const targetIds = new Set(group.items.map((target) => String(target.id)));
      const horasDocente = {};
      let bloques = 0;

      for (const cursoId in horasCursos) {
        for (const targetId in horasCursos[cursoId] || {}) {
          if (!targetIds.has(String(targetId))) continue;
          bloques += Number(horasCursos[cursoId][targetId] || 0);
        }
      }

      for (const cursoId in asignaciones) {
        for (const targetId in asignaciones[cursoId] || {}) {
          if (!targetIds.has(String(targetId))) continue;
          const docenteId = asignaciones[cursoId][targetId]?.docente_id;
          const horas = Number(horasCursos[cursoId]?.[targetId] || 0);
          if (!docenteId || horas <= 0) continue;
          horasDocente[docenteId] = (horasDocente[docenteId] || 0) + horas;
        }
      }

      const limite = bloquesPorColumna * Math.max(group.items.length, 1);
      const progreso = Math.min(100, Math.round((bloques / Math.max(limite, 1)) * 100));
      return {
        ...group,
        bloques,
        limite,
        progreso,
        horasDocente,
      };
    });
  }, [targetGroups, horasCursos, asignaciones, limiteBloques, targets.length]);

  async function cargarSecciones() {
    const [gradosResp, seccionesResp] = await Promise.all([
      supabase
        .from("grados")
        .select("id, nombre, ordinal")
        .eq("nivel", nivelSeguro)
        .order("ordinal", { ascending: true }),
      supabase
        .from("secciones")
        .select("id, grado_id, nombre, nivel, version_num, activo")
        .eq("nivel", nivelSeguro)
        .eq("version_num", versionNum),
    ]);

    const { data, error: seccionesError } = seccionesResp;

    if (hasMissingTable(seccionesError)) {
      setUsaSecciones(false);
      setSecciones([]);
      return;
    }
    if (gradosResp.error) throw gradosResp.error;
    if (seccionesError) throw seccionesError;

    const gradosById = new Map((gradosResp.data || []).map((g) => [g.id, g]));
    const activas = (data || [])
      .filter((s) => s.activo !== false)
      .map((s) => ({ ...s, grados: gradosById.get(s.grado_id) || null }));
    setSecciones(activas);
    setUsaSecciones(activas.length > 0);
  }

  async function cargarLimiteBloques() {
    const { data, error: franjasError } = await supabase
      .from("franjas_horarias")
      .select("bloque")
      .eq("nivel", nivelSeguro)
      .eq("version_num", versionNum);
    if (franjasError) throw franjasError;
    const bloquesPorDia = data?.length || 8;
    setLimiteBloques(bloquesPorDia * 5 * Math.max(targets.length, 1));
  }

  async function cargarDocentes() {
    const { data, error: docentesError } = await supabase
      .from("docentes")
      .select("id, nombre, apellido, jornada_total, nivel, version_num")
      .eq("nivel", nivelSeguro)
      .eq("version_num", versionNum)
      .eq("activo", true);
    if (docentesError) throw docentesError;
    setDocentes(data || []);
  }

  async function cargarDocentesConEspecialidad() {
    const { data, error: docentesError } = await supabase
      .from("docentes")
      .select("id, nombre, docente_curso(curso_id), nivel")
      .eq("nivel", nivelSeguro)
      .eq("version_num", versionNum)
      .eq("activo", true);
    if (docentesError) throw docentesError;

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
    const { data, error: cursosError } = await supabase
      .from("cursos")
      .select("id, nombre, nivel")
      .eq("nivel", nivelSeguro)
      .eq("version_num", versionNum)
      .order("nombre", { ascending: true });
    if (cursosError) throw cursosError;
    setCursos(data || []);
  }

  async function cargarHorasCursoTarget() {
    let query = supabase
      .from("horas_curso_grado")
      .select("horas, curso_id, grado_id, seccion_id")
      .eq("nivel", nivelSeguro)
      .eq("version_num", versionNum);
    if (usaSecciones) query = query.in("seccion_id", targets.map((t) => t.seccion_id));

    let { data, error: horasError } = await query;
    if (hasMissingColumn(horasError, "seccion_id")) {
      const fallback = await supabase
        .from("horas_curso_grado")
        .select("horas, curso_id, grado_id")
        .eq("version_num", versionNum);
      data = fallback.data;
      horasError = fallback.error;
    }
    if (horasError) throw horasError;

    const map = {};
    (data || []).forEach(({ curso_id, grado_id, seccion_id, horas }) => {
      const targetId = usaSecciones ? seccion_id : grado_id;
      if (!targetId) return;
      if (!map[curso_id]) map[curso_id] = {};
      map[curso_id][targetId] = horas;
    });
    setHorasCursos(map);
  }

  async function cargarAsignacionesExistentes() {
    let query = supabase
      .from("asignaciones")
      .select("curso_id, grado_id, seccion_id, docente_id, nivel")
      .eq("nivel", nivelSeguro)
      .eq("version_num", versionNum);
    if (usaSecciones) query = query.in("seccion_id", targets.map((t) => t.seccion_id));

    let { data, error: asigError } = await query;
    if (hasMissingColumn(asigError, "seccion_id")) {
      const fallback = await supabase
        .from("asignaciones")
        .select("curso_id, grado_id, docente_id, nivel")
        .eq("nivel", nivelSeguro)
        .eq("version_num", versionNum);
      data = fallback.data;
      asigError = fallback.error;
    }
    if (asigError) throw asigError;

    const map = {};
    (data || []).forEach(({ curso_id, grado_id, seccion_id, docente_id }) => {
      const targetId = usaSecciones ? seccion_id : grado_id;
      if (!targetId) return;
      if (!map[curso_id]) map[curso_id] = {};
      map[curso_id][targetId] = { docente_id, curso_id, grado_id, seccion_id };
    });
    setAsignaciones(map);
  }

  async function agregarCurso() {
    if (!nuevoCurso.trim()) return;
    try {
      const { data, error: cursoError } = await supabase
        .from("cursos")
        .insert({ nombre: nuevoCurso.trim(), nivel: nivelSeguro, version_num: versionNum })
        .select();
      if (cursoError) throw cursoError;

      const cursoId = data?.[0]?.id;
      if (cursoId) {
        const nuevasHoras = targets.map((t) => ({
          curso_id: cursoId,
          grado_id: t.grado_id,
          ...(usaSecciones ? { seccion_id: t.seccion_id } : {}),
          horas: 0,
          nivel: nivelSeguro,
          version_num: versionNum,
        }));
        if (nuevasHoras.length) await supabase.from("horas_curso_grado").insert(nuevasHoras);
      }
      setNuevoCurso("");
      await Promise.all([cargarCursos(), cargarHorasCursoTarget()]);
    } catch (e) {
      console.error(e);
      setError("No se pudo agregar el curso.");
    }
  }

  async function editarHoras(cursoId, target, nuevaHora) {
    const targetId = target.id;
    const horaAnterior = horasCursos[cursoId]?.[targetId] || 0;
    const nuevaHoraInt = parseInt(nuevaHora || 0, 10);
    const bloquesActualizados = bloquesUsados - horaAnterior + nuevaHoraInt;

    if (bloquesActualizados > limiteBloques) {
      alert(`No puedes exceder los ${limiteBloques} bloques totales disponibles.`);
      return;
    }

    const payload = {
      curso_id: cursoId,
      grado_id: target.grado_id,
      ...(usaSecciones ? { seccion_id: target.seccion_id } : {}),
      horas: nuevaHoraInt,
      nivel: nivelSeguro,
      version_num: versionNum,
    };
    const conflict = "curso_id,grado_id,seccion_id,nivel,version_num";
    const { error: horasError } = await supabase
      .from("horas_curso_grado")
      .upsert(payload, { onConflict: conflict });
    if (horasError) {
      console.error(horasError);
      alert("No se pudieron guardar las horas.");
      return;
    }
    await cargarHorasCursoTarget();
  }

  async function eliminarCurso(cursoId) {
    const confirmar = window.confirm(
      "Deseas eliminar este curso y todas sus asignaciones y horas? Esta accion es irreversible."
    );
    if (!confirmar) return;

    const { error: cursoError } = await supabase
      .from("cursos")
      .delete()
      .eq("id", cursoId)
      .eq("version_num", versionNum);
    if (cursoError) {
      console.error(cursoError);
      alert("No se pudo eliminar el curso.");
      return;
    }

    await Promise.all([cargarCursos(), cargarHorasCursoTarget(), cargarAsignacionesExistentes()]);
  }

  function handleAsignacion(cursoId, target, docenteId) {
    const nuevaHora = horasCursos[cursoId]?.[target.id] || 0;
    const nuevoId = parseInt(docenteId, 10);
    if (!nuevoId) return eliminarAsignacion(cursoId, target);

    const actual = asignaciones[cursoId]?.[target.id];
    const anteriorId = actual?.docente_id;

    let horasActuales = 0;
    for (const cId in asignaciones) {
      for (const tId in asignaciones[cId]) {
        const asignacion = asignaciones[cId][tId];
        if (asignacion.docente_id === nuevoId && !(cId == cursoId && tId == target.id)) {
          horasActuales += horasCursos[cId]?.[tId] || 0;
        }
      }
    }

    const horasPrevias = anteriorId === nuevoId ? nuevaHora : 0;
    const nuevasHorasAsignadas = horasActuales - horasPrevias + nuevaHora;
    const docente = docentes.find((d) => d.id === nuevoId);
    const jornada = docente?.jornada_total || 0;

    if (nuevasHorasAsignadas > jornada) {
      alert(
        `${docente?.nombre || "El docente"} ya tiene asignadas ${horasActuales} horas y su jornada es de ${jornada}.`
      );
      return;
    }

    setAsignaciones((prev) => ({
      ...prev,
      [cursoId]: {
        ...prev[cursoId],
        [target.id]: {
          docente_id: nuevoId,
          curso_id: parseInt(cursoId, 10),
          grado_id: target.grado_id,
          ...(usaSecciones ? { seccion_id: target.seccion_id } : {}),
        },
      },
    }));
  }

  async function eliminarAsignacion(cursoId, target) {
    setAsignaciones((prev) => {
      const actualizado = { ...prev };
      if (actualizado[cursoId]) {
        delete actualizado[cursoId][target.id];
        if (Object.keys(actualizado[cursoId]).length === 0) delete actualizado[cursoId];
      }
      return actualizado;
    });

    let query = supabase
      .from("asignaciones")
      .delete()
      .eq("curso_id", cursoId)
      .eq("nivel", nivelSeguro)
      .eq("version_num", versionNum);
    query = usaSecciones ? query.eq("seccion_id", target.seccion_id) : query.eq("grado_id", target.grado_id);
    await query;
  }

  function asignarATodos(cursoId, docenteId) {
    const nuevoId = parseInt(docenteId, 10);
    if (!nuevoId) return;
    setAsignaciones((prev) => ({
      ...prev,
      [cursoId]: targets.reduce((acc, t) => {
        acc[t.id] = {
          docente_id: nuevoId,
          curso_id: parseInt(cursoId, 10),
          grado_id: t.grado_id,
          ...(usaSecciones ? { seccion_id: t.seccion_id } : {}),
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
        for (const targetId in asignaciones[cursoId]) {
          const item = asignaciones[cursoId][targetId];
          const horas = horasCursos[cursoId]?.[targetId] || 0;
          if (!item?.docente_id || isNaN(horas) || horas <= 0) continue;
          registros.push({
            curso_id: parseInt(cursoId, 10),
            grado_id: item.grado_id,
            ...(usaSecciones ? { seccion_id: item.seccion_id } : {}),
            docente_id: parseInt(item.docente_id, 10),
            horas,
            nivel: nivelSeguro,
            version_num: versionNum,
          });
          if (!horasPorDocente[item.docente_id]) horasPorDocente[item.docente_id] = 0;
          horasPorDocente[item.docente_id] += horas;
        }
      }

      for (const docenteId in horasPorDocente) {
        const docente = docentesFiltrados.find((d) => d.id === parseInt(docenteId, 10));
        const disponible = docente?.jornada_total || 0;
        const asignadas = horasPorDocente[docenteId];
        if (asignadas > disponible) {
          alert(`El docente con ID ${docenteId} tiene ${asignadas} horas, pero su jornada es ${disponible}.`);
          setSaving(false);
          return;
        }
      }

      const registrosHoras = [];
      for (const cursoId in horasCursos) {
        for (const targetId in horasCursos[cursoId]) {
          const target = targets.find((t) => String(t.id) === String(targetId));
          if (!target) continue;
          const horas = parseInt(horasCursos[cursoId][targetId], 10);
          if (isNaN(horas) || horas <= 0) continue;
          registrosHoras.push({
            curso_id: parseInt(cursoId, 10),
            grado_id: target.grado_id,
            ...(usaSecciones ? { seccion_id: target.seccion_id } : {}),
            horas,
            nivel: nivelSeguro,
            version_num: versionNum,
          });
        }
      }

      const horasConflict = "curso_id,grado_id,seccion_id,nivel,version_num";
      if (registrosHoras.length) {
        const { error: horasError } = await supabase
          .from("horas_curso_grado")
          .upsert(registrosHoras, { onConflict: horasConflict });
        if (horasError) throw horasError;
      }

      const asignacionConflict = "curso_id,grado_id,seccion_id,nivel,version_num";
      if (registros.length) {
        const keyFn = (r) =>
          usaSecciones
            ? `${r.curso_id}-${r.seccion_id}-${r.nivel}-${r.version_num}`
            : `${r.curso_id}-${r.grado_id}-${r.nivel}-${r.version_num}`;
        const registrosUnicos = Array.from(new Map(registros.map((r) => [keyFn(r), r])).values());
        const { error: asigError } = await supabase
          .from("asignaciones")
          .upsert(registrosUnicos, { onConflict: asignacionConflict });
        if (asigError) throw asigError;
      }

      alert("Todo guardado correctamente.");
    } catch (e) {
      console.error(e);
      setError("Ocurrio un error al guardar.");
      alert("Error al guardar asignaciones u horas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 mt-4 mb-4 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-slate-200">
        <div className="px-4 md:px-6 py-3 max-w-7xl mx-auto">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="size-6 text-blue-600" />
              <div>
                <h1 className="text-xl md:text-2xl font-semibold text-slate-800 leading-tight">
                  Asignacion de Docentes y Horas
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                    <Users className="size-3.5" />
                    Nivel <strong className="font-semibold text-slate-700">{nivelSeguro}</strong>
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                    <Layers3 className="size-3.5" />
                    {usaSecciones ? "Por secciones" : "Por grados"}
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

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Users2 className="size-5" />
            <span className="text-sm">Docentes activos:</span>
            <strong>{docentesFiltrados.length}</strong>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {resumenPorGrupo.map((group) => (
              <div key={group.nombre} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Bloques usados - {usaSecciones ? `Seccion ${group.nombre}` : group.nombre}</span>
                  <span>
                    {group.bloques} / {group.limite} ({group.progreso}%)
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-2 rounded-full ${group.progreso >= 100 ? "bg-rose-500" : "bg-blue-600"}`}
                    style={{ width: `${group.progreso}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        {!usaSecciones && (
          <p className="mt-3 flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="size-4" />
            No hay secciones activas. Se usara el modo por grado.
          </p>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={nuevoCurso}
            onChange={(e) => setNuevoCurso(e.target.value)}
            placeholder="Nombre del curso"
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            onClick={agregarCurso}
            disabled={!nuevoCurso.trim() || !targets.length}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700 disabled:opacity-60"
          >
            <Plus className="size-4" /> Agregar
          </button>
          <span className="ml-4 text-sm font-semibold text-slate-700">
            Columnas: {targets.length} {usaSecciones ? "secciones" : "grados"}
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto mb-8">
        <header className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
          <Clock8 className="size-4 text-slate-700" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Carga semanal por curso y seccion</h3>
            <p className="text-xs text-slate-500">
              Ingresa solamente el total de horas. La division en sesiones se aplica automaticamente.
            </p>
          </div>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            {usaSecciones && (
              <tr>
                <th className="border-t border-b border-slate-200 px-3 py-2 text-left" />
                {targetGroups.map((group) => (
                  <th
                    key={group.nombre}
                    colSpan={group.items.length}
                    className="border-t border-b border-slate-200 bg-blue-50 px-3 py-2 text-center text-blue-800"
                  >
                    Seccion {group.nombre}
                  </th>
                ))}
                <th className="border-t border-b border-slate-200 px-3 py-2 text-center" />
              </tr>
            )}
            <tr>
              <th className="border-t border-b border-slate-200 px-3 py-2 text-left">Curso</th>
              {targets.map((target) => (
                <th key={target.id} className="border-t border-b border-slate-200 px-3 py-2 text-center">
                  {target.label}
                </th>
              ))}
              <th className="border-t border-b border-slate-200 px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cursos.map((curso) => (
              <tr key={curso.id} className="odd:bg-white even:bg-slate-50/40">
                <td className="border-t border-slate-200 px-3 py-2 font-medium text-slate-800">{curso.nombre}</td>
                {targets.map((target) => (
                  <td key={`${curso.id}-${target.id}`} className="border-t border-slate-200 px-3 py-2 text-center">
                    <input
                      type="number"
                      min="0"
                      max="7"
                      value={horasCursos[curso.id]?.[target.id] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") return editarHoras(curso.id, target, 0);
                        const n = parseInt(v, 10);
                        if (n >= 0 && n <= 7) editarHoras(curso.id, target, n);
                        else alert("Las horas deben estar entre 0 y 7.");
                      }}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </td>
                ))}
                <td className="border-t border-slate-200 px-3 py-2 text-center">
                  <button onClick={() => eliminarCurso(curso.id)} className="inline-flex items-center gap-1 text-rose-600 hover:underline">
                    <Trash2 className="size-4" /> Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <header className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
          <Users2 className="size-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-800">Asignar docentes a cada curso y seccion</h3>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            {usaSecciones && (
              <tr>
                <th className="border-t border-b border-slate-200 px-3 py-2 text-left" />
                {targetGroups.map((group) => (
                  <th
                    key={group.nombre}
                    colSpan={group.items.length}
                    className="border-t border-b border-slate-200 bg-blue-50 px-3 py-2 text-center text-blue-800"
                  >
                    Seccion {group.nombre}
                  </th>
                ))}
                <th className="border-t border-b border-slate-200 px-3 py-2 text-center" />
              </tr>
            )}
            <tr>
              <th className="border-t border-b border-slate-200 px-3 py-2 text-left">Curso</th>
              {targets.map((target) => (
                <th key={target.id} className="border-t border-b border-slate-200 px-3 py-2 text-center">
                  {target.label}
                </th>
              ))}
              <th className="border-t border-b border-slate-200 px-3 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cursos.map((curso) => (
              <tr key={curso.id} className="odd:bg-white even:bg-slate-50/40">
                <td className="border-t border-slate-200 px-3 py-2 font-medium text-slate-800">{curso.nombre}</td>
                {targets.map((target) => (
                  <td key={`${curso.id}-${target.id}`} className="border-t border-slate-200 px-3 py-2">
                    <select
                      value={asignaciones[curso.id]?.[target.id]?.docente_id || ""}
                      onChange={(e) => handleAsignacion(curso.id, target, e.target.value)}
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
                    {asignaciones[curso.id]?.[target.id] && (
                      <button
                        onClick={() => eliminarAsignacion(curso.id, target)}
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
                      const primerTarget = targets[0];
                      const docenteId = asignaciones[curso.id]?.[primerTarget?.id]?.docente_id;
                      if (docenteId) asignarATodos(curso.id, docenteId);
                      else alert("Primero asigna la primera columna.");
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

      <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
          <BarChart3 className="size-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-800">Resumen de horas asignadas por docente y seccion</h3>
        </header>
        <div className="space-y-6 p-3">
          {resumenPorGrupo.map((group) => (
            <div key={group.nombre} className="overflow-x-auto rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">
                {usaSecciones ? `Seccion ${group.nombre}` : group.nombre}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-2 text-left">Docente</th>
                    <th className="border-b border-slate-200 px-4 py-2 text-center">Horas asignadas</th>
                    <th className="border-b border-slate-200 px-4 py-2 text-center">Horas faltantes</th>
                  </tr>
                </thead>
                <tbody>
                  {docentesFiltrados
                    .filter((docente) => (group.horasDocente[docente.id] || 0) > 0)
                    .map((docente) => {
                      const asignadas = group.horasDocente[docente.id] || 0;
                      const faltantes = Math.max(docente.jornada_total - asignadas, 0);
                      const nombreDocente = `${docente.nombre || ""} ${docente.apellido || ""}`.trim();
                      return (
                        <tr key={`${group.nombre}-${docente.id}`} className="odd:bg-white even:bg-slate-50/40">
                          <td className="border-t border-slate-200 px-4 py-2">{nombreDocente}</td>
                          <td className="border-t border-slate-200 px-4 py-2 text-center">{asignadas}</td>
                          <td className={`border-t border-slate-200 px-4 py-2 text-center ${faltantes > 0 ? "text-rose-600 font-semibold" : ""}`}>
                            {faltantes}
                          </td>
                        </tr>
                      );
                    })}
                  {docentesFiltrados.every((docente) => (group.horasDocente[docente.id] || 0) === 0) && (
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-center text-sm text-slate-500">
                        No hay docentes asignados en esta seccion.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
