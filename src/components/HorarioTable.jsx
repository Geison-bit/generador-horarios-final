
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import { enviarDznAlServidor } from "../services/horarioService";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

const nombresCursos = {
  1: "Matemática", 2: "Comunicación", 3: "Arte", 4: "Tutoría", 5: "Inglés",
  6: "Ciencia y tecnología", 7: "Ciencias sociales", 8: "Desarrollo personal",
  9: "Ed. Física", 10: "Ed. trabajo", 11: "Religión",
  16: "Matemática", 17: "Comunicación", 18: "Arte", 19: "Tutoría", 20: "Ed. Física"
};

// Paleta de colores suaves y distintos (puedes personalizar)
const coloresDisponibles = [
  "bg-red-300", "bg-blue-300", "bg-green-300", "bg-yellow-300", "bg-pink-300",
  "bg-purple-300", "bg-indigo-300", "bg-orange-300", "bg-teal-300", "bg-lime-300",
  "bg-cyan-300", "bg-amber-300", "bg-rose-300", "bg-fuchsia-300", "bg-sky-300"
];

// Mapa para recordar qué color se asignó a cada docente
const mapaDocenteColor = {};

const getColorPorDocente = (nombreDocente) => {
  if (!nombreDocente) return "bg-gray-200";

  if (!mapaDocenteColor[nombreDocente]) {
    const usados = Object.values(mapaDocenteColor);
    const disponibles = coloresDisponibles.filter(c => !usados.includes(c));
    const colorElegido = disponibles.length > 0
      ? disponibles[Math.floor(Math.random() * disponibles.length)]
      : coloresDisponibles[Math.floor(Math.random() * coloresDisponibles.length)];

    mapaDocenteColor[nombreDocente] = colorElegido;
  }

  return mapaDocenteColor[nombreDocente];
};

const esHorarioVacio = (horario) => {
  return !horario?.some(dia => dia.some(bloque => bloque.some(curso => curso > 0)));
};

