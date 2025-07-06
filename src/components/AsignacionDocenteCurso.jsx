import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

const grados = ["1°", "2°", "3°", "4°", "5°"];

const AsignacionDocenteCurso = () => {
  const {
    docentes,
    setDocentes,
    asignaciones,
    setAsignaciones,
    horasCursos,
    setHorasCursos,
  } = useDocentes();

  const [docentesEspecializados, setDocentesEspecializados] = useState({});
  const [cursos, setCursos] = useState([]);
  const [nuevoCurso, setNuevoCurso] = useState("");
  const [bloquesUsados, setBloquesUsados] = useState(0);
  const [limiteBloques, setLimiteBloques] = useState(200); // Estado para el límite, con valor inicial
  const nivel = new URLSearchParams(useLocation().search).get("nivel") || "Secundaria";

  useEffect(() => {
    cargarDocentes();
    cargarDocentesConEspecialidad();
    cargarCursos();
    cargarHorasCursoGrado();
    cargarAsignacionesExistentes();
    cargarLimiteBloques(); // Cargar el límite dinámico
  }, []);

  useEffect(() => {
    let total = 0;
    for (const curso of cursos) {
      const cursoId = curso.id;
      if (horasCursos[cursoId]) {
        for (const gradoId in horasCursos[cursoId]) {
          total += horasCursos[cursoId][gradoId];
        }
      }
    }
    setBloquesUsados(total);
  }, [horasCursos, cursos]);

  // Nueva función para cargar el límite de bloques dinámicamente
  const cargarLimiteBloques = async () => {
    const { data } = await supabase.from("franjas_horarias").select("bloque").eq("nivel", nivel);
    const bloquesPorDia = data?.length || 8; // Si no hay datos, asume 8 por defecto
    setLimiteBloques(bloquesPorDia * 5 * grados.length);
  };

  const cargarDocentes = async () => {
    const { data } = await supabase
      .from("docentes")
      .select("id, nombre, jornada_total")
      .eq("nivel", nivel);
    setDocentes(data || []);
  };

  const [resumenHoras, setResumenHoras] = useState({});
  useEffect(() => {
    const contador = {};
    for (const cursoId in asignaciones) {
      for (const gradoId in asignaciones[cursoId]) {
        const { docente_id } = asignaciones[cursoId][gradoId];
        const horas = horasCursos[cursoId]?.[gradoId] || 0;
        if (!contador[docente_id]) contador[docente_id] = 0;
        contador[docente_id] += horas;
      }
    }
    setResumenHoras(contador);
  }, [asignaciones, horasCursos]);

  const cargarDocentesConEspecialidad = async () => {
    const { data } = await supabase
      .from("docentes")
      .select("id, nombre, docente_curso(curso_id)")
      .eq("nivel", nivel);
    const mapa = {};
    for (const d of data || []) {
      mapa[d.id] = {
        nombre: d.nombre,
        cursos: d.docente_curso.map((dc) => dc.curso_id),
      };
    }
    setDocentesEspecializados(mapa);
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
      const nuevasHoras = grados.map((_, idx) => ({
        curso_id: cursoId,
        grado_id: idx + 1,
        horas: 0,
      }));
      await supabase.from("horas_curso_grado").insert(nuevasHoras);
      setNuevoCurso("");
      cargarCursos();
      cargarHorasCursoGrado();
    }
  };

  const editarHoras = async (cursoId, gradoId, nuevaHora) => {
    const horaAnterior = horasCursos[cursoId]?.[gradoId] || 0;
    const nuevaHoraInt = parseInt(nuevaHora || 0);
    const bloquesActualizados = bloquesUsados - horaAnterior + nuevaHoraInt;

    if (bloquesActualizados > limiteBloques) { // Usa el estado dinámico
      alert(`⚠️ No puedes exceder los ${limiteBloques} bloques totales disponibles.`);
      return;
    }

    await supabase
      .from("horas_curso_grado")
      .upsert({ curso_id: cursoId, grado_id: gradoId, horas: nuevaHoraInt });
    cargarHorasCursoGrado();
  };

  const eliminarCurso = async (cursoId) => {
    const confirmar = window.confirm("¿Deseas eliminar este curso y todas sus asignaciones?");
    if (!confirmar) return;
    await supabase.from("horas_curso_grado").delete().eq("curso_id", cursoId);
    await supabase.from("asignaciones").delete().eq("curso_id", cursoId);
    await supabase.from("cursos").delete().eq("id", cursoId);
    cargarCursos();
    cargarHorasCursoGrado();
    cargarAsignacionesExistentes();
  };

  const handleAsignacion = (cursoId, gradoId, docenteId) => {
    const nuevaHora = horasCursos[cursoId]?.[gradoId] || 0;
    const nuevoId = parseInt(docenteId);
    const actual = asignaciones[cursoId]?.[gradoId];
    const anteriorId = actual?.docente_id;
    let horasActuales = 0;

    for (const cId in asignaciones) {
      for (const gId in asignaciones[cId]) {
        const asignacion = asignaciones[cId][gId];
        if (asignacion.docente_id === nuevoId && !(cId == cursoId && gId == gradoId)) {
          horasActuales += horasCursos[cId]?.[gId] || 0;
        }
      }
    }

    const horasPrevias = (anteriorId === nuevoId) ? nuevaHora : 0;
    const nuevasHorasAsignadas = horasActuales - horasPrevias + nuevaHora;
    const docente = docentes.find((d) => d.id === nuevoId);
    const jornada = docente?.jornada_total || 0;

    if (nuevasHorasAsignadas > jornada) {
      alert(`❌ ${docente?.nombre || "El docente"} ya tiene asignadas ${horasActuales} horas y su jornada es de ${jornada}. No se puede asignar más.`);
      return;
    }

    setAsignaciones((prev) => ({
      ...prev,
      [cursoId]: {
        ...prev[cursoId],
        [gradoId]: {
          docente_id: nuevoId,
          curso_id: parseInt(cursoId),
          grado_id: parseInt(gradoId),
        },
      },
    }));
  };

  const eliminarAsignacion = async (cursoId, gradoId) => {
    setAsignaciones((prev) => {
      const actualizado = { ...prev };
      if (actualizado[cursoId]) {
        delete actualizado[cursoId][gradoId];
        if (Object.keys(actualizado[cursoId]).length === 0) {
          delete actualizado[cursoId];
        }
      }
      return actualizado;
    });

    await supabase
      .from("asignaciones")
      .delete()
      .eq("curso_id", cursoId)
      .eq("grado_id", gradoId);
  };

  const asignarATodosLosGrados = (cursoId, docenteId) => {
    setAsignaciones((prev) => ({
      ...prev,
      [cursoId]: grados.reduce((acc, _, idx) => {
        acc[idx + 1] = { docente_id: parseInt(docenteId), curso_id: parseInt(cursoId), grado_id: idx + 1 };
        return acc;
      }, {}),
    }));
  };

