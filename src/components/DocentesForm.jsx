import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

const DocentesForm = () => {
  const [nombre, setNombre] = useState("");
  const [jornada, setJornada] = useState("");
  const [aulaId, setAulaId] = useState("");
  const [cursosSeleccionados, setCursosSeleccionados] = useState([]);

  const [aulas, setAulas] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [cursos, setCursos] = useState([]);

  const [modoEdicion, setModoEdicion] = useState(false);
  const [docenteEditandoId, setDocenteEditandoId] = useState(null);

  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivelURL = params.get("nivel") || "Secundaria";

  useEffect(() => {
    cargarDocentes();
    cargarAulas();
    cargarCursos();
  }, [nivelURL]);

  useEffect(() => {
    const manejarClickFuera = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMostrarDropdown(false);
      }
    };
    document.addEventListener("mousedown", manejarClickFuera);
    return () => document.removeEventListener("mousedown", manejarClickFuera);
  }, []);

  const cargarDocentes = async () => {
    const { data } = await supabase
      .from("docentes")
      .select("*, aulas(nombre), docente_curso:docente_curso(curso_id, cursos(nombre))")
      .eq("nivel", nivelURL)
      .order("id");
    setDocentes(data || []);
  };

  const cargarAulas = async () => {
  const { data } = await supabase.from("aulas").select().eq("nivel", nivelURL);
  setAulas(data || []);
};

  const cargarCursos = async () => {
    const { data } = await supabase.from("cursos").select("id, nombre").eq("nivel", nivelURL);
    setCursos(data || []);
  };

  const aulasOcupadas = docentes.map((d) => d.aula_id);

  const toggleCursoSeleccionado = (id) => {
    setCursosSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const agregarDocente = async () => {
    if (!nombre || !jornada || !aulaId || cursosSeleccionados.length === 0) {
      alert("Completa todos los campos y selecciona al menos una especialidad.");
      return;
    }

    const payload = {
      nombre,
      jornada_total: parseInt(jornada),
      aula_id: parseInt(aulaId),
      nivel: nivelURL,
    };

    let docenteId = null;

    if (modoEdicion && docenteEditandoId) {
      await supabase.from("docentes").update(payload).eq("id", docenteEditandoId);
      docenteId = docenteEditandoId;
      await supabase.from("docente_curso").delete().eq("docente_id", docenteId);
    } else {
      const { data } = await supabase.from("docentes").insert(payload).select();
      if (data && data.length > 0) docenteId = data[0].id;
    }

    if (docenteId) {
      const registros = cursosSeleccionados.map((cid) => ({
        docente_id: docenteId,
        curso_id: cid,
        nivel: nivelURL,
      }));
      await supabase.from("docente_curso").insert(registros);
    }

    setNombre("");
    setJornada("");
    setAulaId("");
    setCursosSeleccionados([]);
    setModoEdicion(false);
    setDocenteEditandoId(null);
    cargarDocentes();
  };

  const eliminarDocente = async (id) => {
    const confirmar = window.confirm("¿Estás seguro de que deseas eliminar este docente?");
    if (!confirmar) return;

    const { error } = await supabase.from("docentes").delete().eq("id", id);
    if (!error) cargarDocentes();
  };

  const editarDocente = (docente) => {
    setNombre(docente.nombre);
    setJornada(docente.jornada_total.toString());
    setAulaId(docente.aula_id.toString());
    setCursosSeleccionados(docente.docente_curso?.map((dc) => dc.curso_id) || []);
    setModoEdicion(true);
    setDocenteEditandoId(docente.id);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-2xl font-bold mb-4">Registrar Docente - {nivelURL}</h2>

      <div className="flex flex-wrap gap-2 mb-4 items-start">
        <input
          type="text"
          placeholder="Nombre del docente"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="border px-4 py-2 rounded"
        />
        <input
          type="number"
          placeholder="Horas"
          value={jornada}
          onChange={(e) => setJornada(e.target.value)}
          className="w-24 border px-2 py-2 rounded"
        />
        <select
          value={aulaId}
          onChange={(e) => setAulaId(e.target.value)}
          className="border px-3 py-2 rounded"
        >
          <option value="">Seleccione un aula</option>
          {aulas.map((a) => (
            <option
              key={a.id}
              value={a.id}
              disabled={aulaId !== a.id.toString() && aulasOcupadas.includes(a.id)}
            >
              {a.nombre}
            </option>
          ))}
        </select>

        {/* Dropdown personalizado */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setMostrarDropdown(!mostrarDropdown)}
            className="border px-4 py-2 rounded bg-white w-48 text-left"
          >
            {cursosSeleccionados.length > 0
              ? cursos.filter((c) => cursosSeleccionados.includes(c.id)).map((c) => c.nombre).join(", ")
              : "Especialidad de cursos"}
          </button>

          {mostrarDropdown && (
            <div className="absolute z-10 mt-1 max-h-52 overflow-auto border bg-white rounded shadow w-48">
              {cursos.map((curso) => (
                <label key={curso.id} className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={cursosSeleccionados.includes(curso.id)}
                    onChange={() => toggleCursoSeleccionado(curso.id)}
                  />
                  {curso.nombre}
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={agregarDocente}
          className={`${
            modoEdicion ? "bg-yellow-600" : "bg-blue-600"
          } text-white px-4 py-2 rounded`}
        >
          {modoEdicion ? "Guardar Cambios" : "Agregar"}
        </button>
      </div>

      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-4 py-2">Nombre</th>
            <th className="border px-4 py-2">Horas</th>
            <th className="border px-4 py-2">Aula</th>
            <th className="border px-4 py-2">Especialidades</th>
            <th className="border px-4 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {docentes.map((d) => (
            <tr key={d.id}>
              <td className="border px-4 py-2">{d.nombre}</td>
              <td className="border px-4 py-2">{d.jornada_total}</td>
              <td className="border px-4 py-2">{d.aulas?.nombre || ""}</td>
              <td className="border px-4 py-2 whitespace-pre-wrap text-sm">
                {(d.docente_curso || []).map((dc) => dc.cursos?.nombre).join("\n")}
              </td>
              <td className="border px-2 py-2">
                <div className="flex justify-center gap-2 w-full">
                  <button
                    onClick={() => editarDocente(d)}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => eliminarDocente(d.id)}
                    className="text-red-600 hover:underline text-sm"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DocentesForm;
