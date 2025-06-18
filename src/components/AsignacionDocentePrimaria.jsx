import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import Breadcrumbs from "../components/Breadcrumbs";

const gradosPrimaria = ["1°", "2°", "3°", "4°", "5°", "6°"];

const AsignacionDocentePrimaria = () => {
  const { docentes, setDocentes } = useDocentes();
  const [cursos, setCursos] = useState([]);
  const [horasCursos, setHorasCursos] = useState({});
  const [nuevoCurso, setNuevoCurso] = useState("");
  const [asignaciones, setAsignaciones] = useState({});
  const [bloquesUsados, setBloquesUsados] = useState(0);
  const [franjas, setFranjas] = useState([]);
  const nivel = "Primaria";

  useEffect(() => {
    cargarDocentes();
    cargarCursos();
    cargarHorasCursoGrado();
    cargarAsignacionesExistentes();
    cargarFranjasHorarias(); // 👈 nuevo
  }, []);

  useEffect(() => {
    let total = 0;
    for (const cursoId in horasCursos) {
      for (const gradoId in horasCursos[cursoId]) {
        total += horasCursos[cursoId][gradoId];
      }
    }
    setBloquesUsados(total);
  }, [horasCursos]);

  const cargarDocentes = async () => {
    const { data } = await supabase.from("docentes").select("id, nombre").eq("nivel", nivel);
    setDocentes(data || []);
  };

  const cargarCursos = async () => {
    const { data } = await supabase.from("cursos").select("id, nombre").eq("nivel", nivel);
    setCursos(data || []);
  };

  const cargarHorasCursoGrado = async () => {
    const { data } = await supabase.from("horas_curso_grado").select("*").eq("nivel", nivel);
    const map = {};
    data?.forEach(({ curso_id, grado_id, horas }) => {
      if (!map[curso_id]) map[curso_id] = {};
      map[curso_id][grado_id] = horas;
    });
    setHorasCursos(map);
  };

  const cargarFranjasHorarias = async () => {
    const { data } = await supabase
      .from("franjas_horarias")
      .select("*")
      .eq("nivel", nivel);
    setFranjas(data || []);
  };

  const cargarAsignacionesExistentes = async () => {
    const { data } = await supabase.from("asignaciones").select("*").eq("nivel", nivel);
    const map = {};
    data?.forEach(({ grado_id, docente_id }) => {
      map[grado_id] = docente_id;
    });
    setAsignaciones(map);
  };

  const editarHoras = async (cursoId, gradoId, horas) => {
    await supabase.from("horas_curso_grado").upsert({
      curso_id: cursoId,
      grado_id: gradoId,
      horas: parseInt(horas),
      nivel
    }, {
      onConflict: ["curso_id", "grado_id", "nivel"]
    });
    cargarHorasCursoGrado();
  };

  const eliminarCurso = async (cursoId) => {
    await supabase.from("cursos").delete().eq("id", cursoId);
    await supabase.from("horas_curso_grado").delete().eq("curso_id", cursoId);
    cargarCursos();
    cargarHorasCursoGrado();
  };

  const agregarCurso = async () => {
    if (!nuevoCurso.trim()) return;
    const { data } = await supabase.from("cursos").insert({ nombre: nuevoCurso, nivel }).select();
    if (data) {
      const cursoId = data[0].id;
      const nuevasHoras = gradosPrimaria.map((_, idx) => ({
        curso_id: cursoId,
        grado_id: idx + 6,
        horas: 0,
        nivel
      }));
      await supabase.from("horas_curso_grado").insert(nuevasHoras);
      setNuevoCurso("");
      cargarCursos();
      cargarHorasCursoGrado();
    }
  };

  const guardarTodo = async () => {
    const registros = [];

    for (const curso of cursos) {
      for (let i = 0; i < gradosPrimaria.length; i++) {
        const grado_id = i + 6;
        const docente_id = asignaciones[grado_id];
        const horas = horasCursos[curso.id]?.[grado_id] || 0;
        if (docente_id && horas > 0) {
          registros.push({
            curso_id: curso.id,
            grado_id,
            docente_id,
            horas,
            nivel,
          });
        }
      }
    }

    const { error } = await supabase.from("asignaciones").upsert(registros, {
      onConflict: ['curso_id', 'grado_id', 'nivel']
    });

    alert(error ? "❌ Error al guardar" : "✅ Asignaciones guardadas correctamente.");
  };

  // Límite dinámico según bloques x 5 días x 6 grados
  const limiteBloquesCalculado = franjas.length * 5 * gradosPrimaria.length;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-2xl font-semibold mb-4">Asignación de Docentes y Horas - Primaria</h2>

      <div className="flex items-center mb-6 gap-4">
        <input
          type="text"
          value={nuevoCurso}
          onChange={(e) => {
            const valor = e.target.value;
            if (/^[a-zA-ZáéíóúÁÉÍÓÚñÑ ]{0,30}$/.test(valor)) {
              setNuevoCurso(valor);
            }
          }}
          placeholder="Nombre del curso"
          maxLength={30}
          className="border px-3 py-2 rounded w-64"
        />
        <button onClick={agregarCurso} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          Agregar
        </button>
        <span className={`ml-2 font-semibold ${bloquesUsados > limiteBloquesCalculado ? "text-red-600" : "text-gray-800"}`}>
          Bloques usados: {bloquesUsados} / {limiteBloquesCalculado}
        </span>
      </div>

      <h3 className="text-lg font-bold mb-2">Horas programadas por curso y grado</h3>
      <table className="table-auto w-full border mb-8">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Curso</th>
            {gradosPrimaria.map((g, idx) => <th key={idx} className="border px-2 py-1 text-center">{g}</th>)}
            <th className="border px-2 py-1 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {cursos.map((curso) => (
            <tr key={curso.id}>
              <td className="border px-2 py-1">{curso.nombre}</td>
              {gradosPrimaria.map((_, idx) => (
                <td key={idx} className="border px-2 py-1 text-center">
                  <input
                    type="number"
                    min="0"
                    value={horasCursos[curso.id]?.[idx + 6] || 0}
                    onChange={(e) => editarHoras(curso.id, idx + 6, e.target.value)}
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

      <h3 className="text-lg font-bold mb-2">Asignar un docente a cada grado</h3>
      <table className="table-auto w-full border mb-6">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Grado</th>
            <th className="border px-2 py-1 text-center">Docente</th>
          </tr>
        </thead>
        <tbody>
          {gradosPrimaria.map((grado, idx) => {
            const gradoId = idx + 6;
            return (
              <tr key={gradoId}>
                <td className="border px-2 py-1">{grado}</td>
                <td className="border px-2 py-1 text-center">
                  <select
                    value={asignaciones[gradoId] || ""}
                    onChange={(e) =>
                      setAsignaciones((prev) => ({
                        ...prev,
                        [gradoId]: parseInt(e.target.value),
                      }))
                    }
                    className="border px-2 py-1 w-full bg-blue-100"
                  >
                    <option value="">-- Seleccionar Docente --</option>
                    {docentes.map((docente) => (
                      <option key={docente.id} value={docente.id}>{docente.nombre}</option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
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

export default AsignacionDocentePrimaria;