const guardarTodo = async () => {
  const registros = [];
  const horasPorDocente = {};

  // Validar asignaciones
  for (const cursoId in asignaciones) {
    for (const gradoId in asignaciones[cursoId]) {
      const item = asignaciones[cursoId][gradoId];
      const horas = horasCursos[cursoId]?.[gradoId] || 0;

      if (!item?.docente_id || isNaN(horas) || horas <= 0) continue;

      registros.push({
        curso_id: parseInt(cursoId),
        grado_id: parseInt(gradoId),
        docente_id: parseInt(item.docente_id),
        horas,
      });

      if (!horasPorDocente[item.docente_id]) horasPorDocente[item.docente_id] = 0;
      horasPorDocente[item.docente_id] += horas;
    }
  }

  // Validar jornada docente
  const { data: docentesConHoras, error: errorDocentes } = await supabase
    .from("docentes")
    .select("id, jornada_total")
    .eq("nivel", nivel);

  if (errorDocentes) {
    alert("❌ Error al verificar jornada de docentes.");
    return;
  }

  for (const docenteId in horasPorDocente) {
    const docente = docentesConHoras.find((d) => d.id === parseInt(docenteId));
    const disponible = docente?.jornada_total || 0;
    const asignadas = horasPorDocente[docenteId];

    if (asignadas > disponible) {
      alert(`❌ El docente con ID ${docenteId} tiene asignadas ${asignadas} horas, pero su jornada es de ${disponible}.`);
      return;
    }
  }

  // Generar registros de horas válidos
  const registrosHoras = [];
for (const cursoId in horasCursos) {
  for (const gradoId in horasCursos[cursoId]) {
    const valor = horasCursos[cursoId][gradoId];

    const horas = parseInt(valor);
    if (isNaN(horas) || horas <= 0) continue;

    registrosHoras.push({
      curso_id: parseInt(cursoId),
      grado_id: parseInt(gradoId),
      horas: horas,
    });
  }
}
console.log("🟢 Enviando a horas_curso_grado:", registrosHoras); 
const { error: errorHoras } = await supabase
  .from("horas_curso_grado")
  .upsert(registrosHoras, { onConflict: ["curso_id", "grado_id"] });

  if (errorHoras) {
  console.error("❌ Error al guardar horas:", errorHoras.message);
}

  // Guardar asignaciones sin duplicados
  const registrosUnicos = Array.from(new Map(registros.map((r) => [`${r.curso_id}-${r.grado_id}`, r])).values());

  const { error } = await supabase
    .from("asignaciones")
    .upsert(registrosUnicos, { onConflict: ["curso_id", "grado_id"] });

  alert(error ? "❌ Error al guardar asignaciones." : "✅ Todo guardado correctamente.");
};



  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-2xl font-semibold mb-4">Asignación de Docentes y Horas</h2>

      <div className="flex items-center mb-6 gap-2">
        <input
          type="text"
          value={nuevoCurso}
          onChange={(e) => {
            const valor = e.target.value;
            const esValido = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]{0,30}$/.test(valor);
            if (esValido || valor === "") {
              setNuevoCurso(valor);
            }
          }}
          placeholder="Nombre del curso"
          className="border px-3 py-2 rounded w-64"
        />
        <button onClick={agregarCurso} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          Agregar
        </button>
        <span className={`ml-4 font-semibold ${bloquesUsados > limiteBloques ? "text-red-600" : "text-gray-800"}`}>
          Bloques usados: {bloquesUsados} / {limiteBloques}
        </span>
      </div>

      <h3 className="text-lg font-bold mb-2">Horas programadas por curso y grado</h3>
      <table className="table-auto w-full border mb-8">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Curso</th>
            {grados.map((g, idx) => (
              <th key={idx} className="border px-2 py-1 text-center">{g}</th>
            ))}
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
                    min="2"
                    max="7"
                    value={horasCursos[curso.id]?.[idx + 1] || ""}
                    onChange={(e) => {
                      const nuevaHora = parseInt(e.target.value);
                      if (nuevaHora >= 2 && nuevaHora <= 7) {
                        editarHoras(curso.id, idx + 1, nuevaHora);
                      } else if (e.target.value === "") {
                        editarHoras(curso.id, idx + 1, 0);
                      } else {
                        alert("⚠️ Las horas deben estar entre 2 y 7.");
                      }
                    }}
                    className="w-14 px-1 text-center border rounded"
                  />
                </td>
              ))}
              <td className="border px-2 py-1 text-center">
                <button onClick={() => eliminarCurso(curso.id)} className="text-red-600 hover:underline">
                  Eliminar
                </button>
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
            {grados.map((g, idx) => (
              <th key={idx} className="border px-2 py-1 text-center">{g}</th>
            ))}
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
                    {Object.entries(docentesEspecializados).map(([id, info]) =>
                      info.cursos.includes(curso.id) ? (
                        <option key={id} value={id}>{info.nombre}</option>
                      ) : null
                    )}
                  </select>
                  {asignaciones[curso.id]?.[idx + 1] && (
                    <button
                      onClick={() => eliminarAsignacion(curso.id, idx + 1)}
                      className="text-sm text-red-600 ml-1 hover:underline"
                    >
                      Eliminar
                    </button>
                  )}
                </td>
              ))}
              <td className="border px-2 py-1 text-center">
                <button
                  onClick={() => {
                    const primerGrado = 1;
                    const docenteId = asignaciones[curso.id]?.[primerGrado]?.docente_id;
                    if (docenteId) {
                      asignarATodosLosGrados(curso.id, docenteId);
                    } else {
                      alert("Primero asigna al menos un grado.");
                    }
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

      <h3 className="text-lg font-bold mt-10 mb-2">Resumen de horas asignadas por docente</h3>
      <table className="table-auto border w-full max-w-xl bg-white shadow mt-2">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-4 py-2">Docente</th>
            <th className="border px-4 py-2 text-center">Horas asignadas</th>
            <th className="border px-4 py-2 text-center">Horas faltantes</th>
          </tr>
        </thead>
        <tbody>
          {docentes
            .filter((d) => d.nivel === nivel)
            .map((docente) => {
              const asignadas = resumenHoras[docente.id] || 0;
              const faltantes = Math.max(docente.jornada_total - asignadas, 0);
              return (
                <tr key={docente.id}>
                  <td className="border px-4 py-2">{docente.nombre}</td>
                  <td className="border px-4 py-2 text-center">{asignadas}</td>
                  <td className={`border px-4 py-2 text-center ${faltantes > 0 ? 'text-red-600 font-semibold' : ''}`}>
                    {faltantes}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AsignacionDocenteCurso;