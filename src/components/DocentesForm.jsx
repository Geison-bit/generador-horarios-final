import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";
import { Clock3, UserPlus } from "lucide-react";

// --- Iconos SVG para acciones ---
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

// --- Mini pill "Última edición" ---
const LastEditPill = ({ edit }) => {
  const actorName =
    edit?.actor_name || edit?.actor_full_name || edit?.actor_email || "Desconocido";
  const fecha = edit?.created_at ? new Date(edit.created_at).toLocaleString() : "—";
  return (
    <div className="flex items-center gap-2 text-xs px-3 py-1 rounded-md bg-gray-100 border text-gray-700 shadow-sm w-full sm:w-auto">
      <Clock3 className="w-4 h-4" />
      <span>
        <span className="text-gray-600">Última edición:</span>{" "}
        <b>{actorName}</b> · {fecha}
      </span>
    </div>
  );
};

// --- Modal con autocomplete (excluye los ya vinculados) ---
function VincularCuentaModal({ open, onClose, onConfirm, docente }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(null); // { user_id, email }

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSuggestions([]);
    setPicked(null);
  }, [open]);

  // buscar en la vista de cuentas disponibles
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    // debounce simple
    const t = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_cuentas_docentes_disponibles")
        .select("user_id, email")
        .ilike("email", q === "" ? "%" : `%${q}%`)
        .order("email")
        .limit(8);
      if (!error) setSuggestions(data || []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [open, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg sm:rounded-xl bg-white shadow-lg border">
        <div className="px-4 py-1.5 sm:py-2.5 lg:py-3 border-b">
          <h3 className="font-semibold">Vincular cuenta</h3>
          <p className="text-sm text-gray-600">
            Docente: <b>{docente?.nombre} {docente?.apellido}</b>
          </p>
        </div>

        <div className="p-4 space-y-2">
          <label className="block text-sm font-medium text-gray-700">Buscar correo (solo cuentas libres)</label>
          <input
            type="email"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
            placeholder="nombre@colegio.edu"
            className="w-full border rounded-md px-3 py-2"
          />

          {/* lista de sugerencias */}
          <div className="mt-1 max-h-44 overflow-auto border rounded-md">
            {loading && <div className="px-3 py-2 text-sm text-gray-500">Buscando…</div>}
            {!loading && suggestions.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">Sin resultados</div>
            )}
            {!loading && suggestions.map((s) => (
              <button
                key={s.user_id}
                onClick={() => { setPicked(s); setQuery(s.email); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                  picked?.user_id === s.user_id ? "bg-blue-50" : ""
                }`}
              >
                {s.email}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-500">
            Solo se listan cuentas con rol <b>docente</b> que aún no están vinculadas.
          </p>
        </div>

        <div className="p-4 flex justify-end gap-2 border-t">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border">Cancelar</button>
          <button
            onClick={() => onConfirm(picked)} // enviamos {user_id,email}
            disabled={!picked}
            className={`px-3 py-1.5 rounded-md text-white ${picked ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-300 cursor-not-allowed"}`}
          >
            Vincular
          </button>
        </div>
      </div>
    </div>
  );
}


const COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
];

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const hexToRgb = (hex) => {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
};

const rgbToHsl = ({ r, g, b }) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6;
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
        break;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return {
    h,
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
};

const hslToHex = ({ h, s, l }) => {
  const s1 = clamp(s, 0, 100) / 100;
  const l1 = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l1 - 1)) * s1;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l1 - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h >= 0 && h < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (h < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (h < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (h < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (h < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
};

const DocentesForm = () => {
  const initialState = {
    nombre: "",
    apellido: "",
    tipoProfesor: "",
    jornada: "",
    aulaId: "",
    cursosSeleccionados: [],
    color: "#60a5fa",
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
  const [version, setVersion] = useState(1);
  const [maxVersion, setMaxVersion] = useState(1);

  // Auditoría mini-badge
  const [ultimaEdicion, setUltimaEdicion] = useState(null);

  // Vinculación modal
  const [modalOpen, setModalOpen] = useState(false);
  const [docenteSeleccionado, setDocenteSeleccionado] = useState(null);
  const [loadingVincula, setLoadingVincula] = useState(false);

  const actualizarColorDocente = async (docenteId, colorHex) => {
    const { data, error } = await supabase
      .from("docentes")
      .update({ color: colorHex })
      .eq("id", docenteId)
      .select("id, color");
    if (error) {
      console.error("Error al actualizar color:", error);
      alert(`No se pudo actualizar el color. ${error.message || ""}`.trim());
      return;
    }
    if (!data || data.length === 0) {
      console.warn("Actualizacion de color sin filas devueltas.");
    }
    await cargarDocentes();
  };

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivelURL = params.get("nivel") || "Secundaria";
  const versionParam = Number(params.get("version")) || 1;

  // Carga inicial por nivel
  useEffect(() => {
    setVersion(versionParam);
    cargarDocentes();
    cargarAulas();
    cargarCursos();
  }, [nivelURL, versionParam]);

  useEffect(() => {
    cargarMaxVersion();
  }, [nivelURL]);

  useEffect(() => {
    cargarDocentes();
    cargarAulas();
    cargarCursos();
  }, [version]);

  // Sincronizar URL cuando cambia la version (evita saltos inesperados)
  useEffect(() => {
    const newParams = new URLSearchParams(location.search);
    newParams.set("version", String(version));
    if (newParams.toString() !== location.search.replace(/^\?/, "")) {
      window.history.replaceState(null, "", `${location.pathname}?${newParams.toString()}`);
    }
  }, [version, location.pathname, location.search]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const manejarClickFuera = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMostrarDropdown(false);
      }
    };
    document.addEventListener("mousedown", manejarClickFuera);
    return () => document.removeEventListener("mousedown", manejarClickFuera);
  }, []);

  // --- Fetchers ---
  const cargarDocentes = async () => {
    const { data, error } = await supabase
      .from("docentes")
      .select("*, aulas(nombre), docente_curso:docente_curso(curso_id, cursos(nombre))")
      .eq("nivel", nivelURL)
      .eq("version_num", version)
      .eq("activo", true)
      .order("apellido")
      .order("nombre");

    if (!error) setDocentes(data || []);
    else setDocentes([]);
  };

  const cargarAulas = async () => {
    const { data } = await supabase
      .from("aulas")
      .select()
      .eq("nivel", nivelURL)
      .eq("version_num", version)
      .eq("activo", true);
    setAulas(data || []);
  };

  const cargarCursos = async () => {
    const { data } = await supabase
      .from("cursos")
      .select("id, nombre")
      .eq("nivel", nivelURL)
      .eq("version_num", version)
      .eq("activo", true);
    setCursos(data || []);
  };

  const aulasOcupadas = docentes.map((d) => d.aula_id);

  // --- Handlers ---
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const toggleCursoSeleccionado = (id) => {
    const { cursosSeleccionados } = formData;
    const nuevosCursos = cursosSeleccionados.includes(id)
      ? cursosSeleccionados.filter((c) => c !== id)
      : [...cursosSeleccionados, id];
    setFormData((prev) => ({ ...prev, cursosSeleccionados: nuevosCursos }));
    if (errors.cursosSeleccionados) setErrors((prev) => ({ ...prev, cursosSeleccionados: null }));
  };

  const validateForm = () => {
    const newErrors = {};
  	if (formData.nombre.trim().length < 3) newErrors.nombre = "El nombre es muy corto.";
  	if (formData.apellido.trim().length < 3) newErrors.apellido = "El apellido es muy corto.";
  	if (!formData.tipoProfesor) newErrors.tipoProfesor = "Seleccione un tipo.";

  	const jornadaNum = parseInt(formData.jornada, 10);
  	if (isNaN(jornadaNum) || jornadaNum < 10 || jornadaNum > 40) newErrors.jornada = "Entre 10 y 40.";

  	if (!formData.aulaId) newErrors.aulaId = "Seleccione un aula.";
  	if (formData.cursosSeleccionados.length === 0) newErrors.cursosSeleccionados = "Seleccione al menos un curso.";

  	setErrors(newErrors);
  	return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const reportError = (error, action) => {
      if (!error) return false;
      console.error(`Error al ${action}:`, error);
      alert(`No se pudo ${action}. ${error.message || ""}`.trim());
      return true;
    };

    const payload = {
      nombre: formData.nombre.trim(),
      apellido: formData.apellido.trim(),
      tipo_profesor: formData.tipoProfesor,
      jornada_total: parseInt(formData.jornada, 10),
      aula_id: parseInt(formData.aulaId, 10),
      nivel: nivelURL,
      color: formData.color,
      version_num: version,
    };

    let docenteId = null;

    if (docenteEditandoId) {
      const { data, error } = await supabase
        .from("docentes")
        .update(payload)
        .eq("id", docenteEditandoId)
        .select("id");
      if (reportError(error, "actualizar el docente")) return;
      if (!data || data.length === 0) {
        alert("No se actualizo ningun docente. Verifica permisos o el id.");
        return;
      }
      docenteId = docenteEditandoId;
      const { error: errDel } = await supabase
        .from("docente_curso")
        .delete()
        .eq("docente_id", docenteId);
      if (reportError(errDel, "actualizar cursos del docente")) return;
    } else {
      const { data, error } = await supabase
        .from("docentes")
        .insert({ ...payload, activo: true })
        .select();
      if (reportError(error, "crear el docente")) return;
      if (data && data.length > 0) docenteId = data[0].id;
    }

    if (docenteId) {
      const registros = formData.cursosSeleccionados.map((cid) => ({
        docente_id: docenteId,
        curso_id: cid,
        nivel: nivelURL,
      }));
      const { error } = await supabase.from("docente_curso").insert(registros);
      if (reportError(error, "guardar cursos del docente")) return;
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
      jornada: (docente.jornada_total ?? "").toString(),
      aulaId: (docente.aula_id ?? "").toString(),
      cursosSeleccionados: docente.docente_curso?.map((dc) => dc.curso_id) || [],
      color: docente.color || "#60a5fa",
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
  	if (!window.confirm("¿Seguro que deseas desactivar este docente? No se eliminará permanentemente.")) return;

  	const { error } = await supabase.from("docentes").update({ activo: false }).eq("id", id);
  	if (error) alert("❌ Error al desactivar el docente.");
  	else cargarDocentes();
  };

  // --- Vincular cuenta por correo (busca en profiles) ---
  const abrirModalVincular = (docente) => {
  	setDocenteSeleccionado(docente);
  	setModalOpen(true);
  };

  // picked: { user_id, email } desde el modal
  const confirmarVinculacion = async (picked) => {
  	if (!picked?.user_id) return;
  	setLoadingVincula(true);
  	try {
  	  const { error: errUpd } = await supabase
  		.from("docentes")
  		.update({ user_id: picked.user_id })
  		.eq("id", docenteSeleccionado.id);

  	  if (errUpd) {
  		alert("❌ No se pudo vincular. Esa cuenta ya podría estar vinculada.");
  		return;
  	  }

  	  alert(`✅ Vinculado a ${picked.email}`);
  	  setModalOpen(false);
  	  setDocenteSeleccionado(null);
  	  cargarDocentes();
  	} catch (e) {
  	  console.error(e);
  	  alert("❌ Error al vincular la cuenta.");
  	} finally {
  	  setLoadingVincula(false);
  	}
  };

  const desvincularCuenta = async (docente) => {
  	if (!window.confirm("¿Desvincular la cuenta de este docente?")) return;
  	const { error } = await supabase.from("docentes").update({ user_id: null }).eq("id", docente.id);
  	if (error) alert("❌ Error al desvincular.");
  	else {
  	  alert("✅ Cuenta desvincular.");
  	  cargarDocentes();
  	}
  };

  const cargarMaxVersion = async () => {
    const { data, error } = await supabase
      .from("docentes")
      .select("version_num")
      .eq("nivel", nivelURL)
      .order("version_num", { ascending: false })
      .limit(1);

    if (!error && data?.length) {
      const maxV = data[0].version_num || 1;
      setMaxVersion(maxV);
      if (version > maxV) setVersion(maxV);
    } else {
      setMaxVersion(1);
      if (version != 1) setVersion(1);
    }
  };

  const copiarVersion = async () => {
    const nuevaVersion = maxVersion + 1;

    const { data: docentesBase, error } = await supabase
      .from("docentes")
      .select("*")
      .eq("nivel", nivelURL)
      .eq("version_num", version)
      .eq("activo", true);

    if (error || !docentesBase?.length) {
      alert("No hay docentes para copiar");
      return;
    }

    const copia = docentesBase.map(({ id, created_at, updated_at, ...rest }) => ({
      ...rest,
      version_num: nuevaVersion,
    }));

    const { error: errInsert } = await supabase.from("docentes").insert(copia);

    if (errInsert) {
      alert("Error al copiar versión");
      return;
    }

    alert(`Versión ${nuevaVersion} creada`);
    setMaxVersion(nuevaVersion);
    setVersion(nuevaVersion);
  };

  // --- Auditoría: última edición ---
useEffect(() => {
	const fetchUltimaEdicion = async () => {
	  const { data, error } = await supabase
		.from("audit_logs")
		.select("actor_email, created_at, table_name, operation")
		.in("table_name", ["docentes", "docente_curso"])
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
		  if (udata && udata[0]?.full_name) {
			registro = { ...registro, actor_name: udata[0].full_name };
		  }
		}
		setUltimaEdicion(registro);
	  }
	  else setUltimaEdicion(null);
	};
	fetchUltimaEdicion();
}, [nivelURL, docentes.length]);

  // Realtime opcional para el badge
  useEffect(() => {
  	const channel = supabase
  	  .channel("audit_docentes")
  	  .on(
  		"postgres_changes",
  		{
  		  event: "*",
  		  schema: "public",
  		  table: "audit_logs",
  		  filter: "table_name=in.(docentes,docente_curso)",
  		},
  		() => {
		  (async () => {
			const { data } = await supabase
			  .from("audit_logs")
			  .select("actor_email, created_at, table_name, operation")
			  .in("table_name", ["docentes", "docente_curso"])
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
				if (udata && udata[0]?.full_name) {
				  registro = { ...registro, actor_name: udata[0].full_name };
				}
			  }
			  setUltimaEdicion(registro);
			}
		  })();
		}
	  )
	  .subscribe();

  	return () => {
  	  try { supabase.removeChannel(channel); } catch {}
  	};
  }, []);

  return (
  	<div className="p-4 max-w-7xl mx-auto">
  	  <Breadcrumbs />

  	  {/* ➜ más espacio debajo del menú/breadcrumbs */}
      <div className="mt-4 mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl md:text-2xl font-semibold text-slate-800 flex items-center gap-2">
          <span className="inline-flex items-center justify-center rounded-lg sm:rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-200 size-10">
            <UserPlus className="size-6" aria-hidden="true" />
          </span>
          <span>Registrar Docente — {nivelURL}</span>
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Versión</span>
            <select
              value={version}
              onChange={(e) => setVersion(Number(e.target.value))}
              className="border rounded-md px-2 py-1 text-sm"
            >
              {Array.from({ length: maxVersion }, (_, i) => i + 1).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={copiarVersion}
            className="px-3 py-1.5 rounded-md bg-slate-600 text-white text-sm hover:bg-slate-700 w-full sm:w-auto"
          >
            Crear copia
          </button>
          <LastEditPill edit={ultimaEdicion} />
        </div>
      </div>

  	  {/* Formulario */}
  	  <form
  		className="mt-4 bg-white p-4 rounded-md sm:rounded-lg border shadow-sm mb-6 flex flex-wrap gap-4 items-start"
  		onSubmit={handleSubmit}
  	  >
  		{["nombre", "apellido"].map((field) => (
  		  <div key={field} className="flex flex-col">
  			<label htmlFor={field} className="mb-1 text-sm font-medium text-gray-700 capitalize">
  			  {field}
  			</label>
  			<input
  			  id={field}
  			  name={field}
  			  type="text"
  			  placeholder={`Ingrese ${field}`}
  			  value={formData[field]}
  			  onChange={handleInputChange}
  			  className={`border px-3 py-2 rounded-md w-48 ${errors[field] ? "border-red-500" : "border-gray-300"}`}
  			/>
  			{errors[field] && <p className="text-red-600 text-xs mt-1">{errors[field]}</p>}
  		  </div>
  		))}

  		<div className="flex flex-col">
  		  <label htmlFor="tipoProfesor" className="mb-1 text-sm font-medium text-gray-700">
  			Tipo
  		  </label>
  		  <select
  			name="tipoProfesor"
  			value={formData.tipoProfesor}
  			onChange={handleInputChange}
  			className={`border px-3 py-2 rounded-md w-48 ${errors.tipoProfesor ? "border-red-500" : "border-gray-300"}`}
  		  >
  			<option value="">Seleccione...</option>
  			<option value="Contratado">Contratado</option>
  			<option value="Nombrado">Nombrado</option>
  		  </select>
  		  {errors.tipoProfesor && <p className="text-red-600 text-xs mt-1">{errors.tipoProfesor}</p>}
  		</div>

  		<div className="flex flex-col">
  		  <label htmlFor="jornada" className="mb-1 text-sm font-medium text-gray-700">
  			Horas
  		  </label>
  		  <input
  			type="number"
  			name="jornada"
  			placeholder="Ej: 30"
  			value={formData.jornada}
  			onChange={handleInputChange}
  			className={`border px-3 py-2 rounded-md w-24 ${errors.jornada ? "border-red-500" : "border-gray-300"}`}
  		  />
  		  {errors.jornada && <p className="text-red-600 text-xs mt-1">{errors.jornada}</p>}
  		</div>

  		<div className="flex flex-col">
  		  <label htmlFor="aulaId" className="mb-1 text-sm font-medium text-gray-700">
  			Aula
  		  </label>
  		  <select
  			name="aulaId"
  			value={formData.aulaId}
  			onChange={handleInputChange}
  			className={`border px-3 py-2 rounded-md w-48 ${errors.aulaId ? "border-red-500" : "border-gray-300"}`}
  		  >
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
  		  <button
  			type="button"
  			onClick={() => setMostrarDropdown(!mostrarDropdown)}
  			className={`border px-3 py-2 rounded-md w-48 text-left ${errors.cursosSeleccionados ? "border-red-500" : "border-gray-300"}`}
  		  >
  			{formData.cursosSeleccionados.length > 0 ? `${formData.cursosSeleccionados.length} seleccionados` : "Seleccione..."}
  		  </button>
  		  {errors.cursosSeleccionados && <p className="text-red-600 text-xs mt-1">{errors.cursosSeleccionados}</p>}
  		  {mostrarDropdown && (
  			<div className="absolute top-full z-10 mt-1 max-h-52 overflow-auto border bg-white rounded shadow w-48">
  			  {cursos.map((curso) => (
  				<label key={curso.id} className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer">
  				  <input
  					type="checkbox"
  					className="mr-2"
  					checked={formData.cursosSeleccionados.includes(curso.id)}
  					onChange={() => toggleCursoSeleccionado(curso.id)}
  				  />
  				  {curso.nombre}
  				</label>
  			  ))}
  			</div>
  		  )}
  		</div>

        <div className="flex flex-col">
          <label htmlFor="color" className="mb-1 text-sm font-medium text-gray-700">
            Color representativo
          </label>
          {(() => {
            const hsl = rgbToHsl(hexToRgb(formData.color));
            const updateHsl = (next) => {
              const merged = { ...hsl, ...next };
              const hex = hslToHex(merged);
              setFormData((prev) => ({ ...prev, color: hex }));
            };
            return (
              <>
                <div className="flex items-center gap-3">
                  <input
                    id="color"
                    name="color"
                    type="color"
                    value={formData.color}
                    onChange={handleInputChange}
                    className="h-10 w-14 rounded-md border border-gray-300 bg-white p-1"
                    aria-label="Color representativo"
                  />
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, color: hex }))}
                        className={`h-7 w-7 rounded-full border ${
                          formData.color === hex ? "ring-2 ring-blue-500" : "border-gray-200"
                        }`}
                        style={{ backgroundColor: hex }}
                        aria-label={`Usar color ${hex}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  <label className="text-xs text-gray-500">Tono</label>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={hsl.h}
                    onChange={(e) => updateHsl({ h: Number(e.target.value) })}
                  />
                  <label className="text-xs text-gray-500">Saturacion</label>
                  <input
                    type="range"
                    min="30"
                    max="100"
                    value={hsl.s}
                    onChange={(e) => updateHsl({ s: Number(e.target.value) })}
                  />
                  <label className="text-xs text-gray-500">Claridad</label>
                  <input
                    type="range"
                    min="30"
                    max="85"
                    value={hsl.l}
                    onChange={(e) => updateHsl({ l: Number(e.target.value) })}
                  />
                </div>
              </>
            );
          })()}
        </div>

        <div className="flex items-end gap-2 pt-6">
          <button
            type="submit"
            className={`${modoEdicion ? "bg-yellow-500 hover:bg-yellow-full sm:w-600" : "bg-blue-600 hover:bg-blue-700"} text-white px-4 py-2 rounded-md font-semibold`}
  		  >
  			{modoEdicion ? "Guardar Cambios" : "Agregar Docente"}
  		  </button>
  		  {modoEdicion && (
  			<button type="button" onClick={cancelarEdicion} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md font-semibold">
  			  Cancelar
  			</button>
  		  )}
  		</div>
  	  </form>

  	  {/* Tabla de docentes */}
  	  <div className="overflow-x-auto">
  		<table className="w-full text-sm border-collapse">
  		  <thead className="bg-gray-100 text-left">
  			<tr>
  			  <th className="border-b px-4 py-1.5 sm:py-2.5 lg:py-3">Nombre</th>
  			  <th className="border-b px-4 py-1.5 sm:py-2.5 lg:py-3">Apellido</th>
  			  <th className="border-b px-4 py-1.5 sm:py-2.5 lg:py-3">Tipo</th>
  			  <th className="border-b px-4 py-1.5 sm:py-2.5 lg:py-3 text-center">Horas</th>
  			  <th className="border-b px-4 py-1.5 sm:py-2.5 lg:py-3">Aula</th>
			  <th className="border-b px-4 py-1.5 sm:py-2.5 lg:py-3">Especialidades</th>
			  <th className="border-b px-4 py-1.5 sm:py-2.5 lg:py-3 text-center">Color</th>
			  <th className="border-b px-4 py-1.5 sm:py-2.5 lg:py-3 text-center">Acciones</th>
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
				  <div className="flex items-center justify-center gap-2">
					<input
					  type="color"
					  value={d.color || "#e5e7eb"}
					  onChange={(e) => actualizarColorDocente(d.id, e.target.value)}
					  className="h-7 w-7 rounded-md border border-gray-300 bg-white p-0.5"
					  aria-label={`Color para ${d.nombre}`}
					/>
					<details className="relative">
					  <summary className="cursor-pointer text-xs text-blue-600 select-none">
						Paleta
					  </summary>
					  <div className="absolute right-0 z-10 mt-2 grid grid-cols-6 gap-1 rounded-lg border bg-white p-2 shadow">
						{COLOR_PRESETS.map((hex) => (
						  <button
							key={hex}
							type="button"
							onClick={() => actualizarColorDocente(d.id, hex)}
							className="h-5 w-5 rounded-full border border-gray-200"
							style={{ backgroundColor: hex }}
							aria-label={`Usar color ${hex}`}
						  />
						))}
					  </div>
					</details>
				  </div>
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
  			{docentes.length === 0 && (
  			  <tr>
				<td className="px-4 py-6 text-center text-gray-500" colSpan={8}>
  				  No hay docentes activos en {nivelURL}.
  				</td>
  			  </tr>
  			)}
  		  </tbody>
  		</table>
  	  </div>

  	  {/* Modal para vincular */}
  	  <VincularCuentaModal
  		open={modalOpen}
  		onClose={() => { if (!loadingVincula) setModalOpen(false); }}
  		onConfirm={confirmarVinculacion}
  		docente={docenteSeleccionado}
  	  />
  	</div>
  );
};

export default DocentesForm;

