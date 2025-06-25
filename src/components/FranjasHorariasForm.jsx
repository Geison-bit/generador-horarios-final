import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

const sumarMinutos = (horaStr, minutos) => {
  const [h, m] = horaStr.split(":").map(Number);
  const fecha = new Date();
  fecha.setHours(h, m + minutos, 0);
  return fecha.toTimeString().slice(0, 5);
};

const FranjasHorariasForm = () => {
  const [bloques, setBloques] = useState([]);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivel = params.get("nivel") || "Secundaria";

  useEffect(() => {
    cargarBloquesDesdeDB();
  }, [nivel]);

  const cargarBloquesDesdeDB = async () => {
    const { data, error } = await supabase
      .from("franjas_horarias")
      .select("bloque, hora_inicio, hora_fin")
      .eq("nivel", nivel)
      .order("bloque");

    if (!error && data.length > 0) {
      setBloques(data.map(b => ({ inicio: b.hora_inicio, fin: b.hora_fin })));
    } else {
      // Si no hay datos, cargar por defecto
      const bloquesIniciales = [];
      let inicio = "07:15";
      for (let i = 0; i < 8; i++) {
        const fin = sumarMinutos(inicio, 45);
        bloquesIniciales.push({ inicio, fin });
        inicio = fin;
      }
      setBloques(bloquesIniciales);
    }
  };

  const actualizarBloque = (index, campo, valor) => {
    const nuevos = [...bloques];
    nuevos[index][campo] = valor;

    // si se actualiza hora de inicio, recalcular hora de fin
    if (campo === "inicio") {
      nuevos[index].fin = sumarMinutos(valor, 45);
    }

    setBloques(nuevos);
  };

  const agregarBloque = () => {
    if (bloques.length >= 9) return;
    const ultima = bloques[bloques.length - 1];
    const nuevoInicio = ultima.fin;
    const nuevoFin = sumarMinutos(nuevoInicio, 45);
    setBloques([...bloques, { inicio: nuevoInicio, fin: nuevoFin }]);
  };

  const eliminarBloque = (index) => {
    const nuevos = bloques.filter((_, i) => i !== index);
    setBloques(nuevos);
  };

  const guardarConfiguracion = async () => {
    await supabase.from("franjas_horarias").delete().eq("nivel", nivel);

    const nuevaConfiguracion = bloques.map((b, index) => ({
      bloque: index + 1,
      hora_inicio: b.inicio,
      hora_fin: b.fin,
      nivel: nivel,
    }));

    const { error } = await supabase.from("franjas_horarias").insert(nuevaConfiguracion);

    if (error) {
      alert("Error al guardar: " + error.message);
    } else {
      alert("Configuración guardada correctamente");
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-xl font-semibold mb-4">Configuración de bloques horarios (lunes a viernes)</h2>

      <table className="w-full border border-gray-300 mb-2">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2 border">Bloque</th>
            <th className="p-2 border">Hora inicio</th>
            <th className="p-2 border">Hora fin</th>
            <th className="p-2 border">Acción</th>
          </tr>
        </thead>
        <tbody>
          {bloques.map((bloque, index) => (
            <tr key={index} className="text-center">
              <td className="p-2 border">{index + 1}</td>
              <td className="p-2 border">
                <input
                  type="time"
                  value={bloque.inicio}
                  onChange={(e) => actualizarBloque(index, "inicio", e.target.value)}
                  className="border px-2 py-1 rounded"
                />
              </td>
              <td className="p-2 border">
                <input
                  type="time"
                  value={bloque.fin}
                  readOnly // solo lectura ya que se calcula automáticamente
                  className="border px-2 py-1 rounded bg-gray-100 cursor-not-allowed"
                />
              </td>
              <td className="p-2 border">
                <button
                  onClick={() => eliminarBloque(index)}
                  className="text-red-600 hover:underline text-sm"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-2 mb-4">
        <button
          onClick={agregarBloque}
          disabled={bloques.length >= 9}
          className={`px-4 py-2 rounded text-white ${
            bloques.length >= 9 ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          Añadir bloque
        </button>

        <button
          onClick={guardarConfiguracion}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Guardar configuración
        </button>
      </div>
    </div>
  );
};

export default FranjasHorariasForm;
