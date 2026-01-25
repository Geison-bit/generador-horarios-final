// src/components/RestriccionesForm.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Calendar as RBCalendar, dateFnsLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import es from "date-fns/locale/es";
import { supabase } from "../supabaseClient";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import Breadcrumbs from "./Breadcrumbs";
import { CalendarDays, History, Loader2, Save, Users, Layers, AlertCircle } from "lucide-react";

// Configuración del calendario
const locales = { es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

// ----------------- Utiles -----------------
const normalize = (s) =>
  (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const toHHMM = (t) => {
  if (t == null) return "";
  const s = String(t);
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
    <div className="flex items-center gap-2 text-xs px-3 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 shadow-sm w-full sm:w-auto">
      <History className="w-4 h-4" />
      <span>
        <span className="text-slate-600">Última edición:</span> <b>{actorNombre}</b> · {fecha}
      </span>
    </div>
  );
};

const RestriccionesForm = () => {
  const [docentes, setDocentes] = useState([]);
  const [docenteSeleccionado, setDocenteSeleccionado] = useState(""); // Guarda el ID o Nombre
  const [docenteObj, setDocenteObj] = useState(null); // Guarda el objeto completo del docente
  const [eventos, setEventos] = useState([]);
  const [bloquesHorario, setBloquesHorario] = useState([]);
  const [bloqueOneBased, setBloqueOneBased] = useState(false);

  const { setDisponibilidadDocente } = useDocentes();
  const [ultimaEdicion, setUltimaEdicion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cargando, setCargando] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const nivelURL = params.get("nivel") || "Secundaria";

  // Estado para la versión seleccionada (inicia con URL o 1)
  const [versionSeleccionada, setVersionSeleccionada] = useState(
    Number(params.get("version")) || 1
  );

  // Sincronizar URL cuando cambia la versión
  const cambiarVersion = (nuevaVersion) => {
    const v = Number(nuevaVersion);
    setVersionSeleccionada(v);
    setDocenteSeleccionado("");
    setDocenteObj(null);
    setEventos([]);
    
    // Actualizar URL sin recargar la página completa
    const newParams = new URLSearchParams(location.search);
    newParams.set("version", v);
    navigate({ search: newParams.toString() }, { replace: true });
  };

  // --------- 1. Cargar docentes (CORREGIDO: DESDE TABLA DOCENTES) ---------
  useEffect(() => {
    const cargarDocentesDeVersion = async () => {
      setCargando(true);
      
      // CORRECCIÓN: Consultamos directamente la tabla 'docentes'.
      // Así traemos a todos los que existen en esa versión, tengan o no restricciones guardadas.
      const { data, error } = await supabase
        .from("docentes")
        .select("id, nombre, apellido, activo")
        .eq("nivel", nivelURL)
        .eq("version_num", versionSeleccionada)
        .eq("activo", true) // Solo activos
        .order("apellido")
        .order("nombre");

      if (error) {
        console.error("Error cargando docentes:", error);
        setDocentes([]);
      } else {
        setDocentes(data || []);
      }
      setCargando(false);
    };

    cargarDocentesDeVersion();
  }, [nivelURL, versionSeleccionada]);

  // --------- 2. Cargar franjas horarias ---------
  useEffect(() => {
    const cargarBloques = async () => {
      const { data, error } = await supabase
        .from("franjas_horarias")
        .select("bloque, hora_inicio, hora_fin")
        .eq("nivel", nivelURL)
        .eq("version_num", versionSeleccionada)
        .order("bloque");

      if (!error && data?.length) {
        setBloquesHorario(data);
        const minBloque = Math.min(...data.map((x) => Number(x.bloque)));
        setBloqueOneBased(minBloque === 1);
      } else {
        setBloquesHorario([]);
        setBloqueOneBased(false);
      }
    };
    cargarBloques();
  }, [nivelURL, versionSeleccionada]);

  // --------- 3. Cargar restricciones (eventos) del docente seleccionado ---------
  useEffect(() => {
    const cargarRestriccionesGuardadas = async () => {
      // Encontramos el objeto docente basado en la selección (ID o combinación nombre)
      // Usaremos el ID como value del select para ser más precisos
      const docente = docentes.find((d) => String(d.id) === docenteSeleccionado);
      setDocenteObj(docente || null);

      if (!docente || bloquesHorario.length === 0) {
        setEventos([]);
        return;
      }

      // Cargar restricciones específicas de la versión seleccionada
      const { data } = await supabase
        .from("restricciones_docente")
        .select("dia, bloque")
        .eq("docente_id", docente.id)
        .eq("nivel", nivelURL)
        .eq("version_num", versionSeleccionada);

      const nuevosEventos = (data || [])
        .map((r) => {
          const idxDia = getDiaIndexFromStr(r.dia);
          if (idxDia < 0) return null;

          const idxBloque = bloqueOneBased ? Number(r.bloque) - 1 : Number(r.bloque);
          const bloqueInfo = bloquesHorario[idxBloque];
          if (!bloqueInfo) return null;

          const [hiH, hiM] = toHHMM(bloqueInfo.hora_inicio).split(":").map(Number);
          const [hfH, hfM] = toHHMM(bloqueInfo.hora_fin).split(":").map(Number);

          // Usamos una fecha base (ej: abril 2024) solo para visualización
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
      setDocenteObj(null);
    }
  }, [docenteSeleccionado, bloquesHorario, bloqueOneBased, nivelURL, versionSeleccionada, docentes]);

  // --------- Helpers de visualización ---------
  const franjasMin = useMemo(() => bloquesHorario.map((b) => toMinutes(b.hora_inicio)), [bloquesHorario]);
  const franjasMax = useMemo(() => bloquesHorario.map((b) => toMinutes(b.hora_fin)), [bloquesHorario]);

  const bloquesCubiertosPorEvento = (start, end) => {
    const iniMin = start.getHours() * 60 + start.getMinutes();
    const finMin = end.getHours() * 60 + end.getMinutes();
    const indices = [];
    franjasMin.forEach((bIni, idx) => {
      const bFin = franjasMax[idx];
      // Pequeña tolerancia o intersección estricta
      if (bIni < finMin && bFin > iniMin) indices.push(idx);
    });
    return indices;
  };

  // --------- Handlers del Calendario ---------
  const manejarSeleccion = ({ start, end }) => {
    const bloquesNuevos = bloquesCubiertosPorEvento(start, end);
    if (bloquesNuevos.length === 0) return;

    const fechaBase = new Date(start);
    const diaIdx = fechaBase.getDay() - 1; // 0=Lunes en BigCalendar si startOfWeek es Lunes?
    // Ajuste defensivo según configuración de BigCalendar (0=Domingo, 1=Lunes...)
    // En este setup '2024-04-22' es Lunes.
    // start.getDay(): Domingo=0, Lunes=1...
    // Si start es Lunes (1), diaIdx debería ser 0.
    const diaReal = start.getDay(); 
    const diaIdxLogico = diaReal === 0 ? 6 : diaReal - 1; // 0=Lunes... 4=Viernes

    if (diaIdxLogico < 0 || diaIdxLogico > 4) return; // Solo L-V

    const keyFromDiaBloque = (dIdx, bIdx) => `${dIdx}-${bIdx}`;
    
    // Función auxiliar para identificar eventos existentes
    const keyFromEvent = (e) => {
      const dReal = e.start.getDay();
      const dLog = dReal === 0 ? 6 : dReal - 1;
      const bIdx = bloquesCubiertosPorEvento(e.start, e.end)[0];
      return keyFromDiaBloque(dLog, bIdx);
    };

    const existentesKeys = new Set(eventos.map(keyFromEvent));
    const seleccionKeys = new Set(bloquesNuevos.map((bIdx) => keyFromDiaBloque(diaIdxLogico, bIdx)));

    // Si todos los seleccionados ya existen -> borrar (toggle off)
    const eliminar = [...seleccionKeys].every((k) => existentesKeys.has(k));
    
    if (eliminar) {
      setEventos(eventos.filter((e) => !seleccionKeys.has(keyFromEvent(e))));
      return;
    }

    // Si no, agregar los que faltan
    const nuevos = bloquesNuevos.map((bi) => {
      const [hiH, hiM] = toHHMM(bloquesHorario[bi].hora_inicio).split(":").map(Number);
      const [hfH, hfM] = toHHMM(bloquesHorario[bi].hora_fin).split(":").map(Number);
      // Reconstruir fecha basada en el día seleccionado
      // start tiene la fecha correcta del día (ej. Lunes 22)
      const y = start.getFullYear();
      const m = start.getMonth();
      const d = start.getDate();
      
      return {
        title: "Disponible",
        start: new Date(y, m, d, hiH, hiM),
        end: new Date(y, m, d, hfH, hfM),
      };
    });

    const merge = [...eventos];
    for (const ev of nuevos) {
      if (!existentesKeys.has(keyFromEvent(ev))) merge.push(ev);
    }
    setEventos(merge);
  };

  const manejarDobleClickEvento = (eventoEliminado) => {
    if (window.confirm("¿Deseas eliminar esta disponibilidad?")) {
      setEventos(
        eventos.filter(
          (e) =>
            !(e.start.getTime() === eventoEliminado.start.getTime() &&
              e.end.getTime() === eventoEliminado.end.getTime())
        )
      );
    }
  };

  // --------- Guardar en Supabase ---------
  const guardarRestricciones = async () => {
    if (!docenteObj) return alert("Seleccione un docente.");
    if (!bloquesHorario.length) return alert("No hay franjas horarias configuradas.");

    setSaving(true);

    // Mapeo inverso de fecha a día string
    const diaSemanaUi = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const filasInsertar = [];
    const clavesProcesadas = new Set(); // Para evitar duplicados en el insert

    // 1. Preparar datos a insertar
    for (const { start, end } of eventos) {
      const diaIndex = start.getDay(); // 0=Dom, 1=Lun
      const diaUi = diaSemanaUi[diaIndex];
      
      // Validar que sea día hábil
      if (!DIAS_UI.includes(diaUi)) continue;

      const indicesBloques = bloquesCubiertosPorEvento(start, end);
      
      indicesBloques.forEach((idx) => {
        // Generar clave única para evitar duplicados en memoria
        const key = `${diaUi}-${idx}`;
        if (!clavesProcesadas.has(key)) {
          clavesProcesadas.add(key);
          
          const bloqueDB = bloqueOneBased ? idx + 1 : idx;
          filasInsertar.push({
            docente_id: docenteObj.id,
            dia: diaUi, // "lunes", "martes"...
            bloque: bloqueDB,
            nivel: nivelURL,
            version_num: versionSeleccionada // ¡Importante! Guardar versión
          });
        }
      });
    }

    try {
      // 2. Borrar SOLO las restricciones de este docente en esta versión y nivel
      const { error: errorDelete } = await supabase
        .from("restricciones_docente")
        .delete()
        .match({ 
          docente_id: docenteObj.id, 
          nivel: nivelURL,
          version_num: versionSeleccionada 
        });

      if (errorDelete) throw errorDelete;

      // 3. Insertar nuevas (si hay)
      if (filasInsertar.length > 0) {
        const { error: errorInsert } = await supabase
          .from("restricciones_docente")
          .insert(filasInsertar);
        
        if (errorInsert) throw errorInsert;
      }

      // 4. Actualizar Contexto (opcional, para refresco visual en otras vistas)
      if (setDisponibilidadDocente) {
        // Reconstruimos el mapa booleano rápido
        const mapa = {};
        for (const dia of DIAS_UI) {
            const dNorm = normalize(dia);
            for(let b=0; b<bloquesHorario.length; b++) {
                mapa[`${dNorm}-${b}`] = false;
            }
        }
        filasInsertar.forEach(f => {
            const dNorm = normalize(f.dia);
            const bIdx = bloqueOneBased ? f.bloque - 1 : f.bloque;
            mapa[`${dNorm}-${bIdx}`] = true;
        });
        
        setDisponibilidadDocente((prev) => ({
          ...(prev || {}),
          [docenteObj.id.toString()]: mapa,
        }));
      }

      alert(`✅ Disponibilidad guardada correctamente para la Versión ${versionSeleccionada}`);

    } catch (err) {
      console.error("Error guardando:", err);
      alert("❌ Error al guardar disponibilidad.");
    } finally {
      setSaving(false);
    }
  };

  // Limites visuales del calendario
  const minHora = useMemo(() => bloquesHorario.length
      ? new Date(1970, 0, 1, ...toHHMM(bloquesHorario[0].hora_inicio).split(":").map(Number))
      : new Date(1970, 0, 1, 7, 0), [bloquesHorario]);

  const maxHora = useMemo(() => bloquesHorario.length
      ? new Date(1970, 0, 1, ...toHHMM(bloquesHorario[bloquesHorario.length - 1].hora_fin).split(":").map(Number))
      : new Date(1970, 0, 1, 15, 0), [bloquesHorario]);

  // Auditoria
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
          const { data: udata } = await supabase.from("view_user_accounts").select("full_name").eq("email", registro.actor_email).limit(1);
          if (udata?.[0]?.full_name) registro = { ...registro, actor_name: udata[0].full_name };
        }
        setUltimaEdicion(registro);
      } else setUltimaEdicion(null);
    };
    fetchUltima();
  }, [nivelURL, docenteSeleccionado, eventos.length]); // Refrescar al guardar

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 mt-4 mb-4 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="px-4 md:px-6 py-3 max-w-7xl mx-auto">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <CalendarDays className="size-6 text-blue-600" />
              <div>
                <h1 className="text-xl md:text-2xl font-semibold text-slate-800 leading-tight">
                  Disponibilidad Horaria
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                    <Users className="size-3.5" />
                    Nivel - <strong className="font-semibold text-slate-700">{nivelURL}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
              <LastEditPill edit={ultimaEdicion} />
              <button
                onClick={guardarRestricciones}
                disabled={!docenteSeleccionado || saving || cargando}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-white shadow-sm hover:bg-blue-800 disabled:opacity-60 w-full sm:w-auto justify-center"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SELECTORES */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-200">
        
        {/* Selector de Versión */}
        <div className="md:col-span-3">
          <label className="block text-xs font-bold text-slate-500 mb-1 ml-1 uppercase tracking-wider">
            Versión del Horario
          </label>
          <div className="relative">
            <Layers className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <select
              value={versionSeleccionada}
              onChange={(e) => cambiarVersion(e.target.value)}
              className="pl-9 w-full border border-slate-300 bg-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-semibold text-slate-700"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                <option key={v} value={v}>
                  Versión {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selector de Docente */}
        <div className="md:col-span-6">
          <label className="block text-xs font-bold text-slate-500 mb-1 ml-1 uppercase tracking-wider">
            Docente (Activo en v{versionSeleccionada})
          </label>
          <div className="relative">
             <select
                value={docenteSeleccionado}
                onChange={(e) => setDocenteSeleccionado(e.target.value)} // Usamos ID como valor
                disabled={cargando}
                className={`w-full border px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm appearance-none ${
                    !docenteSeleccionado ? 'text-slate-400' : 'text-slate-800 font-medium'
                } ${docentes.length === 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-300'}`}
              >
                <option value="">
                  {cargando ? "Cargando docentes..." : "-- Seleccione un docente --"}
                </option>
                {docentes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.apellido}, {d.nombre}
                  </option>
                ))}
              </select>
              {/* Icono de flecha custom si se desea, o default */}
          </div>
          
          {/* Mensaje de error si no hay docentes */}
          {!cargando && docentes.length === 0 && (
             <div className="flex items-center gap-2 mt-2 text-red-600 bg-red-50 p-2 rounded text-xs border border-red-100">
               <AlertCircle className="size-4" />
               <span>No se encontraron docentes <strong>activos</strong> en la <strong>Versión {versionSeleccionada}</strong>. Vaya a "Registrar Docentes" para agregarlos o copiarlos.</span>
             </div>
          )}
        </div>
      </div>

      {/* Calendario */}
      {docenteSeleccionado && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <header className="flex items-center justify-between p-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-slate-800">
                Disponibilidad: <span className="text-blue-700">{docenteObj?.nombre} {docenteObj?.apellido}</span>
              </h3>
            </div>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-medium">
              Editando Versión {versionSeleccionada}
            </span>
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
                step={45} // Ajusta si tus bloques no son de 45min
                showAllDay={false}
                onSelectSlot={manejarSeleccion}
                onDoubleClickEvent={manejarDobleClickEvento}
                defaultDate={new Date(2024, 3, 22)} // Fecha semilla Lunes
                min={minHora}
                max={maxHora}
                toolbar={false}
                formats={{
                  dayFormat: (date, culture, localizer) => localizer.format(date, "eeee", culture),
                  timeGutterFormat: (date, culture, localizer) => localizer.format(date, "HH:mm", culture),
                }}
                dayPropGetter={(date) => {
                  const day = date.getDay();
                  if (day === 0 || day === 6) return { style: { display: "none" } };
                  return {};
                }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500 flex justify-between px-1">
                <p>💡 Click y arrastra para seleccionar bloques. Doble click en un bloque verde para eliminarlo.</p>
                <p>Nivel: {nivelURL}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default RestriccionesForm;
