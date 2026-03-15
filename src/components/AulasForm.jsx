import { useEffect, useMemo, useReducer, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";
import { Building2, Save, X, Pencil, Trash2, Loader2, Clock3, Copy } from "lucide-react";

const initialState = {
  formData: { nombre: "", piso: "", tipo: "" },
  errors: {},
  aulas: [],
  modoEdicion: false,
  aulaEditandoId: null,
  loading: false,
  saving: false,
  versions: [],
  versionNum: 1,
  ultimaEdicion: null,
};

function aulasReducer(state, action) {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_SAVING":
      return { ...state, saving: action.payload };
    case "SET_AULAS":
      return { ...state, aulas: action.payload };
    case "SET_VERSIONS":
      return {
        ...state,
        versions: action.payload.versions,
        versionNum: action.payload.versionNum,
      };
    case "SET_VERSION":
      return { ...state, versionNum: action.payload };
    case "SET_ULTIMA_EDICION":
      return { ...state, ultimaEdicion: action.payload };
    case "UPDATE_FORM_FIELD":
      return {
        ...state,
        formData: { ...state.formData, [action.payload.name]: action.payload.value },
        errors: state.errors[action.payload.name]
          ? { ...state.errors, [action.payload.name]: null }
          : state.errors,
      };
    case "SET_ERRORS":
      return { ...state, errors: action.payload };
    case "START_EDIT":
      return {
        ...state,
        modoEdicion: true,
        aulaEditandoId: action.payload.id,
        formData: action.payload.formData,
        errors: {},
      };
    case "RESET_FORM":
      return {
        ...state,
        modoEdicion: false,
        aulaEditandoId: null,
        formData: { nombre: "", piso: "", tipo: "" },
        errors: {},
      };
    default:
      return state;
  }
}

const norm = (s) => s.trim().replace(/\s+/g, " ");

