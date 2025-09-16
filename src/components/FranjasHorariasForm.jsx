import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

// --- Íconos SVG para una interfaz más limpia ---
const IconoAgregar = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
);

const IconoEliminar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);

const IconoGuardar = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);

const sumarMinutos = (horaStr, minutos) => {
  if (!horaStr) return "";
  const [h, m] = horaStr.split(":").map(Number);
  const fecha = new Date();
  fecha.setHours(h, m + minutos, 0);
  return fecha.toTimeString().slice(0, 5);
};

const FranjasHorariasForm = () => {
  const [bloques, setBloques] = useState([]);
  const [saveStatus, setSaveStatus] = useState({ message: "", type: "" }); // Para notificaciones

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
    if (campo === "inicio") {
      nuevos[index].fin = sumarMinutos(valor, 45);
    }
    setBloques(nuevos);
  };

  const agregarBloque = () => {
    if (bloques.length >= 9) return;
    const ultima = bloques[bloques.length - 1] || { fin: "07:15" };
    const nuevoInicio = ultima.fin;
    const nuevoFin = sumarMinutos(nuevoInicio, 45);
    setBloques([...bloques, { inicio: nuevoInicio, fin: nuevoFin }]);
  };

  const eliminarBloque = (index) => {
    setBloques(bloques.filter((_, i) => i !== index));
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
      setSaveStatus({ message: "Error al guardar la configuración.", type: "error" });
    } else {
      setSaveStatus({ message: "Configuración guardada exitosamente.", type: "success" });
    }
    setTimeout(() => setSaveStatus({ message: "", type: "" }), 3000); // Ocultar mensaje después de 3 seg
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-2xl font-bold mb-4">Configuración de Bloques Horarios</h2>
      <p className="text-gray-600 mb-6">Define los bloques horarios de Lunes a Viernes para el nivel {nivel}.</p>

      <div className="bg-white p-4 rounded-lg border shadow-sm mb-6">
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-gray-100 text-left">
                    <tr>
                        <th className="px-4 py-3 font-medium">Bloque</th>
                        <th className="px-4 py-3 font-medium">Hora de Inicio</th>
                        <th className="px-4 py-3 font-medium">Hora de Fin (Automático)</th>
                        <th className="px-4 py-3 font-medium text-center">Acción</th>
                    </tr>
                </thead>
                <tbody>
                    {bloques.map((bloque, index) => (
                    <tr key={index} className="hover:bg-gray-50 border-t">
                        <td className="px-4 py-2 font-semibold text-gray-700">Bloque {index + 1}</td>
                        <td className="px-4 py-2">
                            <input
                                type="time"
                                value={bloque.inicio}
                                onChange={(e) => actualizarBloque(index, "inicio", e.target.value)}
                                className="border px-2 py-1 rounded-md"
                            />
                        </td>
                        <td className="px-4 py-2">
                            <input
                                type="time"
                                value={bloque.fin}
                                readOnly
                                className="border px-2 py-1 rounded-md bg-gray-100 cursor-not-allowed"
                            />
                        </td>
                        <td className="px-4 py-2 text-center">
                            <button
                                onClick={() => eliminarBloque(index)}
                                className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors"
                                title="Eliminar bloque"
                            >
                                <IconoEliminar />
                            </button>
                        </td>
                    </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-4 items-center">
        <button
          onClick={agregarBloque}
          disabled={bloques.length >= 9}
          className="bg-blue-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-blue-700 flex items-center disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <IconoAgregar /> Añadir Bloque
        </button>
        <button
          onClick={guardarConfiguracion}
          className="bg-green-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-green-700 flex items-center"
        >
          <IconoGuardar /> Guardar Configuración
        </button>
        {saveStatus.message && (
            <span className={`text-sm font-medium ${saveStatus.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                {saveStatus.message}
            </span>
        )}
      </div>
    </div>
  );
};

export default FranjasHorariasForm;
