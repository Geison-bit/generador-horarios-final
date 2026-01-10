// src/components/RestriccionesForm.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Calendar as RBCalendar, dateFnsLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import es from "date-fns/locale/es";
import { supabase } from "../supabaseClient";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import Breadcrumbs from "./Breadcrumbs";
import { CalendarDays, History, Loader2, Save, Users } from "lucide-react";

const locales = { es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

// ----------------- utils -----------------
const normalize = (s) =>
  (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const toHHMM = (t) => {
  if (t == null) return "";
  const s = String(t); // "07:15:00" o "07:15"
  return s.length >= 5 ? s.slice(0, 5) : s;
};
const toMinutes = (hhmm) => {
  const [h, m] = toHHMM(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const DIAS_UI = ["lunes", "martes", "miércoles", "jueves", "viernes"];

const getDiaIndexFromStr = (diaStr) => {
  const n = normalize(diaStr);
  const normList = ["lunes", "martes", "miercoles", "jueves", "viernes"];
  return normList.indexOf(n);
};

// Pill Última edición
const LastEditPill = ({ edit }) => {
  const actorNombre =
    edit?.actor_name || edit?.actor_full_name || edit?.actor_email || "Desconocido";
  const fecha = edit?.created_at ? new Date(edit.created_at).toLocaleString() : "—";
  return (
    <div className="flex items-center gap-2 text-xs px-3 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 shadow-sm">
      <History className="w-4 h-4" />
      <span>
        <span className="text-slate-600">Última edición:</span> <b>{actorNombre}</b> · {fecha}
      </span>
    </div>
  );
};

const RestriccionesForm = () => {
  const [docentes, setDocentes] = useState([]);
  const [docenteSeleccionado, setDocenteSeleccionado] = useState("");
  const [eventos, setEventos] = useState([]);
  const [bloquesHorario, setBloquesHorario] = useState([]);
  const [bloqueOneBased, setBloqueOneBased] = useState(false); // detecta si la tabla usa 1-based

  // ✅ usar el setter nuevo del contexto
  const { setDisponibilidadDocente } = useDocentes();

  const [ultimaEdicion, setUltimaEdicion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cargando, setCargando] = useState(false);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivelURL = params.get("nivel") || "Secundaria";

  // --------- cargar docentes ---------
  useEffect(() => {
    const cargarDocentes = async () => {
      const { data } = await supabase
        .from("docentes")
        .select("id, nombre")
        .eq("nivel", nivelURL)
        .eq("activo", true);
      setDocentes(data || []);
    };
    cargarDocentes();
  }, [nivelURL]);

  // --------- cargar franjas + detectar 1-based ---------
  useEffect(() => {
    const cargarBloques = async () => {
      const { data, error } = await supabase
        .from("franjas_horarias")
        .select("bloque, hora_inicio, hora_fin")
        .eq("nivel", nivelURL)
        .order("bloque");
      if (!error && data?.length) {
        setBloquesHorario(data);
        // Si el menor bloque es 1, asumimos 1-based
        const minBloque = Math.min(...data.map((x) => Number(x.bloque)));
        setBloqueOneBased(minBloque === 1);
      } else {
        setBloquesHorario([]);
        setBloqueOneBased(false);
      }
    };
    cargarBloques();
  }, [nivelURL]);

  // --------- cargar restricciones guardadas para el docente ---------
  useEffect(() => {
    const cargarRestriccionesGuardadas = async () => {
      const docente = docentes.find((d) => d.nombre === docenteSeleccionado);
      if (!docente || bloquesHorario.length === 0) {
        setEventos([]);
        return;
      }

      const { data } = await supabase
        .from("restricciones_docente")
        .select("dia, bloque")
        .eq("docente_id", docente.id)
        .eq("nivel", nivelURL);

      const nuevosEventos = (data || [])
        .map((r) => {
          const idxDia = getDiaIndexFromStr(r.dia);
          if (idxDia < 0) return null;

          const idxBloque = bloqueOneBased ? Number(r.bloque) - 1 : Number(r.bloque);
          const bloqueInfo = bloquesHorario[idxBloque];
          if (!bloqueInfo) return null;

          const [hiH, hiM] = toHHMM(bloqueInfo.hora_inicio).split(":").map(Number);
          const [hfH, hfM] = toHHMM(bloqueInfo.hora_fin).split(":").map(Number);

          const start = new Date(2024, 3, 22 + idxDia, hiH, hiM);
          const end = new Date(2024, 3, 22 + idxDia, hfH, hfM);
          return { title: "Disponible", start, end };
        })
        .filter(Boolean);

      setEventos(nuevosEventos);
    };

    if (docenteSeleccionado) {
      cargarRestriccionesGuardadas();
    } else {
      setEventos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docenteSeleccionado, bloquesHorario, bloqueOneBased, nivelURL, docentes.length]);

  // --------- helpers franjas ---------
  const franjasMin = useMemo(() => {
    return bloquesHorario.map((b) => toMinutes(b.hora_inicio));
  }, [bloquesHorario]);
  const franjasMax = useMemo(() => {
    return bloquesHorario.map((b) => toMinutes(b.hora_fin));
  }, [bloquesHorario]);

  // Devuelve TODOS los índices de bloque cubiertos por un evento
  const bloquesCubiertosPorEvento = (start, end) => {
    const iniMin = start.getHours() * 60 + start.getMinutes();
    const finMin = end.getHours() * 60 + end.getMinutes();
    const indices = [];
    franjasMin.forEach((bIni, idx) => {
      const bFin = franjasMax[idx];
      if (bIni < finMin && bFin > iniMin) indices.push(idx);
    });
    return indices;
  };

  // --------- UI handlers ---------
  const manejarSeleccion = ({ start, end }) => {
    const bloquesNuevos = bloquesCubiertosPorEvento(start, end);
    if (bloquesNuevos.length === 0) return;

    const fechaBase = new Date(start);
    const diaIdx = fechaBase.getDay() - 1; // 1..5 (lun..vie) => 0..4
    if (diaIdx < 0 || diaIdx > 4) return;

    const nuevos = bloquesNuevos.map((bi) => {
      const [hiH, hiM] = toHHMM(bloquesHorario[bi].hora_inicio).split(":").map(Number);
      const [hfH, hfM] = toHHMM(bloquesHorario[bi].hora_fin).split(":").map(Number);
      return {
        title: "Disponible",
        start: new Date(2024, 3, 22 + diaIdx, hiH, hiM),
        end: new Date(2024, 3, 22 + diaIdx, hfH, hfM),
      };
    });

    const key = (e) => `${e.start.getTime()}_${e.end.getTime()}`;
    const existentes = new Set(eventos.map(key));
    const merge = [...eventos];
    for (const ev of nuevos) {
      const k = key(ev);
      if (!existentes.has(k)) {
        merge.push(ev);
      }
    }
    setEventos(merge);
  };

  const manejarDobleClickEvento = (eventoEliminado) => {
    if (window.confirm("¿Deseas eliminar esta disponibilidad?")) {
      setEventos(
        eventos.filter(
          (e) =>
            !(
              e.start.getTime() === eventoEliminado.start.getTime() &&
              e.end.getTime() === eventoEliminado.end.getTime()
            )
        )
      );
    }
  };

  // --------- Guardar restricciones ---------
  const guardarRestricciones = async () => {
    if (!docenteSeleccionado) return alert("Seleccione un docente.");
    const docente = docentes.find((d) => d.nombre === docenteSeleccionado);
    if (!docente) return alert("Docente no encontrado.");
    if (!bloquesHorario.length) return alert("No hay franjas horarias configuradas.");

    setSaving(true);

    // 1) Construir set de claves día/bloque (0-based) a partir de los eventos
    const diaSemanaUi = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const clavesDisponibles = new Map(); // key normalizada -> { diaBD, diaKey, bloque0 }

    for (const { start, end } of eventos) {
      const diaUi = diaSemanaUi[start.getDay()].toLowerCase();
      if (!DIAS_UI.includes(diaUi)) continue;

      const diaKey = normalize(diaUi); // sin acentos, para llaves y contexto
      const diaIdx = getDiaIndexFromStr(diaKey);
      if (diaIdx < 0) continue;

      const indices = bloquesCubiertosPorEvento(start, end);
      indices.forEach((idx) => {
        const key = `${diaKey}-${idx}`;
        if (!clavesDisponibles.has(key)) {
          clavesDisponibles.set(key, { diaBD: diaUi, diaKey, bloque0: idx });
        }
      });
    }

    // 2) Reset docente/nivel y re-insert
    await supabase
      .from("restricciones_docente")
      .delete()
      .match({ docente_id: docente.id, nivel: nivelURL });

    const filas = [];
    const restriccionesMap = {};

    for (const { diaBD, diaKey, bloque0 } of clavesDisponibles.values()) {
      const bloqueDB = bloqueOneBased ? bloque0 + 1 : bloque0;
      filas.push({ docente_id: docente.id, dia: diaBD, bloque: bloqueDB, nivel: nivelURL });
      restriccionesMap[`${diaKey}-${bloque0}`] = true; // SIEMPRE 0-based para el generador
    }

    // 3) Persistir en BD y sincronizar contexto
    if (filas.length > 0) {
      const { error } = await supabase.from("restricciones_docente").insert(filas);
      setSaving(false);
      if (error) {
        console.error(error);
        alert("❌ Error al guardar restricciones");
      } else {
        alert("✅ Restricciones guardadas correctamente");
        if (setDisponibilidadDocente) {
          setDisponibilidadDocente((prev) => ({
            ...(prev || {}),
            [docente.id.toString()]: restriccionesMap,
          }));
        }
      }
      return;
    }

    // Si no hay filas, limpiamos la disponibilidad de ese docente en el contexto
    setSaving(false);
    alert("No hay bloques para guardar.");
    if (setDisponibilidadDocente) {
      setDisponibilidadDocente((prev) => {
        const next = { ...(prev || {}) };
        delete next[docente.id.toString()];
        return next;
      });
    }
  };

  // --------- Límites de la grilla ---------
  const minHora = useMemo(() => {
    return bloquesHorario.length
      ? new Date(
          1970,
          0,
          1,
          ...toHHMM(bloquesHorario[0].hora_inicio).split(":").map(Number)
        )
      : new Date(1970, 0, 1, 7, 15);
  }, [bloquesHorario]);

  const maxHora = useMemo(() => {
    return bloquesHorario.length
      ? new Date(
          1970,
          0,
          1,
          ...toHHMM(bloquesHorario[bloquesHorario.length - 1].hora_fin)
            .split(":")
            .map(Number)
        )
      : new Date(1970, 0, 1, 13, 30);
  }, [bloquesHorario]);

  // --------- Auditoría ---------
  useEffect(() => {
    const fetchUltima = async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("actor_email, created_at, operation")
        .eq("table_name", "restricciones_docente")
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
        setUltimaEdicion(registro);
      } else setUltimaEdicion(null);
    };
    fetchUltima();
  }, [nivelURL, docenteSeleccionado, eventos.length]);

  // Realtime para refrescar el pill cuando cambie audit_logs
  useEffect(() => {
    const ch = supabase
      .channel("audit_restricciones")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs", filter: "table_name=eq.restricciones_docente" },
        async () => {
          const { data } = await supabase
            .from("audit_logs")
            .select("actor_email, created_at, operation")
            .eq("table_name", "restricciones_docente")
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
            setUltimaEdicion(registro);
          }
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, []);

  // ----------------- UI -----------------
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Breadcrumbs />

      {/* ======= Encabezado principal sticky con icono ======= */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 mb-4 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-slate-200">
        <div className="px-4 md:px-6 py-3 max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CalendarDays className="size-6 text-blue-700" />
              <div>
                <h1 className="text-xl md:text-2xl font-semibold text-slate-800 leading-tight">
                  Disponibilidad Horaria de Docentes
                </h1>
                <div className="mt-1">
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                    <Users className="size-3.5" />
                    Nivel — <strong className="font-semibold text-slate-700">{nivelURL}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <LastEditPill edit={ultimaEdicion} />
              <button
                onClick={guardarRestricciones}
                disabled={!docenteSeleccionado || saving || cargando}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-white shadow-sm hover:bg-blue-800 disabled:opacity-60"
                title={!docenteSeleccionado ? "Seleccione un docente" : "Guardar disponibilidad"}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Selector de docente */}
      <div className="mb-4">
        <select
          value={docenteSeleccionado}
          onChange={(e) => setDocenteSeleccionado(e.target.value)}
          className="border border-slate-300 px-3 py-2 rounded-lg w-full md:w-1/3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <option value="">-- Seleccione un docente --</option>
          {docentes.map((d) => (
            <option key={d.id} value={d.nombre}>
              {d.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Calendario */}
      {docenteSeleccionado && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <header className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
            <CalendarDays className="size-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-800">Calendario semanal</h3>
          </header>

          <div className="p-3">
            <div className="bg-white border border-slate-200 rounded-lg" style={{ height: 600 }}>
              <RBCalendar
                localizer={localizer}
                culture="es"
                events={eventos}
                startAccessor="start"
                endAccessor="end"
                selectable
                defaultView="week"
                views={["week"]}
                timeslots={1}
                step={45}
                showAllDay={false}
                onSelectSlot={manejarSeleccion}
                onDoubleClickEvent={manejarDobleClickEvento}
                defaultDate={new Date(2024, 3, 22)}
                min={minHora}
                max={maxHora}
                toolbar={false}
                formats={{
                  dayFormat: (date, culture, localizer) => localizer.format(date, "eeee", culture),
                  timeGutterFormat: (date, culture, localizer) => localizer.format(date, "HH:mm", culture),
                }}
                dayPropGetter={(date) =>
                  date.getDay() === 0 || date.getDay() === 6 ? { style: { display: "none" } } : {}
                }
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default RestriccionesForm;
