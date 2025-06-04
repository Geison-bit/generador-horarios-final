import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

const AulasForm = () => {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
  const [piso, setPiso] = useState("");
  const [aulas, setAulas] = useState([]);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [aulaEditandoId, setAulaEditandoId] = useState(null);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivel = params.get("nivel") || "Secundaria";

  useEffect(() => {
    cargarAulas();
  }, [nivel]);

  const cargarAulas = async () => {
    const { data } = await supabase
      .from("aulas")
      .select()
      .eq("nivel", nivel)
      .order("id");
    setAulas(data || []);
  };

  const agregarAula = async () => {
    if (!nombre || !tipo || !piso) return;

    const payload = {
      nombre,
      tipo,
      piso,
      nivel,
    };

    if (modoEdicion && aulaEditandoId) {
      await supabase.from("aulas").update(payload).eq("id", aulaEditandoId);
    } else {
      await supabase.from("aulas").insert(payload);
    }

    setNombre("");
    setTipo("");
    setPiso("");
    setModoEdicion(false);
    setAulaEditandoId(null);
    cargarAulas();
  };

  const editarAula = (aula) => {
    setNombre(aula.nombre);
    setTipo(aula.tipo);
    setPiso(aula.piso);
    setModoEdicion(true);
    setAulaEditandoId(aula.id);
  };

  const eliminarAula = async (id) => {
    const confirmar = window.confirm("¿Estás seguro de que deseas eliminar esta aula?");
    if (!confirmar) return;

    const { error } = await supabase.from("aulas").delete().eq("id", id);
    if (error) {
      console.error("Error al eliminar:", error.message);
      alert("No se pudo eliminar el aula. Revisa si está en uso.");
    } else {
      cargarAulas();
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-2xl font-bold mb-4">Registrar Aula - {nivel}</h2>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Nombre del aula"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="border px-4 py-2 rounded"
        />

        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="border px-4 py-2 rounded"
        >
          <option value="">Seleccione tipo de aula</option>
          <option value="Teórica">Teórica</option>
          <option value="Laboratorio">Laboratorio</option>
          <option value="Cómputo">Cómputo</option>
        </select>

        <select
          value={piso}
          onChange={(e) => setPiso(e.target.value)}
          className="border px-4 py-2 rounded"
        >
          <option value="">Seleccione piso</option>
          <option value="Piso 1">Piso 1</option>
          <option value="Piso 2">Piso 2</option>
          <option value="Piso 3">Piso 3</option>
        </select>

        <button
          onClick={agregarAula}
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
            <th className="border px-4 py-2">Tipo</th>
            <th className="border px-4 py-2">Piso</th>
            <th className="border px-4 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {aulas.map((aula) => (
            <tr key={aula.id}>
              <td className="border px-4 py-2">{aula.nombre}</td>
              <td className="border px-4 py-2">{aula.tipo}</td>
              <td className="border px-4 py-2">{aula.piso}</td>
              <td className="border px-4 py-2">
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => editarAula(aula)}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => eliminarAula(aula.id)}
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

export default AulasForm;
