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

// Array of available colors for teachers
const coloresDisponibles = [
  "bg-red-300", "bg-blue-300", "bg-green-300", "bg-yellow-300", "bg-pink-300",
  "bg-purple-300", "bg-indigo-300", "bg-orange-300", "bg-teal-300", "bg-lime-300",
  "bg-cyan-300", "bg-amber-300", "bg-rose-300", "bg-fuchsia-300", "bg-sky-300"
];

// Map to store the color assigned to each teacher
const mapaDocenteColor = {};

// Function to get a consistent color for each teacher
const getColorPorDocente = (nombreDocente) => {
  if (!nombreDocente) return "bg-gray-200"; // Default color if no teacher
  if (!mapaDocenteColor[nombreDocente]) {
    const usados = Object.values(mapaDocenteColor);
    const disponibles = coloresDisponibles.filter(c => !usados.includes(c));
    const colorElegido = disponibles.length > 0
      ? disponibles[Math.floor(Math.random() * disponibles.length)]
      : coloresDisponibles[Math.floor(Math.random() * coloresDisponibles.length)]; // Reuse colors if none are available
    mapaDocenteColor[nombreDocente] = colorElegido;
  }
  return mapaDocenteColor[nombreDocente];
};

// Function to check if a generated schedule is empty
const esHorarioVacio = (horario) => {
  return !horario?.some(dia => dia.some(bloque => bloque.some(curso => curso > 0)));
};

