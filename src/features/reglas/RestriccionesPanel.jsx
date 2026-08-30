import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, CalendarDays, CheckCircle2, Loader2, Pencil, Plus, Save, ShieldCheck, XCircle } from "lucide-react";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import { cargarReglasIA, guardarReglasIA } from "../../services/reglasIAService";
import { supabase } from "../../supabaseClient";

const descripcionParametros = (regla) => {
  if (regla.tipo === "division_horas") {
    const patrones = regla.patrones?.length ? regla.patrones : (regla.patron ? [regla.patron] : []);
    const incluidos = regla.cursos?.length ? ` solo para ${regla.cursos.join(", ")}` : "";
    const excluidos = regla.excepto_cursos?.length ? ` excepto ${regla.excepto_cursos.join(", ")}` : "";
    return `${regla.total_horas} horas semanales${incluidos}${excluidos} → ${patrones.map((patron) => patron.join("+")).join(" o ")}`;
  }
  if (regla.tipo === "limite_materia_dia") {
    return `Máximo ${regla.maximo} horas de una materia en el mismo día`;
  }
  if (regla.tipo === "limite_docente_grado_dia") {
    return `Máximo ${regla.maximo} horas del docente con el mismo grado o sección por día`;
  }
  if (regla.tipo === "bloque_unico_docente_grado_dia") {
    return "Un único periodo continuo por docente, grado o sección y día";
  }
  if (regla.tipo === "no_solape_docente") return "El docente no puede impartir dos clases al mismo tiempo";
  if (regla.tipo === "sesiones_consecutivas") return "Las sesiones de dos o tres horas usan bloques consecutivos";
  if (regla.tipo === "excluir_carga_una_hora") return "Excluye cursos cuya carga semanal total sea de una hora";
  if (regla.tipo === "evitar_huecos_docente") return "Preferencia flexible: minimizar huecos en la jornada del docente";
  if (regla.tipo === "preferencia_franja_curso") {
    const cursos = regla.cursos?.length ? regla.cursos.join(", ") : "Curso sin identificar";
    const bloques = regla.bloques_preferidos?.length ? regla.bloques_preferidos.join(", ") : "sin bloques";
    return `${cursos}: preferir bloques ${bloques}`;
  }
  return regla.tipo;
};

const estiloDureza = (dureza) => dureza === "soft"
  ? "border-sky-200 bg-sky-50 text-sky-800"
  : "border-rose-200 bg-rose-50 text-rose-800";

const nombreDureza = (dureza) => dureza === "soft" ? "Suave" : "Dura";

