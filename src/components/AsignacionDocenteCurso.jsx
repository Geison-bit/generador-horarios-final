import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

const grados = ["1°", "2°", "3°", "4°", "5°"];

const AsignacionDocenteCurso = () => {
  const { docentes, setDocentes, asignaciones, setAsignaciones, horasCursos, setHorasCursos } = useDocentes();
  const [cursos, setCursos] = useState([]);
  const [nuevoCurso, setNuevoCurso] = useState("");
  const nivel = new URLSearchParams(useLocation().search).get("nivel") || "Secundaria";

  useEffect(() => {
    cargarDocentes();
    cargarCursos();
    cargarHorasCursoGrado();
    cargarAsignacionesExistentes();
  }, []);

  const cargarDocentes = async () => {
    const { data } = await supabase.from("docentes").select("id, nombre").eq("nivel", nivel);
    setDocentes(data || []);
  };

  const cargarCursos = async () => {
    const { data } = await supabase.from("cursos").select("id, nombre, nivel").eq("nivel", nivel);
    setCursos(data || []);
  };

  const cargarHorasCursoGrado = async () => {
    const { data } = await supabase.from("horas_curso_grado").select("horas, curso_id, grado_id");
    const map = {};
    data?.forEach(({ curso_id, grado_id, horas }) => {
      if (!map[curso_id]) map[curso_id] = {};
      map[curso_id][grado_id] = horas;
    });
    setHorasCursos(map);
  };

  const cargarAsignacionesExistentes = async () => {
    const { data } = await supabase.from("asignaciones").select("curso_id, grado_id, docente_id");
    const map = {};
    data?.forEach(({ curso_id, grado_id, docente_id }) => {
      if (!map[curso_id]) map[curso_id] = {};
      map[curso_id][grado_id] = { docente_id, curso_id, grado_id };
    });
    setAsignaciones(map);
  };

  const agregarCurso = async () => {
    if (!nuevoCurso.trim()) return;
    const { data } = await supabase.from("cursos").insert({ nombre: nuevoCurso, nivel }).select();
    if (data) {
      const cursoId = data[0].id;
      const nuevasHoras = grados.map((_, idx) => ({ curso_id: cursoId, grado_id: idx + 1, horas: 0 }));
      await supabase.from("horas_curso_grado").insert(nuevasHoras);
      setNuevoCurso("");
      cargarCursos();
      cargarHorasCursoGrado();
    }
  };

  const editarHoras = async (cursoId, gradoId, horas) => {
    await supabase.from("horas_curso_grado").upsert({ curso_id: cursoId, grado_id: gradoId, horas: parseInt(horas) });
    cargarHorasCursoGrado();
  };

  const handleAsignacion = (cursoId, gradoId, docenteId) => {
    setAsignaciones(prev => ({
      ...prev,
      [cursoId]: {
        ...prev[cursoId],
        [gradoId]: { docente_id: parseInt(docenteId), curso_id: parseInt(cursoId), grado_id: parseInt(gradoId) }
      }
    }));
  };

  const eliminarAsignacion = (cursoId, gradoId) => {
    setAsignaciones(prev => {
      const actualizado = { ...prev };
      delete actualizado[cursoId]?.[gradoId];
      return actualizado;
    });
  };

  const asignarATodosLosGrados = (cursoId, docenteId) => {
    setAsignaciones(prev => ({
      ...prev,
      [cursoId]: grados.reduce((acc, _, idx) => {
        acc[idx + 1] = { docente_id: parseInt(docenteId), curso_id: parseInt(cursoId), grado_id: idx + 1 };
        return acc;
      }, {})
    }));
  };

  const guardarTodo = async () => {
    const registros = [];
    for (const cursoId in asignaciones) {
      for (const gradoId in asignaciones[cursoId]) {
        const item = asignaciones[cursoId][gradoId];
        const horas = horasCursos[cursoId]?.[gradoId] || 0;
        if (item?.docente_id && horas > 0) registros.push({ ...item, horas });
      }
    }

    const registrosUnicos = Array.from(new Map(registros.map(r => [`${r.curso_id}-${r.grado_id}`, r])).values());
    const { error } = await supabase.from("asignaciones").upsert(registrosUnicos, { onConflict: ['curso_id', 'grado_id'] });
    alert(error ? "❌ Error al guardar" : "✅ Asignaciones guardadas correctamente.");
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs /> {/* ✅ Aquí insertamos el componente de navegación */}
      <h2 className="text-2xl font-semibold mb-4">Asignación de Docentes y Horas</h2>

      <div className="flex items-center mb-6 gap-2">
        <input
          type="text"
          value={nuevoCurso}
          onChange={(e) => setNuevoCurso(e.target.value)}
          placeholder="Nombre del curso"
          className="border px-3 py-2 rounded w-64"
        />
        <button onClick={agregarCurso} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          Agregar
        </button>
      </div>

      <h3 className="text-lg font-bold mb-2">Horas programadas por curso y grado</h3>
      <table className="table-auto w-full border mb-8">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Curso</th>
            {grados.map((g, idx) => <th key={idx} className="border px-2 py-1 text-center">{g}</th>)}
            <th className="border px-2 py-1 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {cursos.map((curso) => (
            <tr key={curso.id}>
              <td className="border px-2 py-1">{curso.nombre}</td>
              {grados.map((_, idx) => (
                <td key={idx} className="border px-2 py-1 text-center">
                  <input
                    type="number"
                    min="0"
                    value={horasCursos[curso.id]?.[idx + 1] || 0}
                    onChange={(e) => editarHoras(curso.id, idx + 1, e.target.value)}
                    className="w-14 px-1 text-center border rounded"
                  />
                </td>
              ))}
              <td className="border px-2 py-1 text-center">
                <button onClick={() => eliminarCurso(curso.id)} className="text-red-600 hover:underline">Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-lg font-bold mb-2">Asignar docentes a cada curso y grado</h3>
      <table className="table-auto w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Curso</th>
            {grados.map((g, idx) => <th key={idx} className="border px-2 py-1 text-center">{g}</th>)}
            <th className="border px-2 py-1 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {cursos.map((curso) => (
            <tr key={curso.id}>
              <td className="border px-2 py-1">{curso.nombre}</td>
              {grados.map((_, idx) => (
                <td key={idx} className="border px-2 py-1">
                  <select
                    value={asignaciones[curso.id]?.[idx + 1]?.docente_id || ""}
                    onChange={(e) => handleAsignacion(curso.id, idx + 1, e.target.value)}
                    className="border px-2 py-1 w-full bg-blue-100"
                  >
                    <option value="">-- Asignar --</option>
                    {docentes.map((docente) => (
                      <option key={docente.id} value={docente.id}>{docente.nombre}</option>
                    ))}
                  </select>
                  {asignaciones[curso.id]?.[idx + 1] && (
                    <button
                      onClick={() => eliminarAsignacion(curso.id, idx + 1)}
                      className="text-sm text-red-600 ml-1 hover:underline"
                    >Eliminar</button>
                  )}
                </td>
              ))}
              <td className="border px-2 py-1 text-center">
                <button
                  onClick={() => {
                    const primerGrado = 1;
                    const docenteId = asignaciones[curso.id]?.[primerGrado]?.docente_id;
                    if (docenteId) asignarATodosLosGrados(curso.id, docenteId);
                    else alert("Primero asigna al menos un grado.");
                  }}
                  className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                >
                  Asignar a todos
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mt-6">
        <button onClick={guardarTodo} className="bg-blue-700 text-white px-6 py-2 rounded hover:bg-blue-800">
          Guardar todo
        </button>
      </div>
    </div>
  );
};

export default AsignacionDocenteCurso;