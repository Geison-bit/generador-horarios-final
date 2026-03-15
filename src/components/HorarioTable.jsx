// src/components/HorarioTable.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import { generarHorarioConProgreso } from "../services/horarioService";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { CalendarRange, Clock3 } from "lucide-react";
import { loadReglasParaNivel } from "../services/restriccionesService";
import XLSXStyle from "xlsx-js-style";
import {
  listSharedScheduleGenerations,
  saveSharedScheduleGenerations,
} from "../services/sharedScheduleHistoryService";
const VERSION_OPTIONS = [1, 2, 3, 4, 5];
// --- PALETA Y MAPA DE COLORES (persistente en sesiÃ³n) ---
const coloresDisponibles = [
  "bg-red-300","bg-blue-300","bg-green-300","bg-yellow-300","bg-pink-300",
  "bg-purple-300","bg-indigo-300","bg-orange-300","bg-teal-300","bg-lime-300",
  "bg-cyan-300","bg-amber-300","bg-rose-300","bg-fuchsia-300","bg-sky-300"
];
const mapaDocenteColor = {};
const getColorPorDocente = (nombreDocente) => {
  if (!nombreDocente) return "bg-gray-200";
  if (!mapaDocenteColor[nombreDocente]) {
    const usados = Object.values(mapaDocenteColor);
    const disponibles = coloresDisponibles.filter(c => !usados.includes(c));
    const colorElegido =
      disponibles.length > 0
        ? disponibles[Math.floor(Math.random() * disponibles.length)]
        : coloresDisponibles[Math.floor(Math.random() * coloresDisponibles.length)];
    mapaDocenteColor[nombreDocente] = colorElegido;
  }
  return mapaDocenteColor[nombreDocente];
};

// Horario vacÃ­o helper
const esHorarioVacio = (horario) =>
  !horario?.some(dia => dia.some(bloque => bloque.some(curso => curso > 0)));

const normalizeScheduleEntry = (entry, fallbackCreatedAt = null) => {
  if (Array.isArray(entry)) {
    return {
      horario: entry,
      createdAt: fallbackCreatedAt,
      durationMs: null,
    };
  }
  if (entry && Array.isArray(entry.horario)) {
    return {
      horario: entry.horario,
      createdAt: entry.createdAt || entry.created_at || fallbackCreatedAt,
      durationMs: Number(entry.durationMs ?? entry.duration_ms ?? null) || null,
    };
  }
  return null;
};

const normalizeScheduleEntries = (entries) =>
  (entries || [])
    .map((entry) => normalizeScheduleEntry(entry))
    .filter(Boolean);

