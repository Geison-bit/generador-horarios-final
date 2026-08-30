import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, CheckCircle2, Loader2, Pencil, Save, Sparkles, Trash2, X } from "lucide-react";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import {
  cargarReglasIA,
  extraerReglasConIA,
  guardarReglasIA,
} from "../../services/reglasIAService";

const ejemplos = [
  "Regla dura: los cursos de 6 horas pueden dividirse en 2+2+2 o en 3+3, en días distintos.",
  "Regla suave: procurar que Educación Física se dicte en los tres primeros bloques.",
];

const estiloDureza = (dureza) => dureza === "soft"
  ? "border-sky-200 bg-sky-50 text-sky-800"
  : "border-rose-200 bg-rose-50 text-rose-800";

const nombreDureza = (dureza) => dureza === "soft" ? "Suave" : "Dura";
const durezaConfigurable = (tipo) => ![
  "no_solape_docente",
  "sesiones_consecutivas",
  "excluir_carga_una_hora",
  "disponibilidad_docente",
].includes(tipo);

const claveRegla = (regla) => {
  if (regla.tipo === "division_horas") {
    const incluidos = [...(regla.cursos || [])].map((item) => item.toLowerCase()).sort().join("|");
    const excluidos = [...(regla.excepto_cursos || [])].map((item) => item.toLowerCase()).sort().join("|");
    return `division_horas:${Number(regla.total_horas || 0)}:in=${incluidos}:out=${excluidos}`;
  }
  if (regla.tipo === "limite_materia_dia") return "limite_materia_dia";
  if (regla.tipo === "limite_docente_grado_dia") return "limite_docente_grado_dia";
  if (regla.tipo === "bloque_unico_docente_grado_dia") return "bloque_unico_docente_grado_dia";
  if (regla.tipo === "evitar_huecos_docente") return "evitar_huecos_docente";
  if (regla.tipo === "preferencia_franja_curso") {
    const cursos = [...(regla.cursos || [])].map((item) => item.toLowerCase()).sort().join("|");
    return `preferencia_franja_curso:${cursos}`;
  }
  return `${regla.tipo}:${regla.texto_original || regla.id}`;
};

const acumularReglas = (actuales, nuevas) => {
  const resultado = [...actuales];
  nuevas.forEach((nueva) => {
    const clave = claveRegla(nueva);
    const indice = resultado.findIndex((regla) => claveRegla(regla) === clave);
    if (indice >= 0) resultado[indice] = nueva;
    else resultado.push(nueva);
  });
  return resultado;
};

const resumenPatrones = (regla) => {
  if (regla.tipo !== "division_horas") return "";
  const patrones = regla.patrones?.length ? regla.patrones : (regla.patron ? [regla.patron] : []);
  const incluidos = regla.cursos?.length ? ` solo para ${regla.cursos.join(", ")}` : "";
  const excluidos = regla.excepto_cursos?.length ? ` excepto ${regla.excepto_cursos.join(", ")}` : "";
  return `${regla.total_horas} horas${incluidos}${excluidos} → ${patrones.map((patron) => patron.join("+")).join(" o ")}`;
};

const resumenPreferenciaFranja = (regla) => {
  const cursos = regla.cursos?.length ? regla.cursos.join(", ") : "Curso sin identificar";
  const bloques = regla.bloques_preferidos?.length ? regla.bloques_preferidos.join(", ") : "sin bloques";
  return `${cursos} → preferir bloques ${bloques}`;
};