const pisoToNum = (p) => {
  const m = String(p || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
};

const sortAulas = (items) =>
  [...items].sort((a, b) => pisoToNum(a.piso) - pisoToNum(b.piso) || a.nombre.localeCompare(b.nombre));

function LastEditPill({ edit }) {
  const actorNombre =
    edit?.actor_name || edit?.actor_full_name || edit?.actor_email || "Desconocido";
  const fecha = edit?.created_at ? new Date(edit.created_at).toLocaleString() : "-";

  return (
    <div className="flex items-center gap-2 text-xs px-3 py-1 rounded-md bg-gray-100 border text-gray-700 shadow-sm w-full sm:w-auto">
      <Clock3 className="size-4" />
      <span>
        <span className="text-gray-600">Ultima edicion:</span>{" "}
        <b>{actorNombre}</b> · {fecha}
      </span>
    </div>
  );
}

function AulasHeader({
  nivel,
  versions,
  versionNum,
  ultimaEdicion,
  saving,
  hasAulas,
  onVersionChange,
  onCrearCopia,
}) {
  return (
    <div className="mt-4 mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <h2 className="text-xl md:text-2xl font-semibold text-slate-800 flex items-center gap-2">
        <Building2 className="size-6 text-blue-600" /> Registrar Aula - {nivel}
      </h2>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
        <div className="flex items-center gap-2">
          <label htmlFor="aulas-version" className="text-xs text-slate-600">Version</label>
          <select
            id="aulas-version"
            value={versionNum}
            onChange={(e) => onVersionChange(parseInt(e.target.value, 10))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <LastEditPill edit={ultimaEdicion} />
        <button
          onClick={onCrearCopia}
          disabled={saving || !hasAulas}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-70 w-full sm:w-auto"
        >
          <Copy className="size-4" />
          Crear copia
        </button>
      </div>
    </div>
  );
}

function AulaForm({
  formData,
  errors,
  saving,
  modoEdicion,
  inputNombreRef,
  onInputChange,
  onSubmit,
  onCancel,
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 md:p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"
    >
      <div className="flex flex-col">
        <label htmlFor="nombre" className="mb-1 text-sm font-medium text-slate-700">
          Nombre del Aula
        </label>
        <input
          ref={inputNombreRef}
          id="nombre"
          name="nombre"
          type="text"
          placeholder="Ej: A-101"
          value={formData.nombre}
          onChange={onInputChange}
          maxLength={15}
          className={`rounded-lg border px-3 py-2 text-sm ${errors.nombre ? "border-rose-500" : "border-slate-300"} focus:outline-none focus:ring-2 focus:ring-blue-600`}
        />
        {errors.nombre && <p className="text-rose-600 text-xs mt-1">{errors.nombre}</p>}
      </div>

      <div className="flex flex-col">
        <label htmlFor="piso" className="mb-1 text-sm font-medium text-slate-700">
          Numero de Piso
        </label>
        <input
          id="piso"
          name="piso"
          type="number"
          placeholder="Ej: 3"
          value={formData.piso}
          onChange={onInputChange}
          min="1"
          className={`rounded-lg border px-3 py-2 text-sm ${errors.piso ? "border-rose-500" : "border-slate-300"} focus:outline-none focus:ring-2 focus:ring-blue-600 w-28`}
        />
        {errors.piso && <p className="text-rose-600 text-xs mt-1">{errors.piso}</p>}
      </div>

      <div className="flex flex-col">
        <label htmlFor="tipo" className="mb-1 text-sm font-medium text-slate-700">
          Tipo de Aula
        </label>
        <select
          id="tipo"
          name="tipo"
          value={formData.tipo}
          onChange={onInputChange}
          className={`rounded-lg border px-3 py-2 text-sm ${errors.tipo ? "border-rose-500" : "border-slate-300"} focus:outline-none focus:ring-2 focus:ring-blue-600`}
        >
          <option value="">Seleccione...</option>
          <option value="Teorica">Teorica</option>
          <option value="Laboratorio">Laboratorio</option>
          <option value="Computo">Computo</option>
        </select>
        {errors.tipo && <p className="text-rose-600 text-xs mt-1">{errors.tipo}</p>}
      </div>

      <div className="flex items-end gap-2">
        <button
          type="submit"
          disabled={saving}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-white shadow ${
            modoEdicion ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
          } disabled:opacity-70`}
          title={modoEdicion ? "Guardar cambios" : "Agregar aula"}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {modoEdicion ? "Guardar cambios" : "Agregar aula"}
        </button>
        {modoEdicion && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-500 px-4 py-2 text-white shadow hover:bg-slate-600"
          >
            <X className="size-4" /> Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function AulasTable({ loading, aulas, onEdit, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-700">
          <tr>
            <th className="border-b border-slate-200 px-4 py-3">Nombre</th>
            <th className="border-b border-slate-200 px-4 py-3">Piso</th>
            <th className="border-b border-slate-200 px-4 py-3">Tipo</th>
            <th className="border-b border-slate-200 px-4 py-3 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                Cargando aulas...
              </td>
            </tr>
          ) : aulas.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                No hay aulas registradas.
              </td>
            </tr>
          ) : (
            aulas.map((aula) => (
              <tr key={aula.id} className="hover:bg-slate-50">
                <td className="border-b border-slate-200 px-4 py-2">{aula.nombre}</td>
                <td className="border-b border-slate-200 px-4 py-2">{aula.piso}</td>
                <td className="border-b border-slate-200 px-4 py-2">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                    {aula.tipo}
                  </span>
                </td>
                <td className="border-b border-slate-200 px-4 py-2">
                  <div className="flex justify-center items-center gap-2">
                    <button
                      onClick={() => onEdit(aula)}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-blue-600 hover:bg-blue-50"
                      title="Editar aula"
                    >
                      <Pencil className="size-4" /> Editar
                    </button>
                    <button
                      onClick={() => onDelete(aula.id)}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-rose-600 hover:bg-rose-50"
                      title="Eliminar aula"
                    >
                      <Trash2 className="size-4" /> Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AulasForm() {
  const [state, dispatch] = useReducer(aulasReducer, initialState);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivel = params.get("nivel") || "Secundaria";
  const inputNombreRef = useRef(null);

  const {
    formData,
    errors,
    aulas,
    modoEdicion,
    aulaEditandoId,
    loading,
    saving,
    versions,
    versionNum,
    ultimaEdicion,
  } = state;

  const aulasFiltradas = useMemo(() => sortAulas(aulas), [aulas]);

  useEffect(() => {
    const cargarVersionesDesdeDB = async () => {
      const { data, error } = await supabase
        .from("aulas")
        .select("version_num")
        .eq("nivel", nivel)
        .order("version_num", { ascending: true });

      if (!error && data?.length) {
        const unique = Array.from(new Set(data.map((v) => v.version_num))).sort((a, b) => a - b);
        dispatch({
          type: "SET_VERSIONS",
          payload: {
            versions: unique,
            versionNum: unique.includes(versionNum) ? versionNum : unique[0],
          },
        });
        return;
      }

      dispatch({ type: "SET_VERSIONS", payload: { versions: [1], versionNum: 1 } });
    };

    cargarVersionesDesdeDB();
  }, [nivel, versionNum]);

  useEffect(() => {
    const cargarAulas = async () => {
      dispatch({ type: "SET_LOADING", payload: true });
      const { data, error } = await supabase
        .from("aulas")
        .select()
        .eq("nivel", nivel)
        .eq("version_num", versionNum);
      if (error) console.error(error);
      dispatch({ type: "SET_AULAS", payload: sortAulas(data || []) });
      dispatch({ type: "SET_LOADING", payload: false });
    };

    cargarAulas();
  }, [nivel, versionNum]);

  useEffect(() => {
    const fetchUltima = async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("actor_email, created_at, operation")
        .eq("table_name", "aulas")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!error && data?.length) {
        let registro = data[0];
        if (registro.actor_email) {
          const { data: udata } = await supabase
            .from("view_user_accounts")
            .select("full_name")
            .eq("email", registro.actor_email)
            .limit(1);
          if (udata?.[0]?.full_name) registro = { ...registro, actor_name: udata[0].full_name };
        }
        dispatch({ type: "SET_ULTIMA_EDICION", payload: registro });
        return;
      }
      dispatch({ type: "SET_ULTIMA_EDICION", payload: null });
    };

    fetchUltima();
  }, [nivel, aulas.length]);

  useEffect(() => {
    const ch = supabase
      .channel("audit_aulas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs", filter: "table_name=eq.aulas" },
        async () => {
          const { data } = await supabase
            .from("audit_logs")
            .select("actor_email, created_at, operation")
            .eq("table_name", "aulas")
            .order("created_at", { ascending: false })
            .limit(1);

          if (data?.length) {
            let registro = data[0];
            if (registro.actor_email) {
              const { data: udata } = await supabase
                .from("view_user_accounts")
                .select("full_name")
                .eq("email", registro.actor_email)
                .limit(1);
              if (udata?.[0]?.full_name) registro = { ...registro, actor_name: udata[0].full_name };
            }
            dispatch({ type: "SET_ULTIMA_EDICION", payload: registro });
          }
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    dispatch({ type: "UPDATE_FORM_FIELD", payload: { name, value } });
  };

  const validateForm = async () => {
    const newErrors = {};
    const nombreLimpio = norm(formData.nombre);
    const pisoNum = parseInt(formData.piso, 10);

    if (!nombreLimpio) newErrors.nombre = "El nombre es obligatorio.";
    else if (nombreLimpio.length < 3) newErrors.nombre = "Debe tener al menos 3 caracteres.";
    else {
      const { data, error } = await supabase
        .from("aulas")
        .select("id")
        .eq("nivel", nivel)
        .eq("version_num", versionNum)
        .ilike("nombre", nombreLimpio);

      if (!error && data && data.length > 0 && (!modoEdicion || data[0].id !== aulaEditandoId)) {
        newErrors.nombre = "Ya existe un aula con este nombre.";
      }
    }

    if (!formData.piso) newErrors.piso = "El piso es obligatorio.";
    else if (isNaN(pisoNum) || pisoNum <= 0) newErrors.piso = "Debe ser un numero positivo.";

    if (!formData.tipo) newErrors.tipo = "Seleccione un tipo.";

    dispatch({ type: "SET_ERRORS", payload: newErrors });
    return Object.keys(newErrors).length === 0;
  };

  const refrescarAulas = async () => {
    const { data, error } = await supabase
      .from("aulas")
      .select()
      .eq("nivel", nivel)
      .eq("version_num", versionNum);
    if (error) console.error(error);
    dispatch({ type: "SET_AULAS", payload: sortAulas(data || []) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!(await validateForm())) return;

    dispatch({ type: "SET_SAVING", payload: true });
    const payload = {
      nombre: norm(formData.nombre),
      tipo: formData.tipo,
      piso: `Piso ${formData.piso}`,
      nivel,
      version_num: versionNum,
    };

    if (modoEdicion && aulaEditandoId) {
      const { error } = await supabase.from("aulas").update(payload).eq("id", aulaEditandoId);
      if (error) alert("No se pudo actualizar el aula.");
    } else {
      const { error } = await supabase.from("aulas").insert(payload);
      if (error) alert("No se pudo crear el aula.");
    }

    dispatch({ type: "SET_SAVING", payload: false });
    dispatch({ type: "RESET_FORM" });
    await refrescarAulas();
  };

  const editarAula = (aula) => {
    dispatch({
      type: "START_EDIT",
      payload: {
        id: aula.id,
        formData: {
          nombre: aula.nombre,
          piso: aula.piso.replace("Piso ", "").trim(),
          tipo: aula.tipo,
        },
      },
    });
    setTimeout(() => inputNombreRef.current?.focus(), 0);
  };

  const cancelarEdicion = () => {
    dispatch({ type: "RESET_FORM" });
  };

  const eliminarAula = async (id) => {
    if (!window.confirm("¿Estas seguro de que deseas eliminar esta aula?")) return;
    const { error } = await supabase.from("aulas").delete().eq("id", id);
    if (error) {
      alert("No se pudo eliminar el aula. Revise si esta relacionada a horarios o asignaciones.");
      return;
    }
    await refrescarAulas();
  };

  const crearCopia = async () => {
    const siguiente = (versions[versions.length - 1] || 1) + 1;
    dispatch({ type: "SET_SAVING", payload: true });

    try {
      const nuevaConfig = aulas.map((a) => ({
        nombre: a.nombre,
        piso: a.piso,
        tipo: a.tipo,
        nivel,
        version_num: siguiente,
      }));

      const { error } = await supabase.from("aulas").insert(nuevaConfig);
      if (error) throw error;

      dispatch({
        type: "SET_VERSIONS",
        payload: { versions: [...versions, siguiente], versionNum: siguiente },
      });
    } catch (e) {
      console.error(e);
      alert("Error al crear copia de aulas");
    } finally {
      dispatch({ type: "SET_SAVING", payload: false });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Breadcrumbs />

      <AulasHeader
        nivel={nivel}
        versions={versions}
        versionNum={versionNum}
        ultimaEdicion={ultimaEdicion}
        saving={saving}
        hasAulas={aulas.length > 0}
        onVersionChange={(nextVersion) => dispatch({ type: "SET_VERSION", payload: nextVersion })}
        onCrearCopia={crearCopia}
      />

      <AulaForm
        formData={formData}
        errors={errors}
        saving={saving}
        modoEdicion={modoEdicion}
        inputNombreRef={inputNombreRef}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        onCancel={cancelarEdicion}
      />

      <AulasTable
        loading={loading}
        aulas={aulasFiltradas}
        onEdit={editarAula}
        onDelete={eliminarAula}
      />
    </div>
  );
}