const formatGenerationTime = (value) => {
  if (!value) return "Sin hora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin hora";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatGenerationDuration = (value) => {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "Sin tiempo";
  const totalSeconds = durationMs / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${seconds.toFixed(1)} s`;
};

const getScheduleSignature = (horario) =>
  Array.isArray(horario) ? horario.flat(2).join(".") : "";

// helpers dias (evita problema con acentos)
const normalize = (s) =>
  (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Ã­ndice -> dÃ­a en SQL (sin acentos)
const diasSql = ["lunes", "martes", "miercoles", "jueves", "viernes"];

// Reglas por defecto
const DEFAULT_REGLAS = {
  disponibilidad_docente: true,
  no_solape_docente: true,
  bloques_consecutivos: true,
  distribuir_en_dias_distintos: true,
  no_puentes_docente: true,
  no_dias_consecutivos: true,
  omitir_cursos_1h: true,
  limitar_carga_docente_grado: true,
};

// Orden fijo y etiquetas para el badge "12345"
const RULES_ORDER = [
  { key: "disponibilidad_docente",       idx: 1, label: "Respetar disponibilidad del docente" },
  { key: "no_solape_docente",            idx: 2, label: "Evitar solape del mismo docente por bloque" },
  { key: "bloques_consecutivos",         idx: 3, label: "Usar bloques consecutivos por segmento" },
  { key: "distribuir_en_dias_distintos", idx: 4, label: "Distribuir segmentos en dÃ­as distintos" },
  { key: "no_puentes_docente",           idx: 5, label: "Evitar puentes del docente" },
  { key: "no_dias_consecutivos",         idx: 6, label: "Evitar dias consecutivos por curso" },
  { key: "omitir_cursos_1h",             idx: 7, label: "Omitir cursos con 1h" },
  { key: "limitar_carga_docente_grado",  idx: 8, label: "Maximo 3h por docente en un grado al dia" },
];

// Cargar horario guardado en BD y reconstruir la matriz
async function cargarHorarioDesdeBD(nivel, version) {
  const { data, error } = await supabase
    .from("horarios")
    .select("dia, bloque, curso_id, grado_id")
    .eq("nivel", nivel)
    .eq("version_num", version);

  if (error || !data || data.length === 0) return null;

  const dias = ["lunes", "martes", "miercoles", "jueves", "viernes"];
  const maxBloque = Math.max(...data.map((r) => r.bloque));
  const maxGrado = Math.max(...data.map((r) => r.grado_id));

  const horario = Array.from({ length: 5 }, () =>
    Array.from({ length: maxBloque + 1 }, () =>
      Array.from({ length: maxGrado }, () => 0)
    )
  );

  data.forEach((r) => {
    const d = dias.indexOf(normalize(r.dia || ""));
    const b = r.bloque;
    const g = nivel === "Primaria" ? r.grado_id - 6 : r.grado_id - 1;
    if (d >= 0 && b >= 0 && g >= 0) horario[d][b][g] = r.curso_id;
  });

  return horario;
}

const HorarioTable = () => {
  // --- STATE PRINCIPAL ---
  const [bloquesHorario, setBloquesHorario] = useState([]);
  const [bloqueOneBased, setBloqueOneBased] = useState(false);

  const [historialGeneraciones, setHistorialGeneraciones] = useState([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  
  const [vistaModo, setVistaModo] = useState("grados"); // "grados" | "dias"

  // Undo/Redo
  const [historyStack, setHistoryStack] = useState([]);   // array de horarios
  const [historyPointer, setHistoryPointer] = useState(-1);

  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [progresoStage, setProgresoStage] = useState("");
  const progresoObjetivoRef = useRef(0);
  const progresoTimerRef = useRef(null);
  const [asignacionesDesdeDB, setAsignacionesDesdeDB] = useState([]);
  const [cursosDesdeDB, setCursosDesdeDB] = useState([]);
  const [horasCursosDesdeDB, setHorasCursosDesdeDB] = useState([]);
  const [aulasDesdeDB, setAulasDesdeDB] = useState([]);

  // ediciÃ³n manual
  const [celdaActiva, setCeldaActiva] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cursosDisponiblesParaCelda, setCursosDisponiblesParaCelda] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [cursoAEliminar, setCursoAEliminar] = useState(null);

  // Ãšltima ediciÃ³n (opcional, desde audit_logs)
  const [ultimaEdicion, setUltimaEdicion] = useState(null);

  // --- NUEVO: restricciones efectivas (panel vs DB) ---
  // disponibilidadEfectiva[docenteId][`${dia}-${bloque0}`] => true (disponible) con bloque 0-based
  const [disponibilidadEfectiva, setDisponibilidadEfectiva] = useState({});
  const [reglasEfectivas, setReglasEfectivas] = useState(DEFAULT_REGLAS);
  const [usandoPanel, setUsandoPanel] = useState(false);

  // --- CONTEXTO Y RUTA ---
  const { docentes, restricciones, asignaciones, horasCursos, setHorarioGeneral } = useDocentes();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const version = Number(params.get("version")) || 1;
  const nivel = params.get("nivel") || "Secundaria";
  const storageKey = `historialHorarios:${nivel}:${version}`;
  const grados = (nivel === "Primaria")
    ? ["1°", "2°", "3°", "4°", "5°", "6°"]
    : ["1°", "2°", "3°", "4°", "5°"];
  const docentesPorVersion = useMemo(
    () => (docentes || []).filter((d) => d.nivel === nivel && d.version_num === version),
    [docentes, nivel, version]
  );
  const horasCursosPorVersion = useMemo(() => {
    const mapa = {};
    horasCursosDesdeDB.forEach((h) => {
      if (!mapa[h.curso_id]) mapa[h.curso_id] = {};
      mapa[h.curso_id][h.grado_id] = h.horas;
    });
    return mapa;
  }, [horasCursosDesdeDB]);

  // Horario visible: puntero actual del historial de ediciÃ³n
  const horarioVisible = historyStack[historyPointer];
  const generacionSeleccionada = historialGeneraciones[indiceSeleccionado] || null;
  const getScheduleOptionKey = (scheduleEntry, index) => {
    const horario = scheduleEntry?.horario;
    if (!Array.isArray(horario)) return `schedule-${index}`;
    return `schedule-${index}-${horario.flat(2).join(".")}`;
  };
  const persistHistorial = async (schedules) => {
    const normalized = normalizeScheduleEntries(schedules);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    try {
      await saveSharedScheduleGenerations(nivel, version, normalized);
    } catch (error) {
      console.warn("No se pudo sincronizar el historial compartido:", error);
    }
  };

  const detenerAnimacionProgreso = () => {
    if (progresoTimerRef.current) {
      clearInterval(progresoTimerRef.current);
      progresoTimerRef.current = null;
    }
  };

  const iniciarAnimacionProgreso = () => {
    detenerAnimacionProgreso();
    progresoTimerRef.current = setInterval(() => {
      setProgreso((prev) => {
        const objetivoReal = Math.max(progresoObjetivoRef.current, 8);
        const objetivoVisual =
          prev >= objetivoReal && prev < 94
            ? Math.min(94, prev + (prev < 25 ? 4 : prev < 55 ? 2 : 1))
            : objetivoReal;

        if (prev >= objetivoVisual) return prev;

        const incremento = prev < 20 ? 3 : prev < 50 ? 2 : prev < 80 ? 1 : 0.5;
        return Math.min(objetivoVisual, Number((prev + incremento).toFixed(1)));
      });
    }, 350);
  };

  useEffect(() => () => detenerAnimacionProgreso(), []);

  // --- EFECTOS ---
  useEffect(() => {
    const cargarHistorial = async () => {
      const almacenado = localStorage.getItem(storageKey);
      const historicoLocal = normalizeScheduleEntries(almacenado ? JSON.parse(almacenado) : []);
      try {
        const remoto = await listSharedScheduleGenerations(nivel, version);
        if (remoto.length > 0) {
          const remotoNormalizado = normalizeScheduleEntries(remoto);
          const combinado = remotoNormalizado.map((entry) => {
            const matchLocal = historicoLocal.find((localEntry) =>
              (entry.createdAt && localEntry.createdAt === entry.createdAt) ||
              getScheduleSignature(localEntry.horario) === getScheduleSignature(entry.horario)
            );
            return matchLocal?.durationMs
              ? { ...entry, durationMs: matchLocal.durationMs }
              : entry;
          });
          localStorage.setItem(storageKey, JSON.stringify(combinado));
          setHistorialGeneraciones(combinado);
          setHistoryStack([combinado[0].horario]);
          setHistoryPointer(0);
          setProgreso(100);
          setIndiceSeleccionado(0);
          return;
        }
      } catch (error) {
        console.warn("No se pudo leer el historial compartido:", error);
      }

      const historico = historicoLocal;
      if (historico.length > 0) {
        setHistorialGeneraciones(historico);
        setHistoryStack([historico[0].horario]);
        setHistoryPointer(0);
        setProgreso(100);
        setIndiceSeleccionado(0);
      } else {
        setHistorialGeneraciones([]);
        setHistoryStack([]);
        setHistoryPointer(-1);
        setIndiceSeleccionado(0);
        setProgreso(0);
      }
    };

    cargarHistorial();
  }, [storageKey]);

  // Cargar horario desde BD al cambiar de nivel
  useEffect(() => {
    (async () => {
      const almacenado = localStorage.getItem(storageKey);
      const historico = normalizeScheduleEntries(almacenado ? JSON.parse(almacenado) : []);
      // Si ya hay historial en localStorage, no sobrescribimos (se respeta la versiÃ³n local)
      if (historico.length > 0) return;

      const horarioBD = await cargarHorarioDesdeBD(nivel, version);
      if (horarioBD) {
        const entry = {
          horario: horarioBD,
          createdAt: new Date().toISOString(),
        };
        setHistorialGeneraciones([entry]);
        setIndiceSeleccionado(0);
        setHistoryStack([horarioBD]);
        setHistoryPointer(0);
        setHorarioGeneral(horarioBD);
        persistHistorial([entry]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel, version, storageKey]);

  // Cargar franjas horarias + detectar 1-based
  useEffect(() => {
    const fetchBloques = async () => {
      const { data, error } = await supabase
        .from("franjas_horarias")
        .select("bloque, hora_inicio, hora_fin")
        .eq("nivel", nivel)
        .eq("version_num", version)
        .order("bloque");
      if (!error && data?.length) {
        setBloquesHorario(data.map(b => {
          const format = (h) => {
            if (!h) return "";
            const parts = h.split(":");
            if (parts.length >= 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
            return h;
          };
          return `${format(b.hora_inicio)} - ${format(b.hora_fin)}`;
        }));
        const minBloque = Math.min(...data.map(x => Number(x.bloque)));
        setBloqueOneBased(minBloque === 1);
      } else {
        setBloquesHorario([]);
        setBloqueOneBased(false);
      }
    };
    fetchBloques();
  }, [nivel, version]);

  // Cargar datos base (asignaciones/cursos/aulas)
  useEffect(() => {
    const cargarDatos = async () => {
      const { data: asignacionesData } = await supabase
        .from("asignaciones")
        .select("curso_id, grado_id, docente_id")
        .eq("nivel", nivel)
        .eq("version_num", version);
      if (asignacionesData) setAsignacionesDesdeDB(asignacionesData);

      const { data: cursosData } = await supabase
        .from("cursos")
        .select("id, nombre");
      if (cursosData) setCursosDesdeDB(cursosData);

      const { data: aulasData } = await supabase
        .from("aulas")
        .select("id, nombre");
      if (aulasData) setAulasDesdeDB(aulasData);

      const { data: horasData } = await supabase
        .from("horas_curso_grado")
        .select("curso_id, grado_id, horas")
        .eq("nivel", nivel)
        .eq("version_num", version);
      if (horasData) setHorasCursosDesdeDB(horasData);
    };
    cargarDatos();
  }, [nivel, version]);

  // Cargar Ãºltima ediciÃ³n (opcional)
  useEffect(() => {
    const cargarUltimaEdicion = async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("actor_email, created_at, table_name, operation")
        .in("table_name", ["horarios", "asignaciones", "restricciones_docente"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (!error && data?.length) setUltimaEdicion(data[0]);
      else setUltimaEdicion(null);
    };
    cargarUltimaEdicion();
  }, [historyStack, historyPointer]);

  // ---- Obtener disponibilidad y reglas (Panel si existe, sino BD) ----
  useEffect(() => {
    const cargarRestricciones = async () => {
      try {
        // Primaria: ignoramos disponibilidad; pero intentamos traer reglas de BD si el contexto no las trae
        if (nivel === "Primaria") {
          let reglas = restricciones?.reglas;
          if (!reglas) {
            try { reglas = await loadReglasParaNivel(nivel); } catch { reglas = null; }
          }
          setReglasEfectivas(reglas || { ...DEFAULT_REGLAS });
          setDisponibilidadEfectiva({});
          setUsandoPanel(Boolean(restricciones?.reglas || restricciones?.disponibilidad));
          return;
        }

        // 1) Si el Panel (contexto) tiene algo, usarlo
        if (restricciones && (restricciones.disponibilidad || restricciones.reglas)) {
          setDisponibilidadEfectiva({ ...(restricciones.disponibilidad || {}) });
          setReglasEfectivas({ ...(restricciones.reglas || DEFAULT_REGLAS) });
          setUsandoPanel(true);
          return;
        }

        // 2) Fallback: disponibilidad desde BD (normalizamos a 0-based)
        const { data, error } = await supabase
          .from("restricciones_docente")
          .select("docente_id, dia, bloque, nivel")
          .eq("nivel", nivel)
          .eq("version_num", version);
        if (error) throw error;

        const base = {};
        (data || []).forEach((r) => {
          const did = String(r.docente_id);
          if (!base[did]) base[did] = {};
          const diaNorm = normalize(r.dia);
          const bloque0 = bloqueOneBased ? Number(r.bloque) - 1 : Number(r.bloque);
          base[did][`${diaNorm}-${bloque0}`] = true;
        });
        setDisponibilidadEfectiva(base);

        // 3) Reglas efectivas desde BD (catÃ¡logo + overrides)
        let reglasBD = null;
        try { reglasBD = await loadReglasParaNivel(nivel); } catch {}
        setReglasEfectivas(reglasBD || { ...(restricciones?.reglas || DEFAULT_REGLAS) });

        setUsandoPanel(false);
      } catch (e) {
        console.error("Error cargando restricciones:", e);
        setDisponibilidadEfectiva({});
        try {
          const reglasBD = await loadReglasParaNivel(nivel);
          setReglasEfectivas(reglasBD);
        } catch {
          setReglasEfectivas({ ...(restricciones?.reglas || DEFAULT_REGLAS) });
        }
        setUsandoPanel(false);
      }
    };

    cargarRestricciones();
  }, [nivel, version, restricciones, bloqueOneBased]);

  // --- HELPERS ---
  const indicesGradosVisibles = grados.map((_, idx) => idx);

  const obtenerInfoDocente = (cursoId, gradoIndex) => {
    const gradoId = (nivel === "Primaria") ? (gradoIndex + 6) : (gradoIndex + 1);
    const asignacion = asignacionesDesdeDB.find(
      a => a.curso_id === cursoId && a.grado_id === gradoId
    );
    if (!asignacion) return { nombre: "", aula: "" };
    const docente = docentesPorVersion.find(d => d.id === asignacion.docente_id);
    if (!docente) return { nombre: "", aula: "" };
    const aulaNombre = aulasDesdeDB.find(a => a.id === docente.aula_id)?.nombre || docente.aula_id || "";
    return { nombre: docente.nombre, aula: aulaNombre };
  };

  const getColorHexPorDocenteId = (docenteId) =>
    docentesPorVersion.find((d) => d.id === docenteId)?.color || "";

  // Â¿El docente estÃ¡ disponible segÃºn disponibilidadEfectiva?
  const isDocenteDisponibleEnKey = (docenteId, diaIndex, bloqueIndex) => {
    if (!docenteId) return true;
    const byDoc = disponibilidadEfectiva?.[String(docenteId)];
    // Si hay whitelist para el docente, un key ausente significa "no disponible".
    if (!byDoc || Object.keys(byDoc).length === 0) return true;
    const key = `${diasSql[diaIndex]}-${bloqueIndex}`;
    return byDoc[key] === true;
  };

  // Valida en un HORARIO dado (no usa horarioVisible) disponibilidad + no-solape
  const validarEnHorario = (horario, docenteId, diaIndex, bloqueIndex, gradoIndexDestino) => {
    if (!docenteId) return true;

    // Regla 1: disponibilidad
    if (nivel !== "Primaria" && reglasEfectivas.disponibilidad_docente) {
      if (!isDocenteDisponibleEnKey(docenteId, diaIndex, bloqueIndex)) return false;
    }

    // Regla 2: no solape
    if (reglasEfectivas.no_solape_docente) {
      const fila = horario?.[diaIndex]?.[bloqueIndex] || [];
      for (let g = 0; g < fila.length; g++) {
        if (g === gradoIndexDestino) continue;
        const curso = fila[g] || 0;
        if (curso > 0) {
          const did = obtenerDocenteIdPorCursoYGrado(curso, g);
          if (did && did === docenteId) return false;
        }
      }
    }
    return true;
  };

  const obtenerDocenteIdPorCursoYGrado = (cursoId, gradoIndex) => {
    const gradoId = (nivel === "Primaria") ? (gradoIndex + 6) : (gradoIndex + 1);
    const asignacion = asignacionesDesdeDB.find(
      a => a.curso_id === cursoId && a.grado_id === gradoId
    );
    return asignacion ? asignacion.docente_id : null;
  };

  const contarHorasAsignadas = (cursoId, gradoIndex) => {
    if (!Array.isArray(horarioVisible)) return 0;
    return horarioVisible.reduce(
      (total, dia) =>
        total +
        dia.reduce(
          (subtotal, bloque) => subtotal + (bloque[gradoIndex] === cursoId ? 1 : 0),
          0
        ),
      0
    );
  };

  const eliminarCurso = (dia, bloque, grado) => {
    setCursoAEliminar({ dia, bloque, grado });
    setShowConfirmModal(true);
  };

  const handleConfirmDelete = () => {
    if (!cursoAEliminar || !Array.isArray(horarioVisible)) return;
    const { dia, bloque, grado } = cursoAEliminar;

    const nuevoHorario = JSON.parse(JSON.stringify(horarioVisible));
    nuevoHorario[dia][bloque][grado] = 0;

    actualizarHistorialDeEdicion(nuevoHorario);
    setShowConfirmModal(false);
    setCursoAEliminar(null);
  };

  const insertarCursoManual = (cursoId) => {
    if (!celdaActiva || !Array.isArray(horarioVisible)) return;
    const nuevoHorario = JSON.parse(JSON.stringify(horarioVisible));
    nuevoHorario[celdaActiva.dia][celdaActiva.bloque][celdaActiva.grado] = cursoId;
    actualizarHistorialDeEdicion(nuevoHorario);
    setIsModalOpen(false);
    setCeldaActiva(null);
  };

  const handleCeldaVaciaClick = (diaIndex, bloqueIndex, gradoIndex) => {
    if (!horarioVisible) return;
    const gradoId = (nivel === "Primaria") ? (gradoIndex + 6) : (gradoIndex + 1);

    const cursosConHorasFaltantes = Object.entries(horasCursosPorVersion || {})
      .filter(([_, horasPorGrado]) => {
        const horasEsperadas = horasPorGrado?.[gradoId] || 0;
        const horasAsignadas = contarHorasAsignadas(parseInt(_, 10), gradoIndex);
        return horasEsperadas > horasAsignadas;
      })
      .map(([cursoId]) => parseInt(cursoId, 10));

    const cursosAgregables = cursosConHorasFaltantes.filter(cursoId => {
      const docenteId = obtenerDocenteIdPorCursoYGrado(cursoId, gradoIndex);
      if (!docenteId) return true;
      // validar en el horario visible
      return validarEnHorario(horarioVisible, docenteId, diaIndex, bloqueIndex, gradoIndex);
    });

    const cursosInfo = cursosAgregables
      .map(id => cursosDesdeDB.find(c => c.id === id))
      .filter(Boolean);

    setCursosDisponiblesParaCelda(cursosInfo);
    setCeldaActiva({ dia: diaIndex, bloque: bloqueIndex, grado: gradoIndex });
    setIsModalOpen(true);
  };

  const onDragEnd = (result) => {
    if (!result?.destination || !Array.isArray(horarioVisible)) return;

    if (
      result.source.droppableId === result.destination.droppableId &&
      result.source.index === result.destination.index
    ) return;

    const [, srcDia, srcBloque, srcGrado] = result.source.droppableId
      .split("-").map((v, i) => (i ? parseInt(v, 10) : v));
    const [, dstDia, dstBloque, dstGrado] = result.destination.droppableId
      .split("-").map((v, i) => (i ? parseInt(v, 10) : v));

    const nuevoHorario = JSON.parse(JSON.stringify(horarioVisible));
    const cursoOrigen = nuevoHorario[srcDia][srcBloque][srcGrado];
    const cursoDestino = nuevoHorario[dstDia][dstBloque][dstGrado];

    // validar contra el horario candidato
    const docenteIdOrigen = obtenerDocenteIdPorCursoYGrado(cursoOrigen, srcGrado);
    if (docenteIdOrigen) {
      const destinoInvalido =
        !validarEnHorario(nuevoHorario, docenteIdOrigen, dstDia, dstBloque, dstGrado);
      if (destinoInvalido) {
        alert("✖ Movimiento inválido: el docente no está disponible o ya tiene clase en ese bloque.");
        return;
      }
    }

    const docenteIdDestino = obtenerDocenteIdPorCursoYGrado(cursoDestino, dstGrado);
    if (docenteIdDestino) {
      const origenInvalido =
        !validarEnHorario(nuevoHorario, docenteIdDestino, srcDia, srcBloque, srcGrado);
      if (origenInvalido) {
        alert("✖ Movimiento inválido: el docente (destino) no está disponible en el bloque de origen.");
        return;
      }
    }

    // swap
    nuevoHorario[srcDia][srcBloque][srcGrado] = cursoDestino;
    nuevoHorario[dstDia][dstBloque][dstGrado] = cursoOrigen;

    actualizarHistorialDeEdicion(nuevoHorario);
  };

  // === Regla 3: compactar bloques consecutivos (post-proceso local) =========
  const compactarDiaColumna = (horario, diaIndex, gradoIndex) => {
    const bloques = horario[diaIndex];
    if (!Array.isArray(bloques)) return;
    const B = bloques.length;

    // cursoId -> posiciones (bloques) donde aparece en este dÃ­a/columna
    const posPorCurso = new Map();
    for (let b = 0; b < B; b++) {
      const cursoId = bloques[b]?.[gradoIndex] || 0;
      if (cursoId > 0) {
        if (!posPorCurso.has(cursoId)) posPorCurso.set(cursoId, []);
        posPorCurso.get(cursoId).push(b);
      }
    }

    for (const [cursoId, posiciones] of posPorCurso.entries()) {
      if (posiciones.length < 2) continue;
      posiciones.sort((a, b) => a - b);

      for (let i = 1; i < posiciones.length; i++) {
        let from = posiciones[i];
        const prev = posiciones[i - 1];
        const objetivo = prev + 1;
        if (from === objetivo) continue;

        // burbujear hacia la izquierda por huecos vacÃ­os validando reglas
        let cursor = from;
        const docenteId = obtenerDocenteIdPorCursoYGrado(cursoId, gradoIndex);

        while (cursor > objetivo) {
          const target = cursor - 1;
          const destinoVacio = (bloques[target]?.[gradoIndex] || 0) === 0;
          if (!destinoVacio) break;

          const ok = !docenteId
            ? true
            : validarEnHorario(horario, docenteId, diaIndex, target, gradoIndex);

          if (!ok) break;

          // mover
          bloques[target][gradoIndex] = cursoId;
          bloques[cursor][gradoIndex] = 0;
          cursor = target;
        }
        posiciones[i] = cursor;
      }
    }
  };

  const aplicarBloquesConsecutivosSiCorresponde = (horario) => {
    if (!Array.isArray(horario)) return horario;
    if (!reglasEfectivas?.bloques_consecutivos) return horario;

    const nuevo = JSON.parse(JSON.stringify(horario));
    for (let d = 0; d < nuevo.length; d++) {
      const bloquesDia = nuevo[d] || [];
      if (!Array.isArray(bloquesDia) || bloquesDia.length === 0) continue;
      const columnas = bloquesDia[0]?.length || 0; // grados
      for (let g = 0; g < columnas; g++) {
        compactarDiaColumna(nuevo, d, g);
      }
    }
    return nuevo;
  };

  const generarHorario = async () => {
    const generationStartedAt = performance.now();
    setCargando(true);
    setProgreso(0);
    setProgresoStage("Preparando generación...");
    progresoObjetivoRef.current = 2;
    iniciarAnimacionProgreso();
    try {
      const docentesFiltrados = docentesPorVersion;

      // filtrar asignaciones por nivel
      const asignacionesFiltradas = Object.fromEntries(
        Object.entries(asignaciones || {}).map(([cursoId, gradosObj]) => [
          cursoId,
          Object.fromEntries(
            Object.entries(gradosObj || {}).filter(([gradoId]) => {
              const g = parseInt(gradoId, 10);
              return (nivel === "Primaria") ? g >= 6 : g <= 5;
            })
          ),
        ])
      );

      // Si la regla de disponibilidad estÃ¡ OFF, no enviamos disponibilidad
      const disponibilidadParaEnviar = reglasEfectivas.disponibilidad_docente
        ? (disponibilidadEfectiva || {})
        : {};

      const payloadRestricciones = {
        disponibilidad: disponibilidadParaEnviar,
        reglas: reglasEfectivas || DEFAULT_REGLAS,
      };
      console.log(
        "[DEBUG] payloadRestricciones.disponibilidad keys:",
        Object.keys(payloadRestricciones.disponibilidad || {}).slice(0, 5)
      );
      if (payloadRestricciones.disponibilidad && Object.keys(payloadRestricciones.disponibilidad).length) {
        const firstDoc = Object.keys(payloadRestricciones.disponibilidad)[0];
        const docKeys = Object.keys(payloadRestricciones.disponibilidad[firstDoc] || {}).slice(0, 8);
        console.log("[DEBUG] disponibilidad keys doc sample:", firstDoc, docKeys);
      }

      const resultado = await generarHorarioConProgreso({
        docentes: docentesFiltrados,
        asignaciones: asignacionesFiltradas,
        restricciones: payloadRestricciones,
        horasCursos: horasCursosPorVersion || {},
        nivel,
        version,
        onProgress: (pct, stage) => {
          progresoObjetivoRef.current = Math.max(progresoObjetivoRef.current, Number(pct) || 0);
          setProgreso((prev) => Math.max(prev, Math.min(progresoObjetivoRef.current, 98)));
          setProgresoStage(stage || "");
        },
      });

      if (!resultado?.horario || esHorarioVacio(resultado.horario)) {
        throw new Error("El generador no retornÃ³ una asignaciÃ³n vÃ¡lida (horario vacÃ­o).");
      }

      progresoObjetivoRef.current = 100;
      setProgreso(100);
      setProgresoStage("Horario generado");

      // â˜… Aplicar Regla 3 local (compactaciÃ³n)
      const horarioOptimizado = aplicarBloquesConsecutivosSiCorresponde(resultado.horario);
      const durationMs = Math.round(performance.now() - generationStartedAt);

      const nuevoHistorial = [
        ...historialGeneraciones,
        {
          horario: horarioOptimizado,
          createdAt: new Date().toISOString(),
          durationMs,
        },
      ];
      if (nuevoHistorial.length > 5) nuevoHistorial.shift(); // mÃ¡x 5 versiones
      await persistHistorial(nuevoHistorial);
      setHistorialGeneraciones(nuevoHistorial);
      setIndiceSeleccionado(nuevoHistorial.length - 1);
      setHorarioGeneral(horarioOptimizado);

      // resetear pila de ediciÃ³n para la nueva versiÃ³n
      setHistoryStack([horarioOptimizado]);
      setHistoryPointer(0);
    } catch (err) {
      alert("✖ Error generando horario: " + (err?.message || String(err)));
    } finally {
      detenerAnimacionProgreso();
      setCargando(false);
    }
  };

  // --- COMPLETION con CAP por (curso, grado) ---
  const completionFiltrado = useMemo(() => {
    if (!Array.isArray(horarioVisible) || !grados.length) {
      return { asignados: 0, totales: 0, porcentaje: "0.0" };
    }

    const gradoIdBase = (nivel === "Primaria") ? 6 : 1;

    // 1) Requeridas por par (curso, grado) + total
    const requeridasPorPar = new Map();
    let totales = 0;
    for (const [cursoIdStr, byGrado] of Object.entries(horasCursosPorVersion || {})) {
      const cursoId = Number(cursoIdStr);
      for (let i = 0; i < grados.length; i++) {
        const gradoId = gradoIdBase + i;
        const req = byGrado?.[gradoId] || 0;
        if (req > 0) {
          requeridasPorPar.set(`${cursoId}-${gradoId}`, req);
          totales += req;
        }
      }
    }

    // 2) Asignadas observadas por par
    const asignadasPorPar = new Map();
    for (let d = 0; d < (horarioVisible?.length || 0); d++) {
      const dia = horarioVisible[d] || [];
      for (let b = 0; b < (dia?.length || 0); b++) {
        const bloque = dia[b] || [];
        for (let g = 0; g < (bloque?.length || 0); g++) {
          const cursoId = bloque[g] || 0;
          if (cursoId > 0) {
            const gradoId = gradoIdBase + g;
            const key = `${cursoId}-${gradoId}`;
            if (requeridasPorPar.has(key)) {
              asignadasPorPar.set(key, (asignadasPorPar.get(key) || 0) + 1);
            }
          }
        }
      }
    }

    // 3) CAP
    let asignados = 0;
    for (const [key, req] of requeridasPorPar.entries()) {
      const asig = asignadasPorPar.get(key) || 0;
      asignados += Math.min(asig, req);
    }

    const porcentaje = totales > 0 ? ((asignados / totales) * 100).toFixed(1) : "0.0";
    return { asignados, totales, porcentaje };
  }, [horarioVisible, horasCursosPorVersion, grados, nivel]);

  const actualizarHistorialDeEdicion = (nuevoHorario) => {
    const nuevoStack = historyStack.slice(0, historyPointer + 1);
    nuevoStack.push(nuevoHorario);
    setHistoryStack(nuevoStack);
    setHistoryPointer(nuevoStack.length - 1);

    // Persistir versiÃ³n seleccionada en historial
    const nuevasGeneraciones = [...historialGeneraciones];
    if (nuevasGeneraciones[indiceSeleccionado]) {
      nuevasGeneraciones[indiceSeleccionado] = {
        ...nuevasGeneraciones[indiceSeleccionado],
        horario: nuevoHorario,
      };
    }
    setHistorialGeneraciones(nuevasGeneraciones);
    persistHistorial(nuevasGeneraciones);
  };

  const handleUndo = () => {
    if (historyPointer > 0) setHistoryPointer(p => p - 1);
  };
  const handleRedo = () => {
    if (historyPointer < historyStack.length - 1) setHistoryPointer(p => p + 1);
  };

  const handleVersionChange = (newIndex) => {
    const numericIndex = Number(newIndex);
    const selectedSchedule = historialGeneraciones[numericIndex]?.horario;
    if (selectedSchedule) {
      setIndiceSeleccionado(numericIndex);
      setHistoryStack([selectedSchedule]);
      setHistoryPointer(0);
    }
  };

  // Export PDF
  const exportarPDF = async () => {
    if (!Array.isArray(horarioVisible)) {
      alert("No hay horario para exportar.");
      return;
    }
    const pdf = new jsPDF("landscape", "pt", "a4");
    for (let diaIndex = 0; diaIndex < 5; diaIndex++) {
      const diaElement = document.getElementById(`dia-${diaIndex}`);
      if (!diaElement) continue;
      const canvas = await html2canvas(diaElement, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const props = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (props.height * pdfWidth) / props.width;
      if (diaIndex > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 20, 40, pdfWidth - 40, pdfHeight - 40);
      pdf.text(
        `Horario de ${["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"][diaIndex]} - ${nivel}`,
        20, 20
      );
    }
    pdf.save(`Horario_${nivel}.pdf`);
  };

const TAILWIND_TO_HEX = {
  "bg-red-300": "CA8A8A",
  "bg-blue-300": "93C5FD",
  "bg-green-300": "86EFAC",
  "bg-yellow-300": "FDE047",
  "bg-pink-300": "F9A8D4",
  "bg-purple-300": "D8B4FE",
  "bg-indigo-300": "A5B4FC",
  "bg-orange-300": "FDBA74",
  "bg-teal-300": "5EEAD4",
  "bg-lime-300": "BEF264",
  "bg-cyan-300": "67E8F9",
  "bg-amber-300": "FCD34D",
  "bg-rose-300": "FDA4AF",
  "bg-fuchsia-300": "E879F9",
  "bg-sky-300": "7DD3FC",
  "bg-gray-200": "E5E7EB",
};

const hexToRgb = (hex) => {
  if (!hex) return null;
  const clean = hex.replace("#", "").toUpperCase();
  if (clean.length === 6) return clean;
  if (clean.length === 8) return clean.slice(2);
  return null;
};

// ── Función exportarExcel actualizada ──────────────────────────────────────
// Pega esto dentro del componente HorarioTable, reemplazando la función actual.
// Asegúrate de tener: import XLSXStyle from "xlsx-js-style";
// y haber instalado: npm install xlsx-js-style

const exportarExcel = () => {
  if (!Array.isArray(horarioVisible)) {
    alert("No hay horario para exportar.");
    return;
  }

  const diasNombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const borderColor = "D1D5DB";
  const baseBorder = {
    top: { style: "thin", color: { rgb: borderColor } },
    bottom: { style: "thin", color: { rgb: borderColor } },
    left: { style: "thin", color: { rgb: borderColor } },
    right: { style: "thin", color: { rgb: borderColor } },
  };
  const headerStyle = {
    font: { bold: true, color: { rgb: "111827" } },
    fill: { patternType: "solid", fgColor: { rgb: "D1D5DB" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: baseBorder,
  };
  const sideHeaderStyle = {
    font: { bold: true, color: { rgb: "111827" } },
    fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } },
    alignment: { horizontal: "center", vertical: "center" },
    border: baseBorder,
  };

  const headerRow = [
    { v: "Hora", s: headerStyle },
    { v: "Día", s: headerStyle },
    ...grados.map((g) => ({
      v: g,
      s: headerStyle,
    })),
  ];

  const sheetData = [headerRow];

  diasNombres.forEach((diaNombre, diaIndex) => {
    const bloquesDia = horarioVisible[diaIndex] || [];

    bloquesHorario.forEach((horaLabel, bloqueIndex) => {
      const row = [];

      row.push({
        v: horaLabel,
        s: sideHeaderStyle,
      });

      row.push({
        v: diaNombre,
        s: sideHeaderStyle,
      });

      indicesGradosVisibles.forEach((gradoIndex) => {
        const cursoId = bloquesDia?.[bloqueIndex]?.[gradoIndex] || 0;
        const cursoNombre = cursosDesdeDB.find((c) => c.id === cursoId)?.nombre || "";
        const { nombre: docenteNombre, aula } = obtenerInfoDocente(cursoId, gradoIndex);
        const docenteId = obtenerDocenteIdPorCursoYGrado(cursoId, gradoIndex);
        const colorHex = getColorHexPorDocenteId(docenteId);

        let bgColor = "FFFFFF";
        if (cursoId > 0) {
          if (colorHex) {
            bgColor = hexToRgb(colorHex) || "FFFFFF";
          } else {
            const tailwindClass = getColorPorDocente(docenteNombre);
            bgColor = TAILWIND_TO_HEX[tailwindClass] || "BFDBFE";
          }
        }

        const cellValue =
          cursoId > 0 ? `${cursoNombre}\n${docenteNombre}${aula ? ` (${aula})` : ""}` : "";

        row.push({
          v: cellValue,
          t: "s",
          s: {
            font: { color: { rgb: "0F172A" }, sz: 9, bold: !!cursoId },
            fill: { patternType: "solid", fgColor: { rgb: bgColor } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: baseBorder,
          },
        });
      });

      sheetData.push(row);
    });

    const sepRow = Array.from({ length: 2 + grados.length }, () => ({
      v: "",
      s: {
        fill: { patternType: "solid", fgColor: { rgb: "E5E7EB" } },
        border: baseBorder,
      },
    }));
    sheetData.push(sepRow);
  });

  const ws = XLSXStyle.utils.aoa_to_sheet(
    sheetData.map((row) => row.map((cell) => cell?.v ?? ""))
  );

  sheetData.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (cell?.s) {
        const cellAddr = XLSXStyle.utils.encode_cell({ r: rIdx, c: cIdx });
        if (!ws[cellAddr]) ws[cellAddr] = { v: cell.v ?? "", t: "s" };
        ws[cellAddr].s = cell.s;
      }
    });
  });

  ws["!cols"] = [
    { wch: 14 },
    { wch: 10 },
    ...grados.map(() => ({ wch: 22 })),
  ];

  const rowHeights = sheetData.map((_, i) => ({ hpt: i === 0 ? 20 : 42 }));
  ws["!rows"] = rowHeights;

  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, `Horario ${nivel}`);

  const wbout = XLSXStyle.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(
    new Blob([wbout], { type: "application/octet-stream" }),
    `Horario_${nivel}.xlsx`
  );
};

  // === Badge "Restricciones aplicadas: 12345" ===
  const reglasCompactas = useMemo(() => {
    const activos = [];
    const labelsActivos = [];
    const labelsInactivos = [];
    RULES_ORDER.forEach(({ key, idx, label }) => {
      if (reglasEfectivas?.[key]) {
        activos.push(String(idx));
        labelsActivos.push(`${idx}. ${label}`);
      } else {
        labelsInactivos.push(`${idx}. ${label}`);
      }
    });
    return {
      texto: activos.join("") || "â€”",
      tooltip:
        `Activas:\n${labelsActivos.length ? labelsActivos.join("\n") : "Ninguna"}\n\n` +
        `Inactivas:\n${labelsInactivos.length ? labelsInactivos.join("\n") : "Ninguna"}`,
      hayActivas: activos.length > 0,
    };
  }, [reglasEfectivas]);

  // --- RENDER ---
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="mt-4 mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <h2 className="text-xl md:text-2xl font-semibold text-slate-800 flex items-center gap-2 xl:flex-1">
          <CalendarRange className="size-6 text-blue-600" />
          Generar horario escolar - {nivel}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Datos base:</span>
          <select
            value={version}
            onChange={(e) => {
              const v = e.target.value;
              window.location.href = `/horario?nivel=${nivel}&version=${v}`;
            }}
            className="border px-2 py-1 rounded"
          >
            {VERSION_OPTIONS.map((v) => (
              <option key={v} value={v}>Versión {v}</option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-wrap items-start gap-2 sm:gap-3 xl:w-auto xl:justify-end">
          {/* Origen claro para humanos */}
          {nivel !== "Primaria" && (
            <span
              className={`text-xs px-2 py-1 rounded border ${
                usandoPanel
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
              title={usandoPanel ? "Usando las reglas guardadas en el Panel" : "Usando reglas por defecto desde BD"}
            >
              Origen: {usandoPanel ? "Panel" : "Base (BD)"}
            </span>
          )}

          {/* Resumen compacto de reglas aplicadas: 12345 */}
          {nivel !== "Primaria" && (
            <span
              className={`max-w-full text-xs px-2 py-1 rounded border ${
                reglasCompactas.hayActivas
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
              title={reglasCompactas.tooltip}
            >
              Restricciones aplicadas: {reglasCompactas.texto}
            </span>
          )}

          {ultimaEdicion && (
            <div className="flex max-w-full items-start gap-2 text-xs px-3 py-1 rounded bg-gray-100 border">
              <Clock3 className="w-4 h-4" />
              <span className="break-words">
                Última edición: <b>{ultimaEdicion.actor_email || "desconocido"}</b> ·{" "}
                {new Date(ultimaEdicion.created_at).toLocaleString()}
              </span>
            </div>
          )}
          <button
            onClick={generarHorario}
            disabled={cargando}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded shadow-lg transition-transform transform hover:scale-105 disabled:bg-purple-300 disabled:cursor-wait w-full sm:w-auto"
          >
            {cargando ? "Generando..." : "Generar horario"}
          </button>
        </div>
      </div>

      {cargando && (
        <p className="text-center text-purple-600 font-semibold my-4">
          Generando horario... {progreso}%{progresoStage ? ` - ${progresoStage}` : ""}
        </p>
      )}

      {historialGeneraciones.length > 0 && (
        <div className="mt-2 mb-4 flex flex-col gap-3 rounded-lg border bg-gray-50 p-3 shadow sticky top-2 z-10 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2 w-full xl:w-auto">
            <label htmlFor="horario-general-version" className="font-semibold text-sm">Versión:</label>
            <select
              id="horario-general-version"
              className="max-w-full border px-2 py-1 rounded-md text-sm"
              value={indiceSeleccionado}
              onChange={(e) => handleVersionChange(e.target.value)}
            >
              {historialGeneraciones.map((schedule, i) => (
                <option key={getScheduleOptionKey(schedule, i)} value={i}>
                  {`Horario #${i + 1} · ${formatGenerationTime(schedule.createdAt)}`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full border-t pt-3 xl:w-auto xl:border-t-0 xl:border-l xl:pl-4 xl:pt-0">
            <span className="font-semibold text-sm">Edición:</span>
            <button
              onClick={handleUndo}
              disabled={historyPointer <= 0}
              className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              title="Deshacer (Ctrl+Z)"
            >
              ↶
            </button>
            <button
              onClick={handleRedo}
              disabled={historyPointer >= historyStack.length - 1}
              className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              title="Rehacer (Ctrl+Y)"
            >
              ↷
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full border-t pt-3 xl:w-auto xl:border-t-0 xl:border-l xl:pl-4 xl:pt-0">
            <span className="font-semibold text-sm">Completado:</span>
            <span className="text-sm bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-full">
              {`${completionFiltrado.asignados} / ${completionFiltrado.totales} (${completionFiltrado.porcentaje}%)`}
            </span>
            <span className="text-sm text-slate-600">
              Hora: <b>{formatGenerationTime(generacionSeleccionada?.createdAt)}</b>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full border-t pt-3 xl:w-auto xl:border-t-0 xl:border-l xl:pl-4 xl:pt-0">
            <label htmlFor="horario-general-vista-grados" className="font-semibold text-sm">Vista:</label>
            <button
              id="horario-general-vista-grados"
              onClick={() => setVistaModo("grados")}
              className={`px-3 py-1 rounded border text-sm ${vistaModo === "grados" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-600 border-blue-200"}`}
            >
              Por grados
            </button>
            <button
              onClick={() => setVistaModo("dias")}
              className={`px-3 py-1 rounded border text-sm ${vistaModo === "dias" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-600 border-blue-200"}`}
            >
              Por días
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full border-t pt-3 xl:ml-auto xl:w-auto xl:border-t-0 xl:border-l xl:pl-4 xl:pt-0">
            <button
              onClick={exportarPDF}
              className="bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700 transition-colors text-sm w-full sm:w-auto"
            >
              PDF
            </button>
            <button
              onClick={exportarExcel}
              className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 transition-colors text-sm w-full sm:w-auto"
            >
              Excel
            </button>
          </div>
        </div>
      )}

      {/* Barra real de completion (misma mÃ©trica filtrada) */}
      {Array.isArray(horarioVisible) && (
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 text-sm">
            <span className="font-semibold">Completado:</span>
            <span className="text-sm bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-full">
              {`${completionFiltrado.asignados} / ${completionFiltrado.totales} (${completionFiltrado.porcentaje}%)`}
            </span>
            <span className="text-sm text-slate-600">
              Tiempo: <b>{formatGenerationDuration(generacionSeleccionada?.durationMs)}</b>
            </span>
          </div>
        </div>
      )}

      {Array.isArray(horarioVisible) && vistaModo === "grados" && (
        <DragDropContext onDragEnd={onDragEnd}>
          {horarioVisible.map((bloquesDia, diaIndex) => (
            <div key={diaIndex} id={`dia-${diaIndex}`} className="mb-6">
              <h4 className="text-xl font-bold mb-2 text-gray-700">
                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"][diaIndex]}
              </h4>

              <div className="overflow-x-auto border shadow-md rounded-lg max-w-screen-xl mx-auto">
                <table className="w-full text-sm text-center border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border border-gray-300 px-2 py-2">Hora</th>
                      {indicesGradosVisibles.map((gradoIdx) => (
                        <th key={gradoIdx} className="border border-gray-300 px-2 py-2 font-medium">
                          {grados[gradoIdx]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bloquesHorario.map((horaLabel, bloqueIndex) => (
                      <tr key={bloqueIndex} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-2 py-1 font-medium bg-gray-100">
                          {horaLabel}
                        </td>

                        {indicesGradosVisibles.map((gradoIndex) => {
                          const cursoId = bloquesDia?.[bloqueIndex]?.[gradoIndex] || 0;
                          const cursoNombre = cursosDesdeDB.find(c => c.id === cursoId)?.nombre || "";
                          const { nombre: docenteNombre, aula } = obtenerInfoDocente(cursoId, gradoIndex);
                          const docenteId = obtenerDocenteIdPorCursoYGrado(cursoId, gradoIndex);
                          const colorHex = getColorHexPorDocenteId(docenteId);

                          const droppableId = `dia-${diaIndex}-${bloqueIndex}-${gradoIndex}`;
                          const draggableId = `celda-${diaIndex}-${bloqueIndex}-${gradoIndex}`;

                          return (
                            <td key={gradoIndex} className="border border-gray-300 p-0">
                              <Droppable droppableId={droppableId}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                    className={`min-h-[70px] w-full h-full flex items-center justify-center transition-colors ${snapshot.isDraggingOver ? "bg-blue-100" : ""}`}
                                  >
                                    {cursoId > 0 ? (
                                      <Draggable draggableId={draggableId} index={0} key={draggableId}>
                                        {(provided2, snapshot2) => (
                                          <div
                                            ref={provided2.innerRef}
                                          {...provided2.draggableProps}
                                          {...provided2.dragHandleProps}
                                          onDoubleClick={() => eliminarCurso(diaIndex, bloqueIndex, gradoIndex)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                              event.preventDefault();
                                              eliminarCurso(diaIndex, bloqueIndex, gradoIndex);
                                            }
                                          }}
                                          role="button"
                                          tabIndex={0}
                                          className={`p-1 rounded text-xs text-center cursor-pointer w-full h-full flex flex-col justify-center shadow select-none ${colorHex ? "" : getColorPorDocente(docenteNombre)} ${snapshot2.isDragging ? "ring-2 ring-blue-500" : ""}`}
                                            style={{
                                              ...(provided2.draggableProps.style || {}),
                                              ...(colorHex ? { backgroundColor: colorHex, color: "#0f172a" } : {}),
                                            }}
                                            title="Doble clic para eliminar"
                                          >
                                            <div className="font-semibold">{cursoNombre}</div>
                                            <div className="italic text-xs">
                                              {docenteNombre} {aula && <span>({aula})</span>}
                                            </div>
                                          </div>
                                        )}
                                      </Draggable>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleCeldaVaciaClick(diaIndex, bloqueIndex, gradoIndex)}
                                        className="w-full h-full flex justify-center items-center cursor-pointer hover:bg-gray-200"
                                        aria-label={`Agregar curso en ${["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"][diaIndex]}, bloque ${bloqueIndex + 1}, grado ${grados[gradoIndex]}`}
                                      >
                                        <span className="text-gray-400 text-2xl">+</span>
                                      </button>
                                    )}
                                    {provided.placeholder}
                                  </div>
                                )}
                              </Droppable>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </DragDropContext>
      )}

      {Array.isArray(horarioVisible) && vistaModo === "dias" && (
        <div className="space-y-6">
          {grados.map((gradoLabel, gradoIndex) => (
            <div key={gradoLabel} className="overflow-x-auto border shadow-md rounded-lg max-w-screen-xl mx-auto">
              <div className="px-3 py-2 border-b bg-slate-50 text-sm font-semibold">
                Grado {gradoLabel}
              </div>
              <table className="w-full text-sm text-center border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-300 px-2 py-2">Hora</th>
                    {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"].map((dia) => (
                      <th key={dia} className="border border-gray-300 px-2 py-2 font-medium">
                        {dia}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bloquesHorario.map((horaLabel, bloqueIndex) => (
                    <tr key={bloqueIndex} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-2 py-1 font-medium bg-gray-100">
                        {horaLabel}
                      </td>
                      {horarioVisible.map((bloquesDia, diaIndex) => {
                        const cursoId = bloquesDia?.[bloqueIndex]?.[gradoIndex] || 0;
                        const cursoNombre = cursosDesdeDB.find(c => c.id === cursoId)?.nombre || "";
                        const { nombre: docenteNombre, aula } = obtenerInfoDocente(cursoId, gradoIndex);
                        const docenteId = obtenerDocenteIdPorCursoYGrado(cursoId, gradoIndex);
                        const colorHex = getColorHexPorDocenteId(docenteId);
                        return (
                          <td
                            key={`${diaIndex}-${bloqueIndex}`}
                            className="border border-gray-300 px-2 py-2 align-top text-left"
                          >
                            {cursoId > 0 ? (
                              <div
                                className="text-xs leading-tight rounded p-1"
                                style={colorHex ? { backgroundColor: colorHex, color: "#0f172a" } : undefined}
                              >
                                <div className="font-semibold">{cursoNombre}</div>
                                {docenteNombre && (
                                  <div className="italic">
                                    {docenteNombre} {aula && <span>({aula})</span>}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Tabla de horas faltantes */}
      {Array.isArray(horarioVisible) && (
        <div className="mt-8">
          <h3 className="text-xl font-bold mb-3">🕒 Resumen de horas faltantes</h3>
          <div className="overflow-x-auto border shadow-md rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-4 py-2">Curso</th>
                      {indicesGradosVisibles.map((idx) => (
                        <th key={grados[idx]} className="border px-4 py-2 text-center">
                          {grados[idx]}
                        </th>
                      ))}
                </tr>
              </thead>
              <tbody>
                {cursosDesdeDB.map(curso => {
                  const gradoIdBase = (nivel === "Primaria") ? 6 : 1;
                  const horasFaltantesRow = grados.map((_, gradoIndex) => {
                    const gradoId = gradoIdBase + gradoIndex;
                    const esperadas = horasCursosPorVersion?.[curso.id]?.[gradoId] || 0;
                    const asignadas = contarHorasAsignadas(curso.id, gradoIndex);
                    const faltantes = esperadas - asignadas;
                    return { faltantes, esperadas };
                  });

                  if (horasFaltantesRow.every(h => h.esperadas === 0)) return null;

                  return (
                    <tr key={curso.id} className="hover:bg-gray-50">
                      <td className="border px-4 py-2 font-medium">{curso.nombre}</td>
                      {indicesGradosVisibles.map((i) => {
                        const h = horasFaltantesRow[i];
                        return (
                          <td
                            key={`${curso.id}-${grados[i]}`}
                            className={`border px-4 py-2 text-center ${h.faltantes > 0 ? "text-red-600 font-bold" : "text-green-600"}`}
                          >
                            {h.esperadas > 0 ? (h.faltantes > 0 ? `${h.faltantes} faltantes` : "✓") : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal agregar curso */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Agregar curso al bloque</h3>
            <div className="max-h-60 overflow-y-auto">
              {cursosDisponiblesParaCelda.length > 0 ? (
                cursosDisponiblesParaCelda.map(curso => (
                  <button
                    key={curso.id}
                    onClick={() => insertarCursoManual(curso.id)}
                    className="w-full text-left p-2 rounded hover:bg-gray-200"
                  >
                    {curso.nombre}
                  </button>
                ))
              ) : (
                <p className="text-gray-500">No hay cursos disponibles para este bloque.</p>
              )}
            </div>
            <div className="text-right mt-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar borrado */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl">
            <h3 className="text-lg font-bold mb-4">Confirmar eliminación</h3>
            <p>¿Seguro que deseas quitar este curso del horario?</p>
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HorarioTable;

