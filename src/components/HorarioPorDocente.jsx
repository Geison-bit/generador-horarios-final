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

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes"]; // L-V

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
          .select("id, nombre, apellido, nivel, activo")
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
  const docenteNombre = useMemo(
    () => docentesFiltrados.find((d) => d.id === Number(docenteId))?.nombre || "",
    [docentesFiltrados, docenteId]
  );

  const [franjas, setFranjas] = useState([]);               // [{bloque, hora_inicio, hora_fin}]
  const [cursosMap, setCursosMap] = useState({});           // {id: nombre}
  const [versiones, setVersiones] = useState([]);           // [1,2,3,...]
  const [horariosPorVersion, setHorariosPorVersion] = useState({}); // {version: rows[]}
  const [versionActual, setVersionActual] = useState(1);
  const [loading, setLoading] = useState(false);

  const tablaRef = useRef(null);

  // ------- Cargas iniciales -------
  useEffect(() => {
    (async () => {
      await Promise.all([cargarFranjas(), cargarCursos()]);
    })();
  }, [nivel]);

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

  // Cargar horarios por docente
  useEffect(() => {
    (async () => {
      if (!docenteId) {
        setHorariosPorVersion({});
        setVersiones([]);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("horarios")
        .select("horario, dia, bloque, curso_id, grado_id")
        .eq("docente_id", Number(docenteId))
        .eq("nivel", nivel);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      // Agrupar por campo "horario" y renumerar correlativamente 1..N
      const grupos = {};
      for (const row of data || []) {
        const h = Number(row.horario) || 1;
        if (!grupos[h]) grupos[h] = [];
        grupos[h].push(row);
      }
      const ordenados = Object.keys(grupos).map(Number).sort((a, b) => a - b);
      const mapeo = new Map(ordenados.map((v, i) => [v, i + 1]));

      const renumerado = {};
      for (const [k, arr] of Object.entries(grupos)) {
        const nueva = mapeo.get(Number(k));
        renumerado[nueva] = arr;
      }
      setHorariosPorVersion(renumerado);

      const nuevasVersiones = Array.from({ length: Object.keys(renumerado).length }, (_, i) => i + 1);
      setVersiones(nuevasVersiones);
      setVersionActual(nuevasVersiones.length > 0 ? 1 : 0);
      setLoading(false);
    })();
  }, [docenteId, nivel]);

  const horarioActual = horariosPorVersion[versionActual] || [];

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
      if (f) return `${f.hora_inicio} - ${f.hora_fin}`;
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

  // Coincidencia flexible por bloque (acepta 0-based u 1-based)
  function matchBloque(rowBloque, idx) {
    const byIdx = rowBloque === idx; // 0,1,2...
    const byNumero = franjas[idx]?.bloque != null && rowBloque === franjas[idx].bloque; // 1..N
    return byIdx || byNumero;
  }

  // Color estable por curso (hash hue)
  function colorCurso(id) {
    const h = (Number(id) * 47) % 360;
    return `hsl(${h} 70% 92%)`;
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />

      <h2 className="text-xl md:text-2xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
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
              className="inline-flex items-center gap-2 rounded bg-rose-600 px-3 py-2 text-white hover:bg-rose-700"
            >
              <Download className="size-4" /> Exportar PDF
            </button>
            <button
              onClick={exportarExcel}
              className="inline-flex items-center gap-2 rounded bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700"
            >
              <FileSpreadsheet className="size-4" /> Exportar Excel
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded bg-slate-700 px-3 py-2 text-white hover:bg-slate-800"
            >
              <Printer className="size-4" /> Imprimir
            </button>
          </div>

          {/* Tabla */}
          <div ref={tablaRef} className="overflow-auto rounded-2xl border border-slate-300 bg-white shadow">
            <table className="w-full text-sm text-center border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border border-slate-300 px-2 py-2 text-left">Hora</th>
                  {DIAS.map((dia) => (
                    <th key={dia} className="border border-slate-300 px-2 py-2 capitalize">
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
                    {DIAS.map((diaNombre) => {
                      const celdas = horarioActual.filter(
                        (h) => h.dia === diaNombre && matchBloque(h.bloque, idx)
                      );
                      return (
                        <td key={`${diaNombre}-${idx}`} className="border border-slate-300 px-2 py-2 align-top">
                          {celdas.length === 0 ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            celdas.map((h, i2) => (
                              <div
                                key={`${h.curso_id}-${h.grado_id}-${i2}`}
                                className="mb-1 rounded-lg px-2 py-1 text-left"
                                style={{ background: colorCurso(h.curso_id) }}
                              >
                                <div className="font-semibold">
                                  {cursosMap[h.curso_id] || `Curso ${h.curso_id}`}
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  Docente: <span className="italic">{docenteNombre}</span>
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  Grado: {nivel === "Primaria" ? h.grado_id - 5 : h.grado_id}°
                                </div>
                              </div>
                            ))
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {loading && <p className="mt-3 text-sm text-slate-600">Cargando horarios…</p>}
          {!loading && horarioActual.length === 0 && (
            <p className="mt-3 text-sm text-slate-600">No se encontraron horarios para este docente.</p>
          )}
        </>
      )}
    </div>
  );
}
