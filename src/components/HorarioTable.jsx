// src/components/HorarioTable.jsx
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import { enviarDznAlServidor } from "../services/horarioService";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { CalendarRange, Clock3 } from "lucide-react";
import { loadReglasParaNivel } from "../services/restriccionesService";

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
  omitir_cursos_1h: true,
};

// Orden fijo y etiquetas para el badge "12345"
const RULES_ORDER = [
  { key: "disponibilidad_docente",       idx: 1, label: "Respetar disponibilidad del docente" },
  { key: "no_solape_docente",            idx: 2, label: "Evitar solape del mismo docente por bloque" },
  { key: "bloques_consecutivos",         idx: 3, label: "Usar bloques consecutivos por segmento" },
  { key: "distribuir_en_dias_distintos", idx: 4, label: "Distribuir segmentos en dÃ­as distintos" },
  { key: "omitir_cursos_1h",             idx: 5, label: "Omitir cursos con 1h" },
];

// Cargar horario guardado en BD y reconstruir la matriz
async function cargarHorarioDesdeBD(nivel) {
  const { data, error } = await supabase
    .from("horarios")
    .select("dia, bloque, curso_id, grado_id")
    .eq("nivel", nivel);

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

  const [historialGeneraciones, setHistorialGeneraciones] = useState(() => {
    const almacenado = localStorage.getItem("historialHorarios");
    return almacenado ? JSON.parse(almacenado) : [];
  });
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);

  // Undo/Redo
  const [historyStack, setHistoryStack] = useState([]);   // array de horarios
  const [historyPointer, setHistoryPointer] = useState(-1);

  const [cargando, setCargando] = useState(false);
  const [asignacionesDesdeDB, setAsignacionesDesdeDB] = useState([]);
  const [cursosDesdeDB, setCursosDesdeDB] = useState([]);
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
  const nivel = new URLSearchParams(location.search).get("nivel") || "Secundaria";
  const grados = (nivel === "Primaria")
    ? ["1°", "2°", "3°", "4°", "5°", "6°"]
    : ["1°", "2°", "3°", "4°", "5°"];

  // Horario visible: puntero actual del historial de ediciÃ³n
  const horarioVisible = historyStack[historyPointer];

  // --- EFECTOS ---
  useEffect(() => {
    const almacenado = localStorage.getItem("historialHorarios");
    const historico = almacenado ? JSON.parse(almacenado) : [];
    if (historico.length > 0) {
      setHistoryStack([historico[0]]);
      setHistoryPointer(0);
      setIndiceSeleccionado(0);
    }
  }, []);

  // Cargar horario desde BD al cambiar de nivel
  useEffect(() => {
    (async () => {
      const almacenado = localStorage.getItem("historialHorarios");
      const historico = almacenado ? JSON.parse(almacenado) : [];
      // Si ya hay historial en localStorage, no sobrescribimos (se respeta la versiÃ³n local)
      if (historico.length > 0) return;

      const horarioBD = await cargarHorarioDesdeBD(nivel);
      if (horarioBD) {
        setHistorialGeneraciones([horarioBD]);
        setIndiceSeleccionado(0);
        setHistoryStack([horarioBD]);
        setHistoryPointer(0);
        setHorarioGeneral(horarioBD);
        localStorage.setItem("historialHorarios", JSON.stringify([horarioBD]));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel]);

  // Cargar franjas horarias + detectar 1-based
  useEffect(() => {
    const fetchBloques = async () => {
      const { data, error } = await supabase
        .from("franjas_horarias")
        .select("bloque, hora_inicio, hora_fin")
        .eq("nivel", nivel)
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
  }, [nivel]);

  // Cargar datos base (asignaciones/cursos/aulas)
  useEffect(() => {
    const cargarDatos = async () => {
      const { data: asignacionesData } = await supabase
        .from("asignaciones")
        .select("curso_id, grado_id, docente_id")
        .eq("nivel", nivel);
      if (asignacionesData) setAsignacionesDesdeDB(asignacionesData);

      const { data: cursosData } = await supabase
        .from("cursos")
        .select("id, nombre");
      if (cursosData) setCursosDesdeDB(cursosData);

      const { data: aulasData } = await supabase
        .from("aulas")
        .select("id, nombre");
      if (aulasData) setAulasDesdeDB(aulasData);
    };
    cargarDatos();
  }, [nivel]);

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
          .eq("nivel", nivel);
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
  }, [nivel, restricciones, bloqueOneBased]);

  // --- HELPERS ---
  const obtenerInfoDocente = (cursoId, gradoIndex) => {
    const gradoId = (nivel === "Primaria") ? (gradoIndex + 6) : (gradoIndex + 1);
    const asignacion = asignacionesDesdeDB.find(
      a => a.curso_id === cursoId && a.grado_id === gradoId
    );
    if (!asignacion) return { nombre: "", aula: "" };
    const docente = docentes.find(d => d.id === asignacion.docente_id);
    if (!docente) return { nombre: "", aula: "" };
    const aulaNombre = aulasDesdeDB.find(a => a.id === docente.aula_id)?.nombre || docente.aula_id || "";
    return { nombre: docente.nombre, aula: aulaNombre };
  };

  // Â¿El docente estÃ¡ disponible segÃºn disponibilidadEfectiva?
  const isDocenteDisponibleEnKey = (docenteId, diaIndex, bloqueIndex) => {
    if (!docenteId) return true;
    const byDoc = disponibilidadEfectiva?.[String(docenteId)] || {};
    const key = `${diasSql[diaIndex]}-${bloqueIndex}`;
    if (typeof byDoc[key] === "boolean") return byDoc[key];
    return true;
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

    const cursosConHorasFaltantes = Object.entries(horasCursos || {})
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
    setCargando(true);
    try {
      const docentesFiltrados = (docentes || []).filter(d => d.nivel === nivel);

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

      const resultado = await enviarDznAlServidor(
        docentesFiltrados,
        asignacionesFiltradas,
        payloadRestricciones,
        horasCursos || {},
        nivel
      );

      if (!resultado?.horario || esHorarioVacio(resultado.horario)) {
        throw new Error("El generador no retornÃ³ una asignaciÃ³n vÃ¡lida (horario vacÃ­o).");
      }

      // â˜… Aplicar Regla 3 local (compactaciÃ³n)
      const horarioOptimizado = aplicarBloquesConsecutivosSiCorresponde(resultado.horario);

      const nuevoHistorial = [...historialGeneraciones, horarioOptimizado];
      if (nuevoHistorial.length > 3) nuevoHistorial.shift(); // mÃ¡x 3 versiones
      localStorage.setItem("historialHorarios", JSON.stringify(nuevoHistorial));
      setHistorialGeneraciones(nuevoHistorial);
      setIndiceSeleccionado(nuevoHistorial.length - 1);
      setHorarioGeneral(horarioOptimizado);

      // resetear pila de ediciÃ³n para la nueva versiÃ³n
      setHistoryStack([horarioOptimizado]);
      setHistoryPointer(0);
    } catch (err) {
      alert("✖ Error generando horario: " + (err?.message || String(err)));
    } finally {
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
    for (const [cursoIdStr, byGrado] of Object.entries(horasCursos || {})) {
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
  }, [horarioVisible, horasCursos, grados, nivel]);

  const actualizarHistorialDeEdicion = (nuevoHorario) => {
    const nuevoStack = historyStack.slice(0, historyPointer + 1);
    nuevoStack.push(nuevoHorario);
    setHistoryStack(nuevoStack);
    setHistoryPointer(nuevoStack.length - 1);

    // Persistir versiÃ³n seleccionada en historial
    const nuevasGeneraciones = [...historialGeneraciones];
    nuevasGeneraciones[indiceSeleccionado] = nuevoHorario;
    setHistorialGeneraciones(nuevasGeneraciones);
    localStorage.setItem("historialHorarios", JSON.stringify(nuevasGeneraciones));
  };

  const handleUndo = () => {
    if (historyPointer > 0) setHistoryPointer(p => p - 1);
  };
  const handleRedo = () => {
    if (historyPointer < historyStack.length - 1) setHistoryPointer(p => p + 1);
  };

  const handleVersionChange = (newIndex) => {
    const numericIndex = Number(newIndex);
    const selectedSchedule = historialGeneraciones[numericIndex];
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

  // Export Excel
  const exportarExcel = () => {
    if (!Array.isArray(horarioVisible)) {
      alert("No hay horario para exportar.");
      return;
    }
    const wb = XLSX.utils.book_new();
    horarioVisible.forEach((bloquesDia, diaIndex) => {
      const sheetData = [["Hora", ...grados]];
      bloquesHorario.forEach((hora, bloqueIndex) => {
        const fila = [hora];
        grados.forEach((_, gradoIndex) => {
          const cursoId = bloquesDia?.[bloqueIndex]?.[gradoIndex] || 0;
          const cursoNombre = cursosDesdeDB.find(c => c.id === cursoId)?.nombre || "";
          const { nombre: docenteNombre, aula } = obtenerInfoDocente(cursoId, gradoIndex);
          fila.push(cursoNombre ? `${cursoNombre} - ${docenteNombre} (${aula || "N/D"})` : "");
        });
        sheetData.push(fila);
      });
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"][diaIndex]);
    });
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), `Horario_${nivel}.xlsx`);
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

      <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <CalendarRange className="h-6 w-6 text-indigo-600" />
          Generar horario escolar - {nivel}
        </h2>

        <div className="flex items-center gap-3">
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
              className={`text-xs px-2 py-1 rounded border whitespace-pre ${
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
            <div className="flex items-center gap-2 text-xs px-3 py-1 rounded bg-gray-100 border">
              <Clock3 className="w-4 h-4" />
              <span>
                Última edición: <b>{ultimaEdicion.actor_email || "desconocido"}</b> ·{" "}
                {new Date(ultimaEdicion.created_at).toLocaleString()}
              </span>
            </div>
          )}
          <button
            onClick={generarHorario}
            disabled={cargando}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded shadow-lg transition-transform transform hover:scale-105 disabled:bg-purple-300 disabled:cursor-wait"
          >
            {cargando ? "Generando..." : "Generar horario"}
          </button>
        </div>
      </div>

      {cargando && (
        <p className="text-center text-purple-600 font-semibold my-4">
          Generando horario, por favor espera...
        </p>
      )}

          {historialGeneraciones.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mt-2 mb-4 p-3 bg-gray-50 rounded-lg shadow sticky top-2 z-10 border">
          <div className="flex items-center gap-2">
            <label className="font-semibold text-sm">Versión:</label>
            <select
              className="border px-2 py-1 rounded-md text-sm"
              value={indiceSeleccionado}
              onChange={(e) => handleVersionChange(e.target.value)}
            >
              {historialGeneraciones.map((_, i) => (
                <option key={i} value={i}>Horario #{i + 1}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 border-l pl-4">
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

          <div className="flex items-center gap-3 border-l pl-4">
            <span className="font-semibold text-sm">Completado:</span>
            <span className="text-sm bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-full">
              {`${completionFiltrado.asignados} / ${completionFiltrado.totales} (${completionFiltrado.porcentaje}%)`}
            </span>
          </div>

          <div className="flex items-center gap-2 border-l pl-4 ml-auto">
            <button
              onClick={exportarPDF}
              className="bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700 transition-colors text-sm"
            >
              PDF
            </button>
            <button
              onClick={exportarExcel}
              className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 transition-colors text-sm"
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
          </div>
        </div>
      )}

      {Array.isArray(horarioVisible) && (
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
                      {grados.map((grado) => (
                        <th key={grado} className="border border-gray-300 px-2 py-2 font-medium">
                          {grado}
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

                        {grados.map((_, gradoIndex) => {
                          const cursoId = bloquesDia?.[bloqueIndex]?.[gradoIndex] || 0;
                          const cursoNombre = cursosDesdeDB.find(c => c.id === cursoId)?.nombre || "";
                          const { nombre: docenteNombre, aula } = obtenerInfoDocente(cursoId, gradoIndex);

                          const droppableId = `dia-${diaIndex}-${bloqueIndex}-${gradoIndex}`;
                          const draggableId = `${diaIndex}-${bloqueIndex}-${gradoIndex}-${cursoId}`;

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
                                      <Draggable draggableId={draggableId} index={0}>
                                        {(provided2, snapshot2) => (
                                          <div
                                            ref={provided2.innerRef}
                                            {...provided2.draggableProps}
                                            {...provided2.dragHandleProps}
                                            onDoubleClick={() => eliminarCurso(diaIndex, bloqueIndex, gradoIndex)}
                                            className={`p-1 rounded text-xs text-center cursor-pointer w-full h-full flex flex-col justify-center shadow ${getColorPorDocente(docenteNombre)} ${snapshot2.isDragging ? "ring-2 ring-blue-500" : ""}`}
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
                                      <div
                                        onClick={() => handleCeldaVaciaClick(diaIndex, bloqueIndex, gradoIndex)}
                                        className="w-full h-full flex justify-center items-center cursor-pointer hover:bg-gray-200"
                                      >
                                        <span className="text-gray-400 text-2xl">+</span>
                                      </div>
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

      {/* Tabla de horas faltantes */}
      {Array.isArray(horarioVisible) && (
        <div className="mt-8">
          <h3 className="text-xl font-bold mb-3">🕒 Resumen de horas faltantes</h3>
          <div className="overflow-x-auto border shadow-md rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-4 py-2">Curso</th>
                  {grados.map(g => (
                    <th key={g} className="border px-4 py-2 text-center">
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cursosDesdeDB.map(curso => {
                  const gradoIdBase = (nivel === "Primaria") ? 6 : 1;
                  const horasFaltantesRow = grados.map((_, gradoIndex) => {
                    const gradoId = gradoIdBase + gradoIndex;
                    const esperadas = horasCursos?.[curso.id]?.[gradoId] || 0;
                    const asignadas = contarHorasAsignadas(curso.id, gradoIndex);
                    const faltantes = esperadas - asignadas;
                    return { faltantes, esperadas };
                  });

                  if (horasFaltantesRow.every(h => h.esperadas === 0)) return null;

                  return (
                    <tr key={curso.id} className="hover:bg-gray-50">
                      <td className="border px-4 py-2 font-medium">{curso.nombre}</td>
                      {horasFaltantesRow.map((h, i) => (
                        <td
                          key={i}
                          className={`border px-4 py-2 text-center ${h.faltantes > 0 ? "text-red-600 font-bold" : "text-green-600"}`}
                        >
                          {h.esperadas > 0 ? (h.faltantes > 0 ? `${h.faltantes} faltantes` : "✓") : "-"}
                        </td>
                      ))}
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