export default function ReglasIAForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const nivel = params.get("nivel") || "Secundaria";
  const editarDesdePanel = params.get("editar");
  const version = 1;
  const [texto, setTexto] = useState("");
  const [reglas, setReglas] = useState([]);
  const [contradicciones, setContradicciones] = useState([]);
  const [analizando, setAnalizando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [durezaPreferida, setDurezaPreferida] = useState("auto");
  const [mensaje, setMensaje] = useState("");
  const ejecutables = useMemo(() => reglas.filter((r) => r.estado === "ejecutable").length, [reglas]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setMensaje("");
    cargarReglasIA(nivel, version)
      .then((data) => {
        if (vigente) {
          setReglas(data);
          const reglaEditar = editarDesdePanel ? data.find((regla) => regla.id === editarDesdePanel) : null;
          if (reglaEditar) {
            setEditandoId(reglaEditar.id);
            setTexto(reglaEditar.texto_original || "");
            setDurezaPreferida(reglaEditar.dureza === "soft" ? "soft" : "hard");
          }
        }
      })
      .catch((error) => {
        if (vigente) setMensaje(error.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => { vigente = false; };
  }, [nivel, version, editarDesdePanel]);

  const analizar = async () => {
    if (!texto.trim()) return;
    setAnalizando(true);
    setMensaje("");
    try {
      const resultado = await extraerReglasConIA({ texto: texto.trim(), nivel, version });
      const nuevas = (resultado.reglas || []).map((regla, index) => ({
        ...regla,
        dureza: durezaPreferida === "auto" || !durezaConfigurable(regla.tipo)
          ? regla.dureza
          : durezaPreferida,
        id: `${Date.now()}-${index}`,
        activa: regla.estado === "ejecutable",
      }));
      setReglas((actuales) => {
        const base = editandoId ? actuales.filter((regla) => regla.id !== editandoId) : actuales;
        return acumularReglas(base, nuevas);
      });
      setContradicciones(resultado.contradicciones || []);
      setEditandoId(null);
      setDurezaPreferida("auto");
    } catch (error) {
      setMensaje(error.message);
    } finally {
      setAnalizando(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje("");
    try {
      const guardadas = await guardarReglasIA(nivel, version, reglas);
      setReglas(guardadas);
      const totalActivas = guardadas.filter(
        (regla) => regla.estado === "ejecutable" && regla.activa !== false
      ).length;
      setMensaje(`Se guardaron ${totalActivas} reglas activas en Supabase para ${nivel}.`);
      navigate(`/reglas-ia?nivel=${nivel}`, { replace: true });
    } catch (error) {
      setMensaje(error.message);
    } finally {
      setGuardando(false);
    }
  };

  const toggle = (id) => {
    setReglas((actuales) => actuales.map((r) => (r.id === id ? { ...r, activa: !r.activa } : r)));
  };

  const cambiarDureza = (id, dureza) => {
    setReglas((actuales) => actuales.map((regla) =>
      regla.id === id ? { ...regla, dureza } : regla
    ));
  };

  const editarRegla = (regla) => {
    setEditandoId(regla.id);
    setTexto(regla.texto_original || "");
    setDurezaPreferida(regla.dureza === "soft" ? "soft" : "hard");
    setMensaje("Edita el texto y vuelve a formalizar la regla.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setTexto("");
    setDurezaPreferida("auto");
    setMensaje("");
    navigate(`/reglas-ia?nivel=${nivel}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <Breadcrumbs />
      <header className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-700 p-2 text-white"><Bot className="size-6" /></span>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Reglas del colegio con IA</h1>
            <p className="mt-1 text-sm text-slate-600">
              Escribe las reglas en lenguaje natural. Revisa y aprueba la formalización antes de usarla en CP-SAT.
            </p>
            <p className="mt-2 text-xs font-medium text-violet-700">Nivel {nivel}</p>
          </div>
        </div>
      </header>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="reglas-colegio" className="text-sm font-semibold text-slate-800">{editandoId ? "Editar regla" : "Documento o reglas"}</label>
            {editandoId && <button onClick={cancelarEdicion} className="inline-flex items-center gap-1 text-xs text-slate-600"><X className="size-4" /> Cancelar edición</button>}
          </div>
          <textarea
            id="reglas-colegio"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={12}
            placeholder={ejemplos.join("\n")}
            className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-600"
          />
          <fieldset className="mt-3">
            <legend className="text-xs font-semibold text-slate-700">Dureza que deseas para esta regla</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                ["auto", "Sugerida por IA"],
                ["hard", "Dura"],
                ["soft", "Suave"],
              ].map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setDurezaPreferida(valor)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${durezaPreferida === valor
                    ? valor === "soft" ? "border-sky-400 bg-sky-100 text-sky-900"
                      : valor === "hard" ? "border-rose-400 bg-rose-100 text-rose-900"
                        : "border-violet-400 bg-violet-100 text-violet-900"
                    : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Dura: obligatoria. Suave: el solver intentará cumplirla, pero podrá incumplirla para encontrar un horario.
            </p>
          </fieldset>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Gemini extrae; el sistema valida y CP-SAT ejecuta solo plantillas conocidas.</p>
            <button
              onClick={analizar}
              disabled={analizando || !texto.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {analizando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {analizando ? "Analizando..." : editandoId ? "Actualizar formalización" : "Extraer y formalizar"}
            </button>
          </div>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-800">Plantillas ejecutables en esta etapa</h2>
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <b>División de carga</b><p className="text-slate-600">Ejemplo: 6 horas → 2+2+2.</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <b>Máximo diario por materia</b><p className="text-slate-600">Ejemplo: máximo 2 horas al día.</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <b>Máximo por docente y grado</b><p className="text-slate-600">Ejemplo: hasta 3 horas al mismo grado por día.</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <b>Periodo continuo</b><p className="text-slate-600">Evita que un docente se retire y regrese al mismo grado durante el día.</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <b>Compactación flexible</b><p className="text-slate-600">Minimiza huecos en la jornada del docente sin volver infactible el horario.</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <b>Preferencia de franja por curso</b><p className="text-slate-600">Prioriza cualquier curso en bloques concretos sin volver infactible el horario.</p>
            </div>
          </div>
        </aside>
      </section>

      {contradicciones.length > 0 && (
        <section className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <h2 className="font-semibold text-rose-800">Posibles contradicciones</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
            {contradicciones.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}
          </ul>
        </section>
      )}

      <section className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div><h2 className="font-semibold text-slate-800">Reglas formalizadas</h2><p className="text-xs text-slate-500">{ejecutables} ejecutables de {reglas.length} extraídas</p></div>
          <button onClick={guardar} disabled={!reglas.length || guardando} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {guardando ? "Guardando en Supabase..." : "Aprobar y guardar"}
          </button>
        </header>
        <div className="divide-y divide-slate-200">
          {cargando && <p className="p-6 text-center text-sm text-slate-500">Cargando reglas desde Supabase...</p>}
          {!cargando && !reglas.length && <p className="p-6 text-center text-sm text-slate-500">Todavía no hay reglas guardadas.</p>}
          {reglas.map((regla) => (
            <article key={regla.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${regla.estado === "ejecutable" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{regla.estado}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${estiloDureza(regla.dureza)}`}>{nombreDureza(regla.dureza)}</span>
                    <span className="text-xs text-slate-500">{regla.tipo}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-800">{regla.texto_original}</p>
                  {regla.tipo === "division_horas" && <p className="mt-1 text-sm font-semibold text-violet-700">{resumenPatrones(regla)}</p>}
                  {regla.tipo === "preferencia_franja_curso" && <p className="mt-1 text-sm font-semibold text-violet-700">{resumenPreferenciaFranja(regla)}</p>}
                  <p className="mt-1 text-sm text-slate-600">{regla.formalizacion}</p>
                  {regla.ambiguedad && regla.ambiguedad.toLowerCase() !== "ninguna" && <p className="mt-1 text-xs text-amber-700">Revisión: {regla.ambiguedad}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {regla.estado === "ejecutable" && durezaConfigurable(regla.tipo) && (
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" aria-label="Cambiar dureza de la regla">
                      <button type="button" onClick={() => cambiarDureza(regla.id, "hard")} className={`rounded-md px-2 py-1 text-xs font-semibold ${regla.dureza !== "soft" ? "bg-rose-100 text-rose-800 shadow-sm" : "text-slate-500"}`}>Dura</button>
                      <button type="button" onClick={() => cambiarDureza(regla.id, "soft")} className={`rounded-md px-2 py-1 text-xs font-semibold ${regla.dureza === "soft" ? "bg-sky-100 text-sky-800 shadow-sm" : "text-slate-500"}`}>Suave</button>
                    </div>
                  )}
                  {regla.estado === "ejecutable" && !durezaConfigurable(regla.tipo) && (
                    <span title="Es una condición estructural necesaria para que el horario sea válido" className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">Dureza fija</span>
                  )}
                  {regla.estado === "ejecutable" && (
                    <button onClick={() => toggle(regla.id)} title={regla.activa ? "Desactivar" : "Activar"} className={regla.activa ? "text-emerald-600" : "text-slate-400"}><CheckCircle2 className="size-5" /></button>
                  )}
                  <button onClick={() => editarRegla(regla)} title="Editar regla" className="text-blue-600"><Pencil className="size-5" /></button>
                  <button onClick={() => setReglas((items) => items.filter((r) => r.id !== regla.id))} title="Eliminar" className="text-rose-600"><Trash2 className="size-5" /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      {mensaje && <p className={`mt-4 rounded-lg p-3 text-sm ${mensaje.startsWith("Se guardaron") ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{mensaje}</p>}
    </div>
  );
}