export default function RestriccionesPanel() {
  const navigate = useNavigate();
  const params = new URLSearchParams(useLocation().search);
  const nivel = params.get("nivel") || "Secundaria";
  const version = 1;

  const [reglas, setReglas] = useState([]);
  const [disponibilidades, setDisponibilidades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const activas = useMemo(
    () => disponibilidades.filter((docente) => docente.disponibilidad_activa !== false).length
      + reglas.filter((regla) => regla.estado === "ejecutable" && regla.activa !== false).length,
    [disponibilidades, reglas]
  );
  const resumenDureza = useMemo(() => ({
    duras: reglas.filter((regla) => regla.estado === "ejecutable" && regla.activa !== false && regla.dureza !== "soft").length
      + disponibilidades.filter((docente) => docente.disponibilidad_activa !== false).length,
    suaves: reglas.filter((regla) => regla.estado === "ejecutable" && regla.activa !== false && regla.dureza === "soft").length,
  }), [disponibilidades, reglas]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setMensaje("");

    const cargarDisponibilidades = async () => {
      const [docentesResp, disponibilidadResp] = await Promise.all([
        supabase
          .from("docentes")
          .select("id,nombre,apellido")
          .eq("nivel", nivel)
          .eq("version_num", version)
          .eq("activo", true)
          .order("apellido")
          .order("nombre"),
        supabase
          .from("restricciones_docente")
          .select("docente_id,dia,bloque")
          .eq("nivel", nivel)
          .eq("version_num", version),
      ]);
      if (docentesResp.error) throw docentesResp.error;
      if (disponibilidadResp.error) throw disponibilidadResp.error;

      const bloquesPorDocente = new Map();
      (disponibilidadResp.data || []).forEach((fila) => {
        const docenteId = String(fila.docente_id);
        const bloques = bloquesPorDocente.get(docenteId) || new Set();
        bloques.add(`${fila.dia}-${fila.bloque}`);
        bloquesPorDocente.set(docenteId, bloques);
      });

      return (docentesResp.data || [])
        .map((docente) => ({
          ...docente,
          bloques_disponibles: bloquesPorDocente.get(String(docente.id))?.size || 0,
        }))
        .filter((docente) => docente.bloques_disponibles > 0);
    };

    Promise.all([cargarReglasIA(nivel, version), cargarDisponibilidades()])
      .then(([todasLasReglas, reglasDisponibilidad]) => {
        if (vigente) {
          const reglasSistema = todasLasReglas.filter((regla) => regla.tipo === "disponibilidad_docente");
          const estadoPorDocente = new Map(
            reglasSistema.map((regla) => [String(regla.docente_id), regla.activa !== false])
          );
          setReglas(todasLasReglas.filter((regla) => regla.tipo !== "disponibilidad_docente"));
          setDisponibilidades(reglasDisponibilidad.map((docente) => ({
            ...docente,
            disponibilidad_activa: estadoPorDocente.get(String(docente.id)) !== false,
          })));
        }
      })
      .catch((error) => {
        if (vigente) setMensaje(error.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => { vigente = false; };
  }, [nivel, version]);

  const toggleRegla = (id) => {
    setReglas((actuales) => actuales.map((regla) =>
      regla.id === id && regla.estado === "ejecutable"
        ? { ...regla, activa: regla.activa === false }
        : regla
    ));
  };

  const setDisponibilidadActiva = (id, activa) => {
    setDisponibilidades((actuales) => actuales.map((docente) =>
      docente.id === id
        ? { ...docente, disponibilidad_activa: activa }
        : docente
    ));
  };

  const aplicarTodas = () => {
    setDisponibilidades((actuales) => actuales.map((docente) => ({
      ...docente,
      disponibilidad_activa: true,
    })));
    setReglas((actuales) => actuales.map((regla) => ({
      ...regla,
      activa: regla.estado === "ejecutable",
    })));
  };

  const noAplicarTodas = () => {
    setDisponibilidades((actuales) => actuales.map((docente) => ({
      ...docente,
      disponibilidad_activa: false,
    })));
    setReglas((actuales) => actuales.map((regla) => ({ ...regla, activa: false })));
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje("");
    try {
      const reglasDisponibilidad = disponibilidades.map((docente) => ({
        nivel,
        texto_original: `Disponibilidad de ${docente.nombre} ${docente.apellido || ""}`.trim(),
        tipo: "disponibilidad_docente",
        dureza: "hard",
        formalizacion: `${docente.bloques_disponibles} bloques disponibles registrados en la matriz visual.`,
        estado: "ejecutable",
        activa: docente.disponibilidad_activa !== false,
        fuente: "sistema",
        docente_id: docente.id,
      }));
      const guardadas = await guardarReglasIA(nivel, version, [...reglas, ...reglasDisponibilidad]);
      setReglas(guardadas.filter((regla) => regla.tipo !== "disponibilidad_docente"));
      setMensaje("Cambios guardados en Supabase y listos para CP-SAT.");
    } catch (error) {
      setMensaje(error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4">
      <Breadcrumbs />

      <div className="mt-4 mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800 md:text-2xl">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-200">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </span>
            Reglas del colegio aplicadas
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Nivel <b>{nivel}</b> · {activas} reglas activas
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">{resumenDureza.duras} duras</span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-800">{resumenDureza.suaves} suaves</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={aplicarTodas} disabled={cargando || (!reglas.length && !disponibilidades.length)} className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">
            Aplicar todas
          </button>
          <button onClick={noAplicarTodas} disabled={cargando || (!reglas.length && !disponibilidades.length)} className="rounded bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50">
            No aplicar todas
          </button>
          <button onClick={guardar} disabled={cargando || guardando || (!reglas.length && !disponibilidades.length)} className="inline-flex items-center gap-2 rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
          <button onClick={() => navigate(`/reglas-ia?nivel=${nivel}`)} className="inline-flex items-center gap-2 rounded border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-800">
            <Plus className="size-4" /> Nueva regla
          </button>
          <button onClick={() => navigate(-1)} className="rounded border px-3 py-2 text-sm">Cerrar</button>
        </div>
      </div>

      {mensaje && (
        <div className={`mb-4 rounded border px-3 py-2 text-sm ${mensaje.startsWith("Cambios guardados") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {mensaje}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b bg-slate-50 px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Bot className="size-5 text-violet-700" /> Reglas creadas con IA y registradas por el sistema</h2>
          <p className="text-xs text-slate-500">Las reglas IA se formalizan en reglas_ia; la disponibilidad procede de la matriz visual de cada docente.</p>
        </header>

        {cargando && <p className="p-8 text-center text-sm text-slate-500">Cargando reglas desde Supabase...</p>}
        {!cargando && reglas.length === 0 && disponibilidades.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-600">Todavía no hay reglas aprobadas para {nivel}.</p>
            <button onClick={() => navigate(`/reglas-ia?nivel=${nivel}`)} className="mt-3 inline-flex items-center gap-2 rounded bg-violet-700 px-4 py-2 text-sm text-white">
              <Plus className="size-4" /> Crear primera regla
            </button>
          </div>
        )}

        <ul className="divide-y divide-slate-200">
          {disponibilidades.map((docente) => {
            const activa = docente.disponibilidad_activa !== false;
            return (
            <li key={`disponibilidad-${docente.id}`} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">sistema</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${estiloDureza("hard")}`}>Dura</span>
                  <span className="text-xs text-slate-500">disponibilidad_docente</span>
                </div>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CalendarDays className="size-4 text-blue-600" />
                  Disponibilidad de {docente.nombre} {docente.apellido || ""}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {activa
                    ? `Se aplicarán los ${docente.bloques_disponibles} bloques disponibles registrados en la matriz visual.`
                    : "La matriz permanece guardada, pero no se aplicará al generar el horario."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => navigate(`/restricciones?nivel=${nivel}&docente=${docente.id}`)} className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  <Pencil className="size-4" /> Editar
                </button>
                <button
                  onClick={() => setDisponibilidadActiva(docente.id, true)}
                  disabled={cargando || guardando}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${activa ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-white text-slate-500"} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <CheckCircle2 className="size-4" /> Aplica
                </button>
                <button
                  onClick={() => setDisponibilidadActiva(docente.id, false)}
                  disabled={cargando || guardando}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${!activa ? "border-rose-300 bg-rose-100 text-rose-800" : "border-slate-200 bg-white text-slate-500"} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <XCircle className="size-4" /> No aplica
                </button>
              </div>
            </li>
            );
          })}
          {reglas.map((regla) => {
            const activa = regla.estado === "ejecutable" && regla.activa !== false;
            return (
              <li key={regla.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${regla.estado === "ejecutable" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{regla.estado}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${estiloDureza(regla.dureza)}`}>{nombreDureza(regla.dureza)}</span>
                    <span className="text-xs text-slate-500">{regla.tipo}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{regla.texto_original}</p>
                  <p className="mt-1 text-sm font-medium text-violet-700">{descripcionParametros(regla)}</p>
                  <p className="mt-1 text-sm text-slate-600">{regla.formalizacion}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => navigate(`/reglas-ia?nivel=${nivel}&editar=${regla.id}`)} className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    <Pencil className="size-4" /> Editar
                  </button>
                  <button
                    onClick={() => toggleRegla(regla.id)}
                    disabled={cargando || guardando || regla.estado !== "ejecutable"}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${activa ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <CheckCircle2 className="size-4" /> {activa ? "Aplica" : "No aplica"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-4 text-xs text-slate-500">
        Las restricciones estructurales obligatorias permanecen dentro del modelo CP-SAT y no se editan desde esta pantalla.
      </p>
    </div>
  );
}
