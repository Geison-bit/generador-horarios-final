import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

const AulasForm = () => {
  // Usamos un solo estado para el formulario para un código más limpio
  const [formData, setFormData] = useState({
    nombre: "",
    piso: "", // Ahora será un número
    tipo: "",
  });

  // Estado para manejar los errores de validación
  const [errors, setErrors] = useState({});
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
      .order("piso") // Ordenamos por piso para mejor visualización
      .order("nombre");
    setAulas(data || []);
  };

  const validateForm = async () => {
    const newErrors = {};
    const nombreLimpio = formData.nombre.trim();
    const pisoNum = parseInt(formData.piso, 10);

    // Validar nombre
    if (!nombreLimpio) {
      newErrors.nombre = "El nombre es obligatorio.";
    } else if (nombreLimpio.length < 3) {
      newErrors.nombre = "Debe tener al menos 3 caracteres.";
    } else {
      const { data } = await supabase
        .from("aulas")
        .select("id")
        .eq("nivel", nivel)
        .ilike("nombre", nombreLimpio);
      const nombreExiste = data.length > 0 && (!modoEdicion || data[0].id !== aulaEditandoId);
      if (nombreExiste) {
        newErrors.nombre = "Ya existe un aula con este nombre.";
      }
    }

    // Validar piso
    if (!formData.piso) {
        newErrors.piso = "El piso es obligatorio.";
    } else if (isNaN(pisoNum) || pisoNum <= 0) {
        newErrors.piso = "Debe ser un número positivo.";
    }
    
    // Validar tipo
    if (!formData.tipo) newErrors.tipo = "Seleccione un tipo.";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const esValido = await validateForm();
    if (!esValido) return;

    // Guardamos el piso con el formato "Piso X" para mantener consistencia
    const payload = {
      nombre: formData.nombre.trim(),
      tipo: formData.tipo,
      piso: `Piso ${formData.piso}`,
      nivel,
    };

    if (modoEdicion && aulaEditandoId) {
      await supabase.from("aulas").update(payload).eq("id", aulaEditandoId);
    } else {
      await supabase.from("aulas").insert(payload);
    }

    cancelarEdicion(); // Limpia el formulario y resetea estados
    cargarAulas();
  };

  const editarAula = (aula) => {
    setModoEdicion(true);
    setAulaEditandoId(aula.id);
    setFormData({
      nombre: aula.nombre,
      // Extraemos solo el número del texto "Piso X"
      piso: aula.piso.replace('Piso ', '').trim(),
      tipo: aula.tipo,
    });
    setErrors({});
  };

  const cancelarEdicion = () => {
    setModoEdicion(false);
    setAulaEditandoId(null);
    setFormData({ nombre: "", tipo: "", piso: "" });
    setErrors({});
  };

  const eliminarAula = async (id) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar esta aula?")) return;

    const { error } = await supabase.from("aulas").delete().eq("id", id);
    if (error) {
      alert("No se pudo eliminar el aula. Revise si está asignada a un docente.");
    } else {
      cargarAulas();
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-2xl font-bold mb-4">Registrar Aula - {nivel}</h2>
      
      <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg border shadow-sm mb-6 flex flex-wrap gap-4 items-start">
        {/* Campo Nombre */}
        <div className="flex flex-col">
          <label htmlFor="nombre" className="mb-1 text-sm font-medium text-gray-700">Nombre del Aula</label>
          <input
            id="nombre" name="nombre" type="text" placeholder="Ej: A-101"
            value={formData.nombre} onChange={handleInputChange} maxLength={15}
            className={`border px-3 py-2 rounded-md w-48 ${errors.nombre ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.nombre && <p className="text-red-600 text-xs mt-1">{errors.nombre}</p>}
        </div>

        {/* --- CAMPO PISO MEJORADO --- */}
        <div className="flex flex-col">
          <label htmlFor="piso" className="mb-1 text-sm font-medium text-gray-700">Número de Piso</label>
          <input
            id="piso" name="piso" type="number" placeholder="Ej: 3"
            value={formData.piso} onChange={handleInputChange} min="1"
            className={`border px-3 py-2 rounded-md w-28 ${errors.piso ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.piso && <p className="text-red-600 text-xs mt-1">{errors.piso}</p>}
        </div>

        {/* Campo Tipo */}
        <div className="flex flex-col">
          <label htmlFor="tipo" className="mb-1 text-sm font-medium text-gray-700">Tipo de Aula</label>
          <select
            id="tipo" name="tipo" value={formData.tipo} onChange={handleInputChange}
            className={`border px-3 py-2 rounded-md w-48 ${errors.tipo ? 'border-red-500' : 'border-gray-300'}`}
          >
            <option value="">Seleccione...</option>
            <option value="Teórica">Teórica</option>
            <option value="Laboratorio">Laboratorio</option>
            <option value="Cómputo">Cómputo</option>
          </select>
          {errors.tipo && <p className="text-red-600 text-xs mt-1">{errors.tipo}</p>}
        </div>

        {/* Botones de Acción */}
        <div className="flex items-end gap-2 pt-6">
          <button type="submit" className={`${modoEdicion ? "bg-yellow-500 hover:bg-yellow-600" : "bg-blue-600 hover:bg-blue-700"} text-white px-4 py-2 rounded-md font-semibold`}>
            {modoEdicion ? "Guardar Cambios" : "Agregar Aula"}
          </button>
          {modoEdicion && (
            <button type="button" onClick={cancelarEdicion} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md font-semibold">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border rounded-lg">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="border-b px-4 py-2">Nombre</th>
              <th className="border-b px-4 py-2">Piso</th>
              <th className="border-b px-4 py-2">Tipo</th>
              <th className="border-b px-4 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {aulas.map((aula) => (
              <tr key={aula.id} className="hover:bg-gray-50">
                <td className="border-b px-4 py-2">{aula.nombre}</td>
                <td className="border-b px-4 py-2">{aula.piso}</td>
                <td className="border-b px-4 py-2">{aula.tipo}</td>
                <td className="border-b px-4 py-2">
                  <div className="flex justify-center gap-4">
                    <button onClick={() => editarAula(aula)} className="text-blue-600 hover:underline font-medium text-sm">
                      Editar
                    </button>
                    <button onClick={() => eliminarAula(aula.id)} className="text-red-600 hover:underline font-medium text-sm">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AulasForm;