const HorarioTable = () => {
  // --- COMPONENT STATES ---
  const [bloquesHorario, setBloquesHorario] = useState([]);
  const [historialGeneraciones, setHistorialGeneraciones] = useState(() => {
    const almacenado = localStorage.getItem("historialHorarios");
    return almacenado ? JSON.parse(almacenado) : [];
  });
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(0);

  // --- NEW STATES FOR UNDO/REDO ---
  const [historyStack, setHistoryStack] = useState([]); // Stores the edit history
  const [historyPointer, setHistoryPointer] = useState(-1); // Points to the current state in the stack

  const [cargando, setCargando] = useState(false);
  const [asignacionesDesdeDB, setAsignacionesDesdeDB] = useState([]);
  const [cursosDesdeDB, setCursosDesdeDB] = useState([]);
  const [aulasDesdeDB, setAulasDesdeDB] = useState([]);
  const [celdaActiva, setCeldaActiva] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cursosDisponiblesParaCelda, setCursosDisponiblesParaCelda] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [cursoAEliminar, setCursoAEliminar] = useState(null);

  // --- CONTEXT AND ROUTING ---
  const { docentes, restricciones, asignaciones, horasCursos, setHorarioGeneral } = useDocentes();
  const location = useLocation();
  const nivel = new URLSearchParams(location.search).get("nivel") || "Secundaria";
  const grados = nivel === "Primaria"
    ? ["1°", "2°", "3°", "4°", "5°", "6°"]
    : ["1°", "2°", "3°", "4°", "5°"];

  // The visible schedule now depends on the pointer's state in the edit history
  const horarioVisible = historyStack[historyPointer];

  // --- EFFECTS ---
  
  // MODIFICATION: The problematic useEffect has been removed.
  // Logic is now handled in `generarHorario` and `handleVersionChange`.

  // Initialize the component with the first schedule from storage on load
  useEffect(() => {
    const almacenado = localStorage.getItem("historialHorarios");
    const historico = almacenado ? JSON.parse(almacenado) : [];
    if (historico.length > 0) {
        setHistoryStack([historico[0]]);
        setHistoryPointer(0);
    }
  }, []); // Runs only once on component mount
  
  // Load time slots from Supabase
  useEffect(() => {
    const fetchBloques = async () => {
      const { data, error } = await supabase.from("franjas_horarias").select("hora_inicio, hora_fin").eq("nivel", nivel).order("bloque");
      if (!error && data.length > 0) setBloquesHorario(data.map(b => `${b.hora_inicio} - ${b.hora_fin}`));
    };
    fetchBloques();
  }, [nivel]);

  // Load data from the DB
  useEffect(() => {
    const cargarDatos = async () => {
      const { data: asignacionesData } = await supabase.from("asignaciones").select("curso_id, grado_id, docente_id").eq("nivel", nivel);
      if (asignacionesData) setAsignacionesDesdeDB(asignacionesData);
      const { data: cursosData } = await supabase.from("cursos").select("id, nombre");
      if (cursosData) setCursosDesdeDB(cursosData);
      const { data: aulasData } = await supabase.from("aulas").select("id, nombre");
      if (aulasData) setAulasDesdeDB(aulasData);
    };
    cargarDatos();
  }, [nivel]);

  // --- HELPER AND LOGIC FUNCTIONS ---

  const obtenerInfoDocente = (cursoId, gradoIndex) => {
    const gradoId = nivel === "Primaria" ? gradoIndex + 6 : gradoIndex + 1;
    const asignacion = asignacionesDesdeDB.find(a => a.curso_id === cursoId && a.grado_id === gradoId);
    if (!asignacion) return { nombre: "", aula: "" };
    const docente = docentes.find(d => d.id === asignacion.docente_id);
    if (!docente) return { nombre: "", aula: "" };
    const aulaNombre = aulasDesdeDB.find(a => a.id === docente.aula_id)?.nombre || docente.aula_id || "";
    return { nombre: docente.nombre, aula: aulaNombre };
  };

  // Central function to update schedule state and edit history
  const actualizarHistorialDeEdicion = (nuevoHorario) => {
    // Cut future history if we have previously undone changes
    const nuevoStack = historyStack.slice(0, historyPointer + 1);
    nuevoStack.push(nuevoHorario);
    
    setHistoryStack(nuevoStack);
    setHistoryPointer(nuevoStack.length - 1);

    // Persist the change in the generations history in localStorage
    const nuevasGeneraciones = [...historialGeneraciones];
    nuevasGeneraciones[indiceSeleccionado] = nuevoHorario;
    setHistorialGeneraciones(nuevasGeneraciones);
    localStorage.setItem("historialHorarios", JSON.stringify(nuevasGeneraciones));
  };

  const eliminarCurso = (dia, bloque, grado) => {
    setCursoAEliminar({ dia, bloque, grado });
    setShowConfirmModal(true);
  };
  
  const handleConfirmDelete = () => {
    if (!cursoAEliminar) return;
    const { dia, bloque, grado } = cursoAEliminar;
    
    const nuevoHorario = JSON.parse(JSON.stringify(horarioVisible));
    nuevoHorario[dia][bloque][grado] = 0;
    
    actualizarHistorialDeEdicion(nuevoHorario);

    setShowConfirmModal(false);
    setCursoAEliminar(null);
  };

  const insertarCursoManual = (cursoId) => {
    if (!celdaActiva) return;

    const nuevoHorario = JSON.parse(JSON.stringify(horarioVisible));
    nuevoHorario[celdaActiva.dia][celdaActiva.bloque][celdaActiva.grado] = cursoId;

    actualizarHistorialDeEdicion(nuevoHorario);

    setIsModalOpen(false);
    setCeldaActiva(null);
  };

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;

    const srcDia = parseInt(source.droppableId.split("-")[1]);
    const srcBloque = parseInt(source.droppableId.split("-")[2]);
    const srcGrado = parseInt(source.droppableId.split("-")[3]);

    const dstDia = parseInt(destination.droppableId.split("-")[1]);
    const dstBloque = parseInt(destination.droppableId.split("-")[2]);
    const dstGrado = parseInt(destination.droppableId.split("-")[3]);

    const nuevoHorario = JSON.parse(JSON.stringify(horarioVisible));
    const cursoOrigen = nuevoHorario[srcDia][srcBloque][srcGrado];
    const cursoDestino = nuevoHorario[dstDia][dstBloque][dstGrado];

    // Validation to prevent moving to a block where the same teacher is already teaching
    const docenteIdOrigen = obtenerDocenteIdPorCursoYGrado(cursoOrigen, srcGrado);
    if (docenteIdOrigen) {
      const docenteOcupadoEnDestino = !verificarDisponibilidadDocente(docenteIdOrigen, dstDia, dstBloque, dstGrado);
      if (docenteOcupadoEnDestino) {
        alert("❌ Invalid move: The teacher already has a class in that time slot.");
        return;
      }
    }

    nuevoHorario[srcDia][srcBloque][srcGrado] = cursoDestino;
    nuevoHorario[dstDia][dstBloque][dstGrado] = cursoOrigen;

    actualizarHistorialDeEdicion(nuevoHorario);
  };

  const obtenerDocenteIdPorCursoYGrado = (cursoId, gradoIndex) => {
    const gradoId = nivel === "Primaria" ? gradoIndex + 6 : gradoIndex + 1;
    const asignacion = asignacionesDesdeDB.find(a => a.curso_id === cursoId && a.grado_id === gradoId);
    return asignacion ? asignacion.docente_id : null;
  };

  const verificarDisponibilidadDocente = (docenteId, diaIndex, bloqueIndex, gradoIndexExcluir) => {
    if (!docenteId || !horarioVisible) return false;
    const bloqueDelDia = horarioVisible[diaIndex][bloqueIndex];
    for (let i = 0; i < bloqueDelDia.length; i++) {
        if (i === gradoIndexExcluir) continue; // Don't compare the teacher to themselves in the same slot
        const cursoEnCelda = bloqueDelDia[i];
        if (cursoEnCelda > 0) {
            const docenteEnCeldaId = obtenerDocenteIdPorCursoYGrado(cursoEnCelda, i);
            if (docenteEnCeldaId === docenteId) return false; // Teacher is already busy
        }
    }
    return true; // Teacher is available
  };

  const contarHorasAsignadas = (cursoId, gradoIndex) => {
    if (!horarioVisible) return 0;
    return horarioVisible.reduce((total, dia) => 
      total + dia.reduce((subtotal, bloque) => 
        subtotal + (bloque[gradoIndex] === cursoId ? 1 : 0), 0), 0);
  };

  const handleCeldaVaciaClick = (diaIndex, bloqueIndex, gradoIndex) => {
    const gradoId = nivel === "Primaria" ? gradoIndex + 6 : gradoIndex + 1;
    
    const cursosConHorasFaltantes = Object.entries(horasCursos)
      .filter(([cursoId, horasPorGrado]) => {
        const horasEsperadas = horasPorGrado[gradoId] || 0;
        const horasAsignadas = contarHorasAsignadas(parseInt(cursoId), gradoIndex);
        return horasEsperadas > horasAsignadas;
      })
      .map(([cursoId]) => parseInt(cursoId));

    const cursosAgregables = cursosConHorasFaltantes.filter(cursoId => {
      const docenteId = obtenerDocenteIdPorCursoYGrado(cursoId, gradoIndex);
      if (!docenteId) return false;
      return verificarDisponibilidadDocente(docenteId, diaIndex, bloqueIndex, -1); // -1 to not exclude any grade
    });

    const cursosInfo = cursosAgregables.map(id => cursosDesdeDB.find(c => c.id === id)).filter(Boolean);
    
    setCursosDisponiblesParaCelda(cursosInfo);
    setCeldaActiva({ dia: diaIndex, bloque: bloqueIndex, grado: gradoIndex });
    setIsModalOpen(true);
  };
  
  // MODIFICATION: generarHorario now updates the history stack directly
  const generarHorario = async () => {
    setCargando(true);
    try {
      const docentesFiltrados = docentes.filter(d => d.nivel === nivel);
      const asignacionesFiltradas = Object.fromEntries(
        Object.entries(asignaciones).map(([cursoId, gradosObj]) => [cursoId,
          Object.fromEntries(Object.entries(gradosObj).filter(([gradoId]) => {
              const g = parseInt(gradoId);
              return nivel === "Primaria" ? g >= 6 : g <= 5;
            }))
        ])
      );
      const resultado = await enviarDznAlServidor(docentesFiltrados, asignacionesFiltradas, restricciones, horasCursos, nivel);
      if (!resultado || !resultado.horario || esHorarioVacio(resultado.horario)) {
        throw new Error("❌ The generator did not find a valid assignment or returned an empty schedule.");
      }
      
      const nuevoHistorial = [...historialGeneraciones, resultado.horario];
      if (nuevoHistorial.length > 3) nuevoHistorial.shift(); // Limit to 3 generations
      
      localStorage.setItem("historialHorarios", JSON.stringify(nuevoHistorial));
      setHistorialGeneraciones(nuevoHistorial);
      setIndiceSeleccionado(nuevoHistorial.length - 1);
      setHorarioGeneral(resultado.horario);

      // Directly reset the edit history for the newly generated schedule
      setHistoryStack([resultado.horario]);
      setHistoryPointer(0);

    } catch (err) {
      alert("❌ Error generating schedule: " + err.message);
    } finally {
      setCargando(false);
    }
  };
  
  // MODIFICATION: Improved summary calculation for "Completion" instead of "Occupancy"
  const resumenBloques = useMemo(() => {
    if (!horarioVisible || bloquesHorario.length === 0 || grados.length === 0 || !horasCursos) {
      return { asignados: 0, totales: 0, porcentaje: 0, etiqueta: 'Completion' };
    }

    // Calculate the total required hours for the current level
    const totalHorasRequeridas = Object.values(horasCursos).reduce((total, gradosCurso) => {
        const gradoIdBase = nivel === "Primaria" ? 6 : 1;
        const numGrados = grados.length;
        let horasDelCursoEnNivel = 0;
        for (let i = 0; i < numGrados; i++) {
            const gradoId = gradoIdBase + i;
            if (gradosCurso[gradoId]) {
                horasDelCursoEnNivel += gradosCurso[gradoId];
            }
        }
        return total + horasDelCursoEnNivel;
    }, 0);

    const bloquesAsignados = horarioVisible.flat(3).filter(cursoId => cursoId > 0).length;
    
    const porcentaje = totalHorasRequeridas > 0 ? (bloquesAsignados / totalHorasRequeridas) * 100 : 0;

    return { 
        asignados: bloquesAsignados, 
        totales: totalHorasRequeridas,
        porcentaje: porcentaje.toFixed(1),
        etiqueta: 'Completion'
    };
  }, [horarioVisible, bloquesHorario, grados, nivel, horasCursos]);

  const handleUndo = () => historyPointer > 0 && setHistoryPointer(p => p - 1);
  const handleRedo = () => historyPointer < historyStack.length - 1 && setHistoryPointer(p => p + 1);

  // MODIFICATION: New handler for the version selector dropdown
  const handleVersionChange = (newIndex) => {
    const numericIndex = Number(newIndex);
    const selectedSchedule = historialGeneraciones[numericIndex];

    if (selectedSchedule) {
        setIndiceSeleccionado(numericIndex);
        // Reset the edit history to match the selected version
        setHistoryStack([selectedSchedule]);
        setHistoryPointer(0);
    }
  };

  const exportarPDF = async () => {
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
        pdf.text(`Schedule for ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][diaIndex]} - ${nivel}`, 20, 20);
    }
    pdf.save(`Horario_${nivel}.pdf`);
  };

  const exportarExcel = () => {
      const wb = XLSX.utils.book_new();
      if (!horarioVisible) {
        alert("No schedule to export.");
        return;
      }
      horarioVisible.forEach((bloquesDia, diaIndex) => {
          const sheetData = [["Time", ...grados]];
          bloquesHorario.forEach((hora, bloqueIndex) => {
              const fila = [hora];
              grados.forEach((_, gradoIndex) => {
                  const cursoId = bloquesDia?.[bloqueIndex]?.[gradoIndex] || 0;
                  const cursoNombre = cursosDesdeDB.find(c => c.id === cursoId)?.nombre || "";
                  const { nombre: docenteNombre, aula } = obtenerInfoDocente(cursoId, gradoIndex);
                  fila.push(cursoNombre ? `${cursoNombre} - ${docenteNombre} (${aula || 'N/A'})` : "");
              });
              sheetData.push(fila);
          });
          const ws = XLSX.utils.aoa_to_sheet(sheetData);
          XLSX.utils.book_append_sheet(wb, ws, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][diaIndex]);
      });
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), `Horario_${nivel}.xlsx`);
  };

  // --- COMPONENT RENDER ---
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">🧱️ Generate School Schedule - {nivel}</h2>
        <button
          onClick={generarHorario}
          disabled={cargando}
          className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded shadow-lg transition-transform transform hover:scale-105 disabled:bg-purple-300 disabled:cursor-wait"
        >
          {cargando ? "Generating..." : "🗓️ Generate New Schedule"}
        </button>
      </div>

      {cargando && <p className="text-center text-purple-600 font-semibold my-4">Generating schedule, please wait...</p>}

      {historialGeneraciones.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mt-2 mb-4 p-3 bg-gray-50 rounded-lg shadow sticky top-2 z-10 border">
          <div className="flex items-center gap-2">
            <label className="font-semibold text-sm">Version:</label>
            {/* MODIFICATION: Using the new handleVersionChange handler */}
            <select 
              className="border px-2 py-1 rounded-md text-sm" 
              value={indiceSeleccionado} 
              onChange={(e) => handleVersionChange(e.target.value)}
            >
              {historialGeneraciones.map((_, i) => (<option key={i} value={i}>Schedule #{i + 1}</option>))}
            </select>
          </div>

          <div className="flex items-center gap-2 border-l pl-4">
            <span className="font-semibold text-sm">Edit:</span>
            <button onClick={handleUndo} disabled={historyPointer <= 0} className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed" title="Undo (Ctrl+Z)">↶</button>
            <button onClick={handleRedo} disabled={historyPointer >= historyStack.length - 1} className="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed" title="Redo (Ctrl+Y)">↷</button>
          </div>

          <div className="flex items-center gap-3 border-l pl-4">
             {/* MODIFICATION: Using dynamic label from resumenBloques */}
            <span className="font-semibold text-sm">{resumenBloques.etiqueta}:</span>
            <div className="text-sm bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-full">
              {resumenBloques.asignados} / {resumenBloques.totales} ({resumenBloques.porcentaje}%)
            </div>
          </div>
          
          <div className="flex items-center gap-2 border-l pl-4 ml-auto">
            <button onClick={exportarPDF} className="bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700 transition-colors text-sm">PDF</button>
            <button onClick={exportarExcel} className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 transition-colors text-sm">Excel</button>
          </div>
        </div>
      )}

      {Array.isArray(horarioVisible) && (
        <DragDropContext onDragEnd={onDragEnd}>
          {horarioVisible.map((bloquesDia, diaIndex) => (
            <div key={diaIndex} id={`dia-${diaIndex}`} className="mb-6">
              <h4 className="text-xl font-bold mb-2 text-gray-700">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][diaIndex]}</h4>
              <div className="overflow-x-auto border shadow-md rounded-lg max-w-screen-xl mx-auto">
                <table className="w-full text-sm text-center border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border border-gray-300 px-2 py-2">Time</th>
                      {grados.map((grado) => (<th key={grado} className="border border-gray-300 px-2 py-2 font-medium">{grado}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {bloquesHorario.map((horaLabel, bloqueIndex) => (
                      <tr key={bloqueIndex} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-2 py-1 font-medium bg-gray-100">{horaLabel}</td>
                        {grados.map((_, gradoIndex) => {
                          const cursoId = bloquesDia?.[bloqueIndex]?.[gradoIndex] || 0;
                          const cursoNombre = cursosDesdeDB.find((c) => c.id === cursoId)?.nombre || "";
                          const { nombre: docenteNombre, aula } = obtenerInfoDocente(cursoId, gradoIndex);
                          const droppableId = `dia-${diaIndex}-${bloqueIndex}-${gradoIndex}`;
                          const draggableId = `${diaIndex}-${bloqueIndex}-${gradoIndex}-${cursoId}`;

                          return (
                            <td key={gradoIndex} className="border border-gray-300 p-0">
                              <Droppable droppableId={droppableId}>
                                {(provided, snapshot) => (
                                  <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-[70px] w-full h-full flex items-center justify-center transition-colors ${snapshot.isDraggingOver ? 'bg-blue-100' : ''}`}>
                                    {cursoId > 0 ? (
                                      <Draggable draggableId={draggableId} index={0}>
                                        {(provided, snapshot) => (
                                          <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onDoubleClick={() => eliminarCurso(diaIndex, bloqueIndex, gradoIndex)} className={`p-1 rounded text-xs text-center cursor-pointer w-full h-full flex flex-col justify-center shadow ${getColorPorDocente(docenteNombre)} ${snapshot.isDragging ? 'ring-2 ring-blue-500' : ''}`} title="Double click to delete">
                                            <div className="font-semibold">{cursoNombre}</div>
                                            <div className="italic text-xs">{docenteNombre} {aula && <span>({aula})</span>}</div>
                                          </div>
                                        )}
                                      </Draggable>
                                    ) : (
                                      <div onClick={() => handleCeldaVaciaClick(diaIndex, bloqueIndex, gradoIndex)} className="w-full h-full flex justify-center items-center cursor-pointer hover:bg-gray-200">
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

      {/* Missing Hours Summary Table */}
      {Array.isArray(horarioVisible) && (
        <div className="mt-8">
            <h3 className="text-xl font-bold mb-3">🕒 Missing Hours Summary</h3>
            <div className="overflow-x-auto border shadow-md rounded-lg">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="border px-4 py-2">Course</th>
                            {grados.map(g => <th key={g} className="border px-4 py-2 text-center">{g}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {cursosDesdeDB.map(curso => {
                            const gradoIdBase = nivel === "Primaria" ? 6 : 1;
                            const horasFaltantesRow = grados.map((_, gradoIndex) => {
                                const gradoId = gradoIdBase + gradoIndex;
                                const horasEsperadas = horasCursos[curso.id]?.[gradoId] || 0;
                                const horasAsignadas = contarHorasAsignadas(curso.id, gradoIndex);
                                const faltantes = horasEsperadas - horasAsignadas;
                                return { faltantes, esperadas: horasEsperadas };
                            });

                            if (horasFaltantesRow.every(h => h.esperadas === 0)) return null;

                            return (
                                <tr key={curso.id} className="hover:bg-gray-50">
                                    <td className="border px-4 py-2 font-medium">{curso.nombre}</td>
                                    {horasFaltantesRow.map((h, i) => (
                                        <td key={i} className={`border px-4 py-2 text-center ${h.faltantes > 0 ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                            {h.esperadas > 0 ? (h.faltantes > 0 ? `${h.faltantes} missing` : '✓') : '-'}
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

      {/* Modals */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Add Course to Slot</h3>
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
                    <p className="text-gray-500">No available courses for this slot.</p>
                )}
            </div>
            <div className="text-right mt-4">
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded">Close</button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl">
            <h3 className="text-lg font-bold mb-4">Confirm Deletion</h3>
            <p>Are you sure you want to remove this course from the schedule?</p>
            <div className="flex justify-end gap-4 mt-6">
                <button onClick={() => setShowConfirmModal(false)} className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded">Cancel</button>
                <button onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HorarioTable;