const HorarioTable = () => {
  const [bloquesHorario, setBloquesHorario] = useState([]);
  const [historial, setHistorial] = useState(() => {
    const almacenado = localStorage.getItem("historialHorarios");
    return almacenado ? JSON.parse(almacenado) : [];
  });
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [asignacionesDesdeDB, setAsignacionesDesdeDB] = useState([]);
  const { docentes, restricciones, asignaciones, horasCursos, setHorarioGeneral } = useDocentes();
  const location = useLocation();
  const nivel = new URLSearchParams(location.search).get("nivel") || "Secundaria";

  const grados = nivel === "Primaria"
    ? ["1°", "2°", "3°", "4°", "5°", "6°"]
    : ["1°", "2°", "3°", "4°", "5°"];

  const cursosOrdenados = Object.keys(asignaciones || {});

  useEffect(() => {
    const fetchBloques = async () => {
      const { data, error } = await supabase
        .from("franjas_horarias")
        .select("hora_inicio, hora_fin")
        .eq("nivel", nivel)
        .order("bloque");

      if (!error && data.length > 0) {
        setBloquesHorario(data.map(b => `${b.hora_inicio} - ${b.hora_fin}`));
      }
    };
    fetchBloques();
  }, [nivel]);

  useEffect(() => {
    const cargarAsignaciones = async () => {
      const { data, error } = await supabase
        .from("asignaciones")
        .select("curso_id, grado_id, docente_id")
        .eq("nivel", nivel);

      if (!error && data) {
        setAsignacionesDesdeDB(data);
      }
    };
    cargarAsignaciones();
  }, [nivel]);

  const obtenerNombreDocente = (cursoId, gradoIndex) => {
    const gradoId = nivel === "Primaria" ? gradoIndex + 6 : gradoIndex + 1;
    const asignacion = asignacionesDesdeDB.find(a => a.curso_id === cursoId && a.grado_id === gradoId);
    if (!asignacion) return "";
    const docente = docentes.find(d => d.id === asignacion.docente_id);
    return docente ? docente.nombre : "";
  };

  const exportarPDF = async () => {
    const pdf = new jsPDF("landscape", "pt", "a4");
    for (let diaIndex = 0; diaIndex < 5; diaIndex++) {
      const diaElement = document.getElementById(`dia-${diaIndex}`);
      if (!diaElement) continue;
      const canvas = await html2canvas(diaElement);
      const imgData = canvas.toDataURL("image/png");
      const props = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (props.height * pdfWidth) / props.width;
      if (diaIndex > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 20, 20, pdfWidth - 40, pdfHeight);
    }
    pdf.save(`Horario_${nivel}.pdf`);
  };

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    const horario = historial[indiceSeleccionado];
    horario.forEach((bloquesDia, diaIndex) => {
      const sheetData = [["Hora", ...grados]];
      bloquesHorario.forEach((hora, bloqueIndex) => {
        const fila = [hora];
        grados.forEach((_, gradoIndex) => {
          const cursoId = bloquesDia?.[bloqueIndex]?.[gradoIndex] || 0;
          const cursoNombre = nombresCursos[cursoId] || "";
          const docenteNombre = obtenerNombreDocente(cursoId, gradoIndex);
          fila.push(cursoNombre ? `${cursoNombre} - ${docenteNombre}` : "");
        });
        sheetData.push(fila);
      });
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"][diaIndex]);
    });
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), `Horario_${nivel}.xlsx`);
  };

  const generarHorario = async () => {
    setCargando(true);
    try {
      const docentesFiltrados = docentes.filter(d => d.nivel === nivel);
      const asignacionesFiltradas = Object.fromEntries(
        Object.entries(asignaciones).map(([cursoId, gradosObj]) => [
          cursoId,
          Object.fromEntries(
            Object.entries(gradosObj).filter(([gradoId]) => {
              const g = parseInt(gradoId);
              return nivel === "Primaria" ? g >= 6 : g <= 5;
            })
          )
        ])
      );

      const resultado = await enviarDznAlServidor(
        docentesFiltrados,
        asignacionesFiltradas,
        restricciones,
        horasCursos,
        nivel
      );

      if (!resultado || !resultado.horario || esHorarioVacio(resultado.horario)) {
        throw new Error("❌ MiniZinc no encontró una asignación válida.");
      }

      const nuevoHistorial = [...historial, resultado.horario];
      if (nuevoHistorial.length > 3) nuevoHistorial.shift();

      localStorage.setItem("historialHorarios", JSON.stringify(nuevoHistorial));
      setHistorial(nuevoHistorial);
      setIndiceSeleccionado(nuevoHistorial.length - 1);
      setHorarioGeneral(resultado.horario);
    } catch (err) {
      alert("❌ Error al generar el horario: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  const horarioSeleccionado = historial[indiceSeleccionado];

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">🧱️ Generar Horario Escolar - {nivel}
        </h2>
        <button
          onClick={generarHorario}
          className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded shadow"
        >
          🗓️ Generar horario
        </button>
      </div>

      {cargando && <p className="text-gray-600">Generando horario, por favor espere...</p>}

      {historial.length > 0 && (
        <div className="flex items-center gap-4">
          <label>Horario generado:</label>
          <select
            className="border px-2 py-1"
            value={indiceSeleccionado}
            onChange={(e) => setIndiceSeleccionado(Number(e.target.value))}
          >
            {historial.map((_, i) => (
              <option key={i} value={i}>Horario #{i + 1}</option>
            ))}
          </select>
          <button onClick={exportarPDF} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Exportar PDF</button>
          <button onClick={exportarExcel} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Exportar Excel</button>
        </div>
      )}

      {Array.isArray(horarioSeleccionado) && horarioSeleccionado.map((bloquesDia, diaIndex) => (
        <div key={diaIndex} id={`dia-${diaIndex}`} className="mb-4">
          <h4 className="text-xl font-bold mb-2">{["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"][diaIndex]}</h4>
          <div className="overflow-auto border shadow rounded">
            <table className="w-full text-sm text-center border-collapse border border-black">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-black px-2 py-1">Hora</th>
                  {grados.map((grado) => (
                    <th key={grado} className="border border-black px-2 py-1">{grado}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bloquesHorario.map((horaLabel, bloqueIndex) => (
                  <tr key={bloqueIndex}>
                    <td className="border border-black px-2 py-1 font-medium">{horaLabel}</td>
                    {grados.map((_, gradoIndex) => {
                      const cursoId = bloquesDia?.[bloqueIndex]?.[gradoIndex] || 0;
                      const cursoNombre = nombresCursos[cursoId] || "";
                      const docenteNombre = obtenerNombreDocente(cursoId, gradoIndex);
                      return (
                        <td key={gradoIndex} className={`border border-black px-2 py-1 ${getColorPorDocente(docenteNombre)}`}>
                          <div className="font-semibold">{cursoNombre}</div>
                          <div className="text-xs italic">{docenteNombre}</div>
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
    </div>
  );
};

export default HorarioTable;