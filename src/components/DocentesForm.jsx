import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs"; // ✅ Importado

const DocentesForm = () => {
  const [nombre, setNombre] = useState("");
  const [jornada, setJornada] = useState("");
  const [aulaId, setAulaId] = useState("");
  const [aulas, setAulas] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [docenteEditandoId, setDocenteEditandoId] = useState(null);

  // Obtener nivel desde la URL
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivelURL = params.get("nivel") || "Secundaria";

  useEffect(() => {
    cargarDocentes();
    cargarAulas();
  }, [nivelURL]);

  const cargarDocentes = async () => {
    const { data } = await supabase
      .from("docentes")
      .select("*, aulas(nombre)")
      .eq("nivel", nivelURL)
      .order("id");
    setDocentes(data || []);
  };

  const cargarAulas = async () => {
    const { data } = await supabase.from("aulas").select();
    setAulas(data || []);
  };

  const aulasOcupadas = docentes.map((d) => d.aula_id);

  const agregarDocente = async () => {
    if (!nombre || !jornada || !aulaId) return;

    const payload = {
      nombre,
      jornada_total: parseInt(jornada),
      aula_id: parseInt(aulaId),
      nivel: nivelURL // Agregamos nivel para registrar correctamente
    };

    if (modoEdicion && docenteEditandoId) {
      await supabase.from("docentes").update(payload).eq("id", docenteEditandoId);
    } else {
      await supabase.from("docentes").insert(payload);
    }

    setNombre("");
    setJornada("");
    setAulaId("");
    setModoEdicion(false);
    setDocenteEditandoId(null);
    cargarDocentes();
  };

  const eliminarDocente = async (id) => {
    await supabase.from("docentes").delete().eq("id", id);
    cargarDocentes();
  };

  const editarDocente = (docente) => {
    setNombre(docente.nombre);
    setJornada(docente.jornada_total.toString());
    setAulaId(docente.aula_id.toString());
    setModoEdicion(true);
    setDocenteEditandoId(docente.id);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Breadcrumbs /> {/* ✅ Aquí insertamos el componente de navegación */}
      <h2 className="text-2xl font-bold mb-4">Registrar Docente - {nivelURL}</h2>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Nombre del docente"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="flex-1 border px-4 py-2 rounded"
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
              disabled={
                aulaId !== a.id.toString() && aulasOcupadas.includes(a.id)
              }
            >
              {a.nombre}
            </option>
          ))}
        </select>
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
            <th className="border px-4 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {docentes.map((d) => (
            <tr key={d.id}>
              <td className="border px-4 py-2">{d.nombre}</td>
              <td className="border px-4 py-2">{d.jornada_total}</td>
              <td className="border px-4 py-2">{d.aulas?.nombre || ""}</td>
              <td className="border px-2 py-2">
                <div className="flex justify-center gap-2 w-full">
                  <button
                    onClick={() => editarDocente(d)}
                    className="flex-1 text-blue-600 hover:underline text-sm"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => eliminarDocente(d.id)}
                    className="flex-1 text-red-600 hover:underline text-sm"
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
