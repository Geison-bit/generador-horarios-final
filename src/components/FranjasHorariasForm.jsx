import { useState } from "react";
import Breadcrumbs from "../components/Breadcrumbs"; // ✅ Importado

const FranjasHorariasForm = () => {
  const [bloques, setBloques] = useState([
    { inicio: "07:15", fin: "08:00" },
    { inicio: "08:00", fin: "08:45" },
    { inicio: "08:45", fin: "09:30" },
    { inicio: "09:30", fin: "10:15" },
    { inicio: "10:30", fin: "11:15" },
    { inicio: "11:15", fin: "12:00" },
    { inicio: "12:00", fin: "12:45" },
    { inicio: "12:45", fin: "13:30" },
  ]);

  const actualizarBloque = (index, campo, valor) => {
    const nuevosBloques = [...bloques];
    nuevosBloques[index][campo] = valor;
    setBloques(nuevosBloques);
  };

  const guardarConfiguracion = () => {
    console.log("Bloques configurados:", bloques);
    // Aquí puedes enviar los bloques al backend o guardarlos en JSON
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <Breadcrumbs /> {/* ✅ Aquí se integra el componente */}
      <h2 className="text-xl font-semibold mb-4">Configuración de bloques horarios (lunes a viernes)</h2>

      <table className="w-full border border-gray-300">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2 border">Bloque</th>
            <th className="p-2 border">Hora inicio</th>
            <th className="p-2 border">Hora fin</th>
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
                  onChange={(e) => actualizarBloque(index, "fin", e.target.value)}
                  className="border px-2 py-1 rounded"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={guardarConfiguracion}
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Guardar configuración
      </button>
    </div>
  );
};

export default FranjasHorariasForm;

