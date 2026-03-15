import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import XLSXStyle from "xlsx-js-style";
import { saveAs } from "file-saver";
import Breadcrumbs from "../components/Breadcrumbs";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import { supabase } from "../supabaseClient";
import { Download, FileSpreadsheet, Printer, User } from "lucide-react";
import { listSharedScheduleGenerations } from "../services/sharedScheduleHistoryService";

const DIAS_KEYS = ["lunes", "martes", "miercoles", "jueves", "viernes"]; // L-V
const DIAS_UI = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const VERSION_OPTIONS = [1, 2, 3, 4, 5];
const PALETA_FUERTE = [
  "#38bdf8",
  "#f97316",
  "#facc15",
  "#4ade80",
  "#fb7185",
  "#a3e635",
  "#22d3ee",
  "#c084fc",
  "#f472b6",
  "#fb923c",
];

const normalizeDia = (value) => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
};

const formatHora = (value) => {
  if (!value) return "";
  const parts = String(value).split(":");
  const h = (parts[0] || "").padStart(2, "0");
  const m = (parts[1] || "00").padStart(2, "0");
  return `${h}:${m}`;
};

export default function HorarioPorDocente() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const nivel = params.get("nivel") || "Secundaria";
  const version = Number(params.get("version")) || 1;

  // 1) Intentamos usar docentes del Context
  const { docentes } = useDocentes();

  // 2) Fallback local si el Context viene vacío: traemos solo ACTIVOS del nivel actual
  const [docentesLocal, setDocentesLocal] = useState([]);
  useEffect(() => {
    if (!docentes || docentes.length === 0) {
      (async () => {
        const { data, error } = await supabase
          .from("docentes")
          .select("id, nombre, apellido, nivel, activo, color, version_num")
          .eq("nivel", nivel)
          .eq("version_num", version)
          .eq("activo", true)
          .order("apellido", { ascending: true });
        if (!error) setDocentesLocal(data || []);
      })();
    } else {
      setDocentesLocal([]); // limpiamos fallback si el context trae datos
    }
  }, [nivel, version, docentes]);

  const fuenteDocentes = (docentes && docentes.length > 0) ? docentes : docentesLocal;

  // Aseguramos: nivel y solo activos (si el context no filtra ya)
  const docentesFiltrados = useMemo(() => {
    const filtrados = (fuenteDocentes || []).filter(
      (d) => d.nivel === nivel && d.version_num === version && (d.activo ?? true)
    );
    const unique = new Map();
    filtrados.forEach((d) => {
      if (!unique.has(d.id)) unique.set(d.id, d);
    });
    return Array.from(unique.values());
  }, [fuenteDocentes, nivel, version]);

  const [docenteId, setDocenteId] = useState("");
  const docenteColor = useMemo(
    () => docentesFiltrados.find((d) => d.id === Number(docenteId))?.color || "",
    [docentesFiltrados, docenteId]
  );
  const docenteNombre = useMemo(
    () => docentesFiltrados.find((d) => d.id === Number(docenteId))?.nombre || "",
    [docentesFiltrados, docenteId]
  );
  const [docenteColorDb, setDocenteColorDb] = useState("");

  const [franjas, setFranjas] = useState([]);               // [{bloque, hora_inicio, hora_fin}]
  const [cursosMap, setCursosMap] = useState({});           // {id: nombre}
  const [asignaciones, setAsignaciones] = useState([]);     // [{curso_id, grado_id, docente_id}]
  const [historialGeneraciones, setHistorialGeneraciones] = useState([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [horarioActual, setHorarioActual] = useState([]);
  const [loading, setLoading] = useState(false);
  const storageKey = `historialHorarios:${nivel}:${version}`;

  const tablaRef = useRef(null);

  // ------- Cargas iniciales -------
  useEffect(() => {
    (async () => {
      await Promise.all([cargarFranjas(), cargarCursos(), cargarAsignaciones()]);
    })();
  }, [nivel, version]);

  useEffect(() => {
    const cargarHistorial = async () => {
      try {
        const remoto = await listSharedScheduleGenerations(nivel, version);
        if (remoto.length > 0) {
          localStorage.setItem(storageKey, JSON.stringify(remoto));
          setHistorialGeneraciones(remoto);
          setIndiceSeleccionado(remoto.length - 1);
          return;
        }
      } catch (error) {
        console.warn("No se pudo leer el historial compartido:", error);
      }

      const almacenado = localStorage.getItem(storageKey);
      const historico = almacenado ? JSON.parse(almacenado) : [];
      if (Array.isArray(historico) && historico.length > 0) {
        setHistorialGeneraciones(historico);
        setIndiceSeleccionado(historico.length - 1);
        return;
      }
      setHistorialGeneraciones([]);
      setIndiceSeleccionado(0);
    };

    cargarHistorial();
  }, [storageKey]);

  // Color del docente (fallback directo a BD por si el context no lo trae)
  useEffect(() => {
    if (!docenteId) {
      setDocenteColorDb("");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("docentes")
        .select("color")
        .eq("id", Number(docenteId))
        .maybeSingle();
      if (!error && data?.color) setDocenteColorDb(data.color);
    })();
  }, [docenteId]);

  // Cargar franjas horarias por nivel (dinámicas)
  async function cargarFranjas() {
    const { data, error } = await supabase
      .from("franjas_horarias")
      .select("bloque, hora_inicio, hora_fin")
      .eq("nivel", nivel)
      .eq("version_num", version)
      .order("bloque");
    if (!error && data) setFranjas(data);
  }

  // Mapa de cursos id -> nombre (solo cursos activos del nivel)
  async function cargarCursos() {
    const { data, error } = await supabase
      .from("cursos")
      .select("id, nombre")
      .eq("nivel", nivel)
      .eq("version_num", version)
      .eq("activo", true); // ✅ solo cursos activos
    if (!error) setCursosMap(Object.fromEntries((data || []).map((c) => [c.id, c.nombre])));
  }

  async function cargarAsignaciones() {
    const { data, error } = await supabase
      .from("asignaciones")
      .select("curso_id, grado_id, docente_id")
      .eq("nivel", nivel)
      .eq("version_num", version);
    if (!error) setAsignaciones(data || []);
  }

  const asignacionMap = useMemo(() => {
    const map = new Map();
    (asignaciones || []).forEach((a) => {
      map.set(`${a.curso_id}-${a.grado_id}`, a.docente_id);
    });
    return map;
  }, [asignaciones]);

  const horarioLocalDocente = useMemo(() => {
    const horarioSeleccionado = historialGeneraciones[indiceSeleccionado];
    if (!Array.isArray(horarioSeleccionado) || !docenteId) return [];

    const filas = [];
    horarioSeleccionado.forEach((bloquesDia, diaIndex) => {
      (bloquesDia || []).forEach((bloqueCursos, bloqueIndex) => {
        (bloqueCursos || []).forEach((cursoId, gradoIndex) => {
          if (!cursoId) return;
          const gradoId = nivel === "Primaria" ? gradoIndex + 6 : gradoIndex + 1;
          const docenteAsignado = asignacionMap.get(`${cursoId}-${gradoId}`);
          if (Number(docenteAsignado) !== Number(docenteId)) return;

          filas.push({
            dia: DIAS_KEYS[diaIndex],
            bloque: bloqueIndex,
            curso_id: cursoId,
            grado_id: gradoId,
          });
        });
      });
    });

    return filas;
  }, [historialGeneraciones, indiceSeleccionado, docenteId, asignacionMap, nivel]);

  const horarioMostrado = horarioLocalDocente.length > 0 ? horarioLocalDocente : horarioActual;

  // Cargar horarios por docente para la misma version usada en horario general
  useEffect(() => {
    (async () => {
      if (!docenteId) {
        setHorarioActual([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("horarios")
        .select("version_num, dia, bloque, curso_id, grado_id")
        .eq("docente_id", Number(docenteId))
        .eq("nivel", nivel)
        .eq("version_num", version);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      setHorarioActual(data || []);
      setLoading(false);
    })();
  }, [docenteId, nivel, version, asignacionMap]);
  const bloqueOneBased = useMemo(() => {
    const bloquesHorario = (horarioMostrado || [])
      .map((r) => Number(r.bloque))
      .filter((n) => Number.isFinite(n));
    if (bloquesHorario.includes(0)) return false;
    if (bloquesHorario.length > 0) return Math.min(...bloquesHorario) === 1;
    const bloquesFranjas = (franjas || [])
      .map((f) => Number(f.bloque))
      .filter((n) => Number.isFinite(n));
    return bloquesFranjas.length > 0 && Math.min(...bloquesFranjas) === 1;
  }, [horarioMostrado, franjas]);

  // ------- Exportar -------
  async function exportarPDF() {
    if (!tablaRef.current) return;
    const canvas = await html2canvas(tablaRef.current, { scale: 2 });
    const pdf = new jsPDF("landscape", "pt", "a4");
    const img = canvas.toDataURL("image/png");
    const props = pdf.getImageProperties(img);
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = (props.height * pageW) / props.width;
    pdf.addImage(img, "PNG", 20, 20, pageW - 40, pageH);
    pdf.save(`Horario_${docenteNombre || docenteId}_v${version}.pdf`);
  }

  function exportarExcel() {
    if (!docenteId) return;

    const headerStyle = {
      font: { bold: true, color: { rgb: "111827" } },
      fill: { patternType: "solid", fgColor: { rgb: "E5E7EB" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "CBD5E1" } },
        bottom: { style: "thin", color: { rgb: "CBD5E1" } },
        left: { style: "thin", color: { rgb: "CBD5E1" } },
        right: { style: "thin", color: { rgb: "CBD5E1" } },
      },
    };

    const baseBorder = {
      top: { style: "thin", color: { rgb: "CBD5E1" } },
      bottom: { style: "thin", color: { rgb: "CBD5E1" } },
      left: { style: "thin", color: { rgb: "CBD5E1" } },
      right: { style: "thin", color: { rgb: "CBD5E1" } },
    };

    const colorCurso = (id) => {
      const idx = Math.abs(Number(id || 0)) % PALETA_FUERTE.length;
      return PALETA_FUERTE[idx];
    };

    const colorGrado = (gradoId) => {
      const idx = Math.abs(Number(gradoId || 0)) % PALETA_FUERTE.length;
      return PALETA_FUERTE[idx];
    };

    const sheetData = [
      [
        { v: "Hora", s: headerStyle },
        ...DIAS_UI.map((dia) => ({ v: dia, s: headerStyle })),
      ],
    ];

    Array.from({ length: Math.max(franjas.length || 8, 8) }, (_, i) => i).forEach((idx) => {
      const row = [
        {
          v: bloqueLabel(idx),
          s: {
            ...headerStyle,
            fill: { patternType: "solid", fgColor: { rgb: "F8FAFC" } },
          },
        },
      ];

      DIAS_UI.forEach((_, diaIndex) => {
        const diaKey = DIAS_KEYS[diaIndex];
        const celdas = horarioMostrado.filter(
          (h) => normalizeDia(h.dia) === diaKey && matchBloque(h.bloque, idx)
        );
        const celdasOrdenadas = celdas.slice().sort((a, b) => a.grado_id - b.grado_id);
        const celda = celdasOrdenadas[0];

        const bgColor = celda
          ? (usarColorPorGrado ? colorGrado(celda.grado_id) : colorCurso(celda.curso_id)).replace("#", "").toUpperCase()
          : "FFFFFF";

        row.push({
          v: celda
            ? `${cursosMap[celda.curso_id] || `Curso ${celda.curso_id}`}\nGrado: ${
                nivel === "Primaria" ? celda.grado_id - 5 : celda.grado_id
              }`
            : "-",
          s: {
            fill: { patternType: "solid", fgColor: { rgb: bgColor } },
            alignment: { horizontal: "left", vertical: "center", wrapText: true },
            font: { color: { rgb: "111827" }, sz: 10, bold: !!celda },
            border: baseBorder,
          },
        });
      });

      sheetData.push(row);
    });

    const ws = XLSXStyle.utils.aoa_to_sheet(
      sheetData.map((row) => row.map((cell) => cell.v))
    );

    sheetData.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        const addr = XLSXStyle.utils.encode_cell({ r: rIdx, c: cIdx });
        if (!ws[addr]) ws[addr] = { v: cell.v, t: "s" };
        ws[addr].s = cell.s;
      });
    });

    ws["!cols"] = [{ wch: 14 }, ...DIAS_UI.map(() => ({ wch: 20 }))];
    ws["!rows"] = sheetData.map((_, idx) => ({ hpt: idx === 0 ? 22 : 36 }));

    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws, `Horario ${docenteNombre || "Docente"}`);
    const wbout = XLSXStyle.write(wb, { bookType: "xlsx", type: "array" });

    saveAs(
      new Blob([wbout], { type: "application/octet-stream" }),
      `Horario_${docenteNombre || docenteId}_v${version}.xlsx`
    );
  }

  // ------- Helpers UI -------
  const bloqueLabel = (idx) => {
    // Si hay franjas de BD, usamos sus horas; si no, fallback 8 bloques típicos
    if (franjas.length) {
      // admite franja por índice o por número de bloque (1..N)
      const f = franjas[idx] || franjas.find((x) => x.bloque === idx || x.bloque === idx + 1);
      if (f) return `${formatHora(f.hora_inicio)} - ${formatHora(f.hora_fin)}`;
    }
    const fallback = [
      "07:15 - 08:00",
      "08:00 - 08:45",
      "08:45 - 09:30",
      "09:30 - 10:15",
      "10:30 - 11:15",
      "11:15 - 12:00",
      "12:00 - 12:45",
      "12:45 - 13:30",
    ];
    return fallback[idx] || "";
  };

  // Coincidencia por bloque segun base (0-based u 1-based)
  function matchBloque(rowBloque, idx) {
    if (!Number.isFinite(rowBloque)) return false;
    return bloqueOneBased ? rowBloque === idx + 1 : rowBloque === idx;
  }

  // Colores por curso o por grado (según cantidad de cursos del docente)
  const cursosUnicos = useMemo(() => {
    const set = new Set();
    (horarioMostrado || []).forEach((h) => {
      if (h?.curso_id) set.add(h.curso_id);
    });
    return Array.from(set);
  }, [horarioMostrado]);

  const usarColorPorGrado = cursosUnicos.length <= 1;

  function colorCurso(id) {
    const idx = Math.abs(Number(id || 0)) % PALETA_FUERTE.length;
    return PALETA_FUERTE[idx];
  }

  function colorGrado(gradoId) {
    const idx = Math.abs(Number(gradoId || 0)) % PALETA_FUERTE.length;
    return PALETA_FUERTE[idx];
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />

      <h2 className="mt-4 mb-4 text-xl md:text-2xl font-semibold text-slate-800 flex items-center gap-2">
        <User className="size-6 text-blue-600" /> Horario de Docente
      </h2>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-semibold">Datos base:</span>
        <select
          value={version}
          onChange={(e) => {
            const v = e.target.value;
            window.location.href = `/horario-docente?nivel=${nivel}&version=${v}`;
          }}
          className="border px-2 py-1 rounded"
        >
          {VERSION_OPTIONS.map((v) => (
            <option key={v} value={v}>Versión {v}</option>
          ))}
        </select>
      </div>

      {/* Selector de docente (solo activos del nivel) */}
      <select
        value={docenteId}
        onChange={(e) => setDocenteId(e.target.value)}
        className="border rounded px-3 py-2 mb-4 w-full max-w-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
      >
        <option value="">-- Seleccione un docente --</option>
        {docentesFiltrados.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nombre}
          </option>
        ))}
      </select>

      {docenteId && (
        <>
          {/* Barra acciones */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label htmlFor="horario-docente-version-visual" className="text-sm text-slate-700">Versión de horario:</label>
            <select
              id="horario-docente-version-visual"
              value={indiceSeleccionado}
              onChange={(e) => {
                setIndiceSeleccionado(Number(e.target.value));
              }}
              className="border rounded px-2 py-1 text-sm"
              disabled={historialGeneraciones.length === 0}
            >
              {historialGeneraciones.length > 0 ? (
                historialGeneraciones.map((_, idx) => (
                  <option key={`horario-${idx}`} value={idx}>
                    Horario #{idx + 1}
                  </option>
                ))
              ) : (
                <option value={0}>Horario guardado</option>
              )}
            </select>
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
            <button
              onClick={() => window.print()}
              className="bg-slate-700 text-white px-4 py-1.5 rounded hover:bg-slate-800 transition-colors text-sm w-full sm:w-auto"
            >
              Imprimir
            </button>
          </div>

          {/* Tabla */}
          <div ref={tablaRef} className="overflow-auto rounded-2xl border border-slate-300 bg-white shadow">
            <table className="w-full text-sm text-center border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border border-slate-300 px-2 py-2 text-left">Hora</th>
                  {DIAS_UI.map((dia) => (
                    <th key={dia} className="border border-slate-300 px-2 py-2">
                      {dia}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(franjas.length || 8, 8) }, (_, i) => i).map((idx) => (
                  <tr key={`bloque-${idx}-${bloqueLabel(idx)}`}>
                    <td className="border border-slate-300 px-2 py-2 font-medium text-left whitespace-nowrap">
                      {bloqueLabel(idx)}
                    </td>
                    {DIAS_UI.map((diaLabel, diaIndex) => {
                      const diaKey = DIAS_KEYS[diaIndex];
                      const celdas = horarioMostrado.filter(
                        (h) => normalizeDia(h.dia) === diaKey && matchBloque(h.bloque, idx)
                      );
                      const celdasOrdenadas = celdas.slice().sort((a, b) => a.grado_id - b.grado_id);
                      const celda = celdasOrdenadas[0];
                      return (
                        <td key={`${diaKey}-${idx}`} className="border border-slate-300 px-2 py-2 align-top">
                          {!celda ? (
                            <span className="text-xs text-slate-400">-</span>
                          ) : (
                            <div
                              className="rounded-lg px-2 py-1 text-left text-black"
                              style={{
                                background: usarColorPorGrado
                                  ? colorGrado(celda.grado_id)
                                  : colorCurso(celda.curso_id),
                              }}
                            >
                              <div className="font-semibold">
                                {cursosMap[celda.curso_id] || `Curso ${celda.curso_id}`}
                              </div>
                              <div className="text-[13px] font-semibold text-black">
                                Grado: {nivel === "Primaria" ? celda.grado_id - 5 : celda.grado_id}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loading && <p className="mt-3 text-sm text-slate-600">Cargando horarios...</p>}
          {!loading && horarioMostrado.length === 0 && (
            <p className="mt-3 text-sm text-slate-600">No se encontraron horarios para este docente.</p>
          )}
        </>
      )}
    </div>
  );
}
