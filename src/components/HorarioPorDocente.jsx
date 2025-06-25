import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import Breadcrumbs from "../components/Breadcrumbs";
import axios from "axios";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const bloques = [
  "07:15 - 08:00", "08:00 - 08:45", "08:45 - 09:30", "09:30 - 10:15",
  "10:30 - 11:15", "11:15 - 12:00", "12:00 - 12:45", "12:45 - 13:30"
];

const diasSemana = ["lunes", "martes", "miércoles", "jueves", "viernes"];

const nombresCursos = {
  1: "Matemática", 2: "Comunicación", 3: "Arte", 4: "Tutoría", 5: "Inglés",
  6: "Ciencia y tecnología", 7: "Ciencias sociales", 8: "Desarrollo personal",
  9: "Ed. Física", 10: "Ed. trabajo", 11: "Religión"
};

const HorarioPorDocente = () => {
  const { search } = useLocation();
  const nivel = new URLSearchParams(search).get("nivel") || "Secundaria";
  const [docenteIdSeleccionado, setDocenteIdSeleccionado] = useState(null);
  const [horariosDocente, setHorariosDocente] = useState([]);
  const [horarioSeleccionado, setHorarioSeleccionado] = useState(1);
  const tablaRef = useRef();
  const { docentes } = useDocentes();

  const docentesFiltrados = docentes.filter(d => d.nivel === nivel);
  const docenteNombre = docentesFiltrados.find(d => d.id === docenteIdSeleccionado)?.nombre;

  useEffect(() => {
    const fetchHorarios = async () => {
      if (!docenteIdSeleccionado) return;
      const res = await axios.get(
        `${SUPABASE_URL}/rest/v1/horarios?docente_id=eq.${docenteIdSeleccionado}&nivel=eq.${nivel}&select=*`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      const agrupados = {};
      res.data.forEach(row => {
        const h = row.horario;
        if (!agrupados[h]) agrupados[h] = [];
        agrupados[h].push(row);
      });

      const ordenados = Object.keys(agrupados).map(Number).sort((a, b) => a - b);
      const mapeo = {};
      ordenados.forEach((id, idx) => {
        mapeo[id] = idx + 1;
      });

      const renumerado = {};
      for (const [originalId, datos] of Object.entries(agrupados)) {
        const nuevoId = mapeo[parseInt(originalId)];
        renumerado[nuevoId] = datos;
      }

      setHorariosDocente(renumerado);
      setHorarioSeleccionado(1);
    };

    fetchHorarios();
  }, [docenteIdSeleccionado]);

  const exportarPDF = async () => {
    const canvas = await html2canvas(tablaRef.current);
    const pdf = new jsPDF("landscape", "pt", "a4");
    const imgData = canvas.toDataURL("image/png");
    const props = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (props.height * pdfWidth) / props.width;
    pdf.addImage(imgData, "PNG", 20, 20, pdfWidth - 40, pdfHeight);
    pdf.save(`Horario_${docenteNombre}_v${horarioSeleccionado}.pdf`);
  };

  const exportarExcel = () => {
    const tabla = tablaRef.current;
    const wb = XLSX.utils.table_to_book(tabla, { sheet: "Horario" });
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), `Horario_${docenteNombre}_v${horarioSeleccionado}.xlsx`);
  };

  const horarioActual = horariosDocente[horarioSeleccionado] || [];

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-2xl font-bold mb-4">📅 Horario de Docente</h2>

      <select onChange={(e) => setDocenteIdSeleccionado(parseInt(e.target.value))} className="border rounded p-2 mb-4 w-full" defaultValue="">
        <option value="">-- Seleccione un docente --</option>
        {docentesFiltrados.map((d) => (
          <option key={d.id} value={d.id}>{d.nombre}</option>
        ))}
      </select>

      {docenteIdSeleccionado && Object.keys(horariosDocente).length > 0 && (
        <>
          <div className="flex items-center gap-4 mb-4">
            <label>Versión de horario:</label>
            <select value={horarioSeleccionado} onChange={e => setHorarioSeleccionado(Number(e.target.value))} className="border p-1">
              {Object.keys(horariosDocente).sort((a, b) => a - b).map(h => (
                <option key={h} value={h}>Horario #{h}</option>
              ))}
            </select>
            <button onClick={exportarPDF} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Exportar PDF</button>
            <button onClick={exportarExcel} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Exportar Excel</button>
          </div>

          <div ref={tablaRef} className="overflow-auto border shadow rounded">
            <table className="w-full text-sm text-center border-collapse border border-black">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-black px-2 py-1">Hora</th>
                  {diasSemana.map((dia, i) => (
                    <th key={i} className="border border-black px-2 py-1">{dia}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bloques.map((bloque, bloqueIdx) => (
                  <tr key={bloqueIdx}>
                    <td className="border border-black px-2 py-1 font-medium">{bloque}</td>
                    {diasSemana.map((diaNombre, diaIndex) => {
                      const celdasDelDia = horarioActual.filter(h => h.dia === diaNombre && h.bloque === bloqueIdx);
                      const contenido = celdasDelDia.map(h => (
                        <div key={`${h.curso_id}-${h.grado_id}`} className="mb-1">
                          <div className="font-semibold">{nombresCursos[h.curso_id]}</div>
                          <div className="text-xs italic">{docenteNombre}</div>
                          <div className="text-xs text-gray-600">Grado: {nivel === "Primaria" ? h.grado_id - 5 : h.grado_id}°</div>
                        </div>
                      ));
                      return <td key={diaIndex} className="border border-black px-2 py-1">{contenido}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default HorarioPorDocente;
