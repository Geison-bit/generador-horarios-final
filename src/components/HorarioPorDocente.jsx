import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Breadcrumbs from "../components/Breadcrumbs";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import { supabase } from "../supabaseClient";
import { Download, FileSpreadsheet, Printer, User } from "lucide-react";

const DIAS_KEYS = ["lunes", "martes", "miercoles", "jueves", "viernes"]; // L-V
const DIAS_UI = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

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
  const nivel = new URLSearchParams(search).get("nivel") || "Secundaria";

  // 1) Intentamos usar docentes del Context
  const { docentes } = useDocentes();

  // 2) Fallback local si el Context viene vacío: traemos solo ACTIVOS del nivel actual
  const [docentesLocal, setDocentesLocal] = useState([]);
  useEffect(() => {
    if (!docentes || docentes.length === 0) {
      (async () => {
        const { data, error } = await supabase
          .from("docentes")
          .select("id, nombre, apellido, nivel, activo, color")
          .eq("nivel", nivel)
          .eq("activo", true)
          .order("apellido", { ascending: true });
        if (!error) setDocentesLocal(data || []);
      })();
    } else {
      setDocentesLocal([]); // limpiamos fallback si el context trae datos
    }
  }, [nivel, docentes]);

  const fuenteDocentes = (docentes && docentes.length > 0) ? docentes : docentesLocal;

  // Aseguramos: nivel y solo activos (si el context no filtra ya)
  const docentesFiltrados = useMemo(
    () => (fuenteDocentes || []).filter((d) => d.nivel === nivel && (d.activo ?? true)),
    [fuenteDocentes, nivel]
  );

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
  const [historialLocal, setHistorialLocal] = useState([]); // matriz por version desde localStorage
  const [versiones, setVersiones] = useState([]);           // [1,2,3,...]
  const [horariosPorVersion, setHorariosPorVersion] = useState({}); // {version: rows[]}
  const [versionActual, setVersionActual] = useState(1);
  const [loading, setLoading] = useState(false);

  const tablaRef = useRef(null);

  // ------- Cargas iniciales -------
  useEffect(() => {
    (async () => {
      await Promise.all([cargarFranjas(), cargarCursos(), cargarAsignaciones()]);
      const almacenado = localStorage.getItem("historialHorarios");
      const historico = almacenado ? JSON.parse(almacenado) : [];
      setHistorialLocal(Array.isArray(historico) ? historico : []);
    })();
  }, [nivel]);

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
      .order("bloque");
    if (!error && data) setFranjas(data);
  }

  // Mapa de cursos id -> nombre (solo cursos activos del nivel)
  async function cargarCursos() {
    const { data, error } = await supabase
      .from("cursos")
      .select("id, nombre")
      .eq("nivel", nivel)
      .eq("activo", true); // ✅ solo cursos activos
    if (!error) setCursosMap(Object.fromEntries((data || []).map((c) => [c.id, c.nombre])));
  }

  async function cargarAsignaciones() {
    const { data, error } = await supabase
      .from("asignaciones")
      .select("curso_id, grado_id, docente_id")
      .eq("nivel", nivel);
    if (!error) setAsignaciones(data || []);
  }

  const asignacionMap = useMemo(() => {
    const map = new Map();
    (asignaciones || []).forEach((a) => {
      map.set(`${a.curso_id}-${a.grado_id}`, a.docente_id);
    });
    return map;
  }, [asignaciones]);

  // Cargar horarios por docente
  useEffect(() => {
    (async () => {
      if (!docenteId) {
        setHorariosPorVersion({});
        setVersiones([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("horarios")
        .select("version_num, dia, bloque, curso_id, grado_id")
        .eq("docente_id", Number(docenteId))
        .eq("nivel", nivel);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      const grupos = {};
      for (const row of data || []) {
        const v = Number(row.version_num);
        if (!grupos[v]) grupos[v] = [];
        grupos[v].push(row);
      }

      setHorariosPorVersion(grupos);

      const nuevasVersiones = Object.keys(grupos)
        .map(Number)
        .sort((a, b) => a - b);

      setVersiones(nuevasVersiones);
      setVersionActual(nuevasVersiones[0] || 0);
      setLoading(false);
    })();
  }, [docenteId, nivel, historialLocal, asignacionMap]);

  const horarioActual = horariosPorVersion[versionActual] || [];
  const bloqueOneBased = useMemo(() => {
    const bloquesHorario = (horarioActual || [])
      .map((r) => Number(r.bloque))
      .filter((n) => Number.isFinite(n));
    if (bloquesHorario.includes(0)) return false;
    if (bloquesHorario.length > 0) return Math.min(...bloquesHorario) === 1;
    const bloquesFranjas = (franjas || [])
      .map((f) => Number(f.bloque))
      .filter((n) => Number.isFinite(n));
    return bloquesFranjas.length > 0 && Math.min(...bloquesFranjas) === 1;
  }, [horarioActual, franjas]);

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
    pdf.save(`Horario_${docenteNombre || docenteId}_v${versionActual}.pdf`);
  }

  function exportarExcel() {
    if (!tablaRef.current) return;
    const wb = XLSX.utils.table_to_book(tablaRef.current, { sheet: `Horario ${docenteNombre}` });
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), `Horario_${docenteNombre || docenteId}_v${versionActual}.xlsx`);
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

  // Color estable por curso (hash hue)
  function colorCurso(id) {
    const colorElegido = docenteColor || docenteColorDb;
    if (colorElegido) return colorElegido;
    const h = (Number(id) * 47) % 360;
    return `hsl(${h} 90% 75%)`;
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />

      <h2 className="mt-4 mb-4 text-xl md:text-2xl font-semibold text-slate-800 flex items-center gap-2">
        <User className="size-6 text-blue-600" /> Horario de Docente
      </h2>

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
            <label className="text-sm text-slate-700">Versión de horario:</label>
            <select
              value={versionActual}
              onChange={(e) => setVersionActual(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm"
              disabled={versiones.length === 0}
            >
              {versiones.length > 0 ? (
                versiones.map((v) => (
                  <option key={v} value={v}>
                    Horario #{v}
                  </option>
                ))
              ) : (
                <option>Sin versiones</option>
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
                  <tr key={idx}>
                    <td className="border border-slate-300 px-2 py-2 font-medium text-left whitespace-nowrap">
                      {bloqueLabel(idx)}
                    </td>
                    {DIAS_UI.map((diaLabel, diaIndex) => {
                      const diaKey = DIAS_KEYS[diaIndex];
                      const celdas = horarioActual.filter(
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
                              style={{ background: colorCurso(celda.curso_id) }}
                            >
                              <div className="font-semibold">
                                {cursosMap[celda.curso_id] || `Curso ${celda.curso_id}`}
                              </div>
                              <div className="text-[11px] text-black">
                                Docente: <span className="italic">{docenteNombre}</span>
                              </div>
                              <div className="text-[11px] text-black">
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
          {!loading && horarioActual.length === 0 && (
            <p className="mt-3 text-sm text-slate-600">No se encontraron horarios para este docente.</p>
          )}
        </>
      )}
    </div>
  );
}
