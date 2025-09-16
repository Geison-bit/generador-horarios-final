import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";

// --- Componentes de Íconos (SVG) para un código más limpio ---
const IconoEditar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
    <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
  </svg>
);

const IconoEliminar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);


const DocentesForm = () => {
  const initialState = {
    nombre: "",
    apellido: "",
    tipoProfesor: "",
    jornada: "",
    aulaId: "",
    cursosSeleccionados: [],
  };

  const [formData, setFormData] = useState(initialState);
  const [errors, setErrors] = useState({});
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
  const esPrimaria = nivelURL === "Primaria";

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
      .order("apellido")
      .order("nombre");
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
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if(errors[name]) setErrors(prev => ({...prev, [name]: null}));
  };

  const toggleCursoSeleccionado = (id) => {
    const { cursosSeleccionados } = formData;
    const nuevosCursos = cursosSeleccionados.includes(id)
      ? cursosSeleccionados.filter((c) => c !== id)
      : [...cursosSeleccionados, id];
    setFormData(prev => ({ ...prev, cursosSeleccionados: nuevosCursos }));
    if(errors.cursosSeleccionados) setErrors(prev => ({...prev, cursosSeleccionados: null}));
  };

  const validateForm = () => {
      const newErrors = {};
      if (formData.nombre.trim().length < 3) newErrors.nombre = "El nombre es muy corto.";
      if (formData.apellido.trim().length < 3) newErrors.apellido = "El apellido es muy corto.";
      if (!formData.tipoProfesor) newErrors.tipoProfesor = "Seleccione un tipo.";
      
      const jornadaNum = parseInt(formData.jornada);
      if (isNaN(jornadaNum) || jornadaNum < 10 || jornadaNum > 40) {
        newErrors.jornada = "Entre 10 y 40.";
      }
      
      if (!formData.aulaId) newErrors.aulaId = "Seleccione un aula.";
      if (formData.cursosSeleccionados.length === 0) newErrors.cursosSeleccionados = "Seleccione al menos un curso.";

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const payload = {
      nombre: formData.nombre.trim(),
      apellido: formData.apellido.trim(),
      tipo_profesor: formData.tipoProfesor,
      jornada_total: parseInt(formData.jornada),
      aula_id: parseInt(formData.aulaId),
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
      const registros = formData.cursosSeleccionados.map((cid) => ({
        docente_id: docenteId,
        curso_id: cid,
        nivel: nivelURL,
      }));
      await supabase.from("docente_curso").insert(registros);
    }
    
    cancelarEdicion();
    cargarDocentes();
  };

  const editarDocente = (docente) => {
    setModoEdicion(true);
    setDocenteEditandoId(docente.id);
    setFormData({
        nombre: docente.nombre,
        apellido: docente.apellido || "",
        tipoProfesor: docente.tipo_profesor || "",
        jornada: docente.jornada_total.toString(),
        aulaId: docente.aula_id.toString(),
        cursosSeleccionados: docente.docente_curso?.map((dc) => dc.curso_id) || [],
    });
    setErrors({});
  };
  
  const cancelarEdicion = () => {
    setModoEdicion(false);
    setDocenteEditandoId(null);
    setFormData(initialState);
    setErrors({});
  };

  const eliminarDocente = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este docente y todos sus datos?")) return;
    
    await supabase.from("docente_curso").delete().eq("docente_id", id);
    const { error } = await supabase.from("docentes").delete().eq("id", id);

    if (error) {
      alert("❌ Error al eliminar el docente.");
    } else {
      cargarDocentes();
    }
  };
  
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-2xl font-bold mb-4">Registrar Docente - {nivelURL}</h2>

      <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg border shadow-sm mb-6 flex flex-wrap gap-4 items-start">
        {["nombre", "apellido"].map(field => (
          <div key={field} className="flex flex-col">
            <label htmlFor={field} className="mb-1 text-sm font-medium text-gray-700 capitalize">{field}</label>
            <input
              id={field} name={field} type="text" placeholder={`Ingrese ${field}`}
              value={formData[field]} onChange={handleInputChange}
              className={`border px-3 py-2 rounded-md w-48 ${errors[field] ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors[field] && <p className="text-red-600 text-xs mt-1">{errors[field]}</p>}
          </div>
        ))}
        
        <div className="flex flex-col">
            <label htmlFor="tipoProfesor" className="mb-1 text-sm font-medium text-gray-700">Tipo</label>
            <select name="tipoProfesor" value={formData.tipoProfesor} onChange={handleInputChange} className={`border px-3 py-2 rounded-md w-48 ${errors.tipoProfesor ? 'border-red-500' : 'border-gray-300'}`}>
                <option value="">Seleccione...</option>
                <option value="Contratado">Contratado</option>
                <option value="Nombrado">Nombrado</option>
            </select>
            {errors.tipoProfesor && <p className="text-red-600 text-xs mt-1">{errors.tipoProfesor}</p>}
        </div>

        <div className="flex flex-col">
            <label htmlFor="jornada" className="mb-1 text-sm font-medium text-gray-700">Horas</label>
            <input type="number" name="jornada" placeholder="Ej: 30" value={formData.jornada} onChange={handleInputChange} className={`border px-3 py-2 rounded-md w-24 ${errors.jornada ? 'border-red-500' : 'border-gray-300'}`} />
            {errors.jornada && <p className="text-red-600 text-xs mt-1">{errors.jornada}</p>}
        </div>

        <div className="flex flex-col">
            <label htmlFor="aulaId" className="mb-1 text-sm font-medium text-gray-700">Aula</label>
            <select name="aulaId" value={formData.aulaId} onChange={handleInputChange} className={`border px-3 py-2 rounded-md w-48 ${errors.aulaId ? 'border-red-500' : 'border-gray-300'}`}>
                <option value="">Seleccione...</option>
                {aulas.map((a) => (
                    <option key={a.id} value={a.id} disabled={formData.aulaId !== a.id.toString() && aulasOcupadas.includes(a.id)}>
                        {a.nombre}
                    </option>
                ))}
            </select>
            {errors.aulaId && <p className="text-red-600 text-xs mt-1">{errors.aulaId}</p>}
        </div>

        <div className="relative flex flex-col" ref={dropdownRef}>
          <label className="mb-1 text-sm font-medium text-gray-700">Especialidades</label>
          <button type="button" onClick={() => setMostrarDropdown(!mostrarDropdown)} className={`border px-3 py-2 rounded-md w-48 text-left ${errors.cursosSeleccionados ? 'border-red-500' : 'border-gray-300'}`}>
            {formData.cursosSeleccionados.length > 0 ? `${formData.cursosSeleccionados.length} seleccionados` : "Seleccione..."}
          </button>
          {errors.cursosSeleccionados && <p className="text-red-600 text-xs mt-1">{errors.cursosSeleccionados}</p>}
          {mostrarDropdown && (
            <div className="absolute top-full z-10 mt-1 max-h-52 overflow-auto border bg-white rounded shadow w-48">
              {cursos.map((curso) => (
                <label key={curso.id} className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
                  <input type="checkbox" className="mr-2" checked={formData.cursosSeleccionados.includes(curso.id)} onChange={() => toggleCursoSeleccionado(curso.id)} />
                  {curso.nombre}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-end gap-2 pt-6">
          <button type="submit" className={`${modoEdicion ? "bg-yellow-500 hover:bg-yellow-600" : "bg-blue-600 hover:bg-blue-700"} text-white px-4 py-2 rounded-md font-semibold`}>
            {modoEdicion ? "Guardar Cambios" : "Agregar Docente"}
          </button>
          {modoEdicion && (
            <button type="button" onClick={cancelarEdicion} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md font-semibold">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="border-b px-4 py-3">Nombre</th>
              <th className="border-b px-4 py-3">Apellido</th>
              <th className="border-b px-4 py-3">Tipo</th>
              <th className="border-b px-4 py-3 text-center">Horas</th>
              <th className="border-b px-4 py-3">Aula</th>
              <th className="border-b px-4 py-3">Especialidades</th>
              <th className="border-b px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {docentes.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="border-b px-4 py-2">{d.nombre}</td>
                <td className="border-b px-4 py-2">{d.apellido}</td>
                <td className="border-b px-4 py-2">{d.tipo_profesor}</td>
                <td className="border-b px-4 py-2 text-center">{d.jornada_total}</td>
                <td className="border-b px-4 py-2">{d.aulas?.nombre || "N/A"}</td>
                <td className="border-b px-4 py-2 text-xs">
                  {(d.docente_curso || []).map((dc) => dc.cursos?.nombre).join(", ")}
                </td>
                <td className="border-b px-4 py-2">
                  <div className="flex justify-center items-center gap-3">
                    <button onClick={() => editarDocente(d)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full transition-colors" title="Editar Docente">
                      <IconoEditar />
                    </button>
                    <button onClick={() => eliminarDocente(d.id)} className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors" title="Eliminar Docente">
                      <IconoEliminar />
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

export default DocentesForm;
