// src/components/FranjasHorariasForm.jsx
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";
import { Clock8, History, Loader2, Plus, Save, Trash2, Users } from "lucide-react";

// Mini pill Última edición (coherente con otras pantallas)
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

const sumarMinutos = (horaStr, minutos) => {
  if (!horaStr) return "";
  const [h, m] = horaStr.split(":").map(Number);
  const fecha = new Date();
  fecha.setHours(h, m + minutos, 0, 0);
  return fecha.toTimeString().slice(0, 5);
};

const FranjasHorariasForm = () => {
  const [bloques, setBloques] = useState([]);
  const [saveStatus, setSaveStatus] = useState({ message: "", type: "" });
  const [saving, setSaving] = useState(false);
  const [cargando, setCargando] = useState(false);

  // Auditoría
  const [ultimaEdicion, setUltimaEdicion] = useState(null);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivel = params.get("nivel") || "Secundaria";

  useEffect(() => {
    (async () => {
      setCargando(true);
      await cargarBloquesDesdeDB();
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel]);

  // --- Auditoría: leer última edición de audit_logs para franjas_horarias ---
  useEffect(() => {
    const fetchUltima = async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("actor_email, created_at, operation")
        .eq("table_name", "franjas_horarias")
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
  }, [nivel, bloques.length]);

  // Realtime: refrescar pill cuando haya nuevas escrituras en audit_logs
  useEffect(() => {
    const ch = supabase
      .channel("audit_franjas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs", filter: "table_name=eq.franjas_horarias" },
        async () => {
          const { data } = await supabase
            .from("audit_logs")
            .select("actor_email, created_at, operation")
            .eq("table_name", "franjas_horarias")
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
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, []);

  const cargarBloquesDesdeDB = async () => {
    const { data, error } = await supabase
      .from("franjas_horarias")
      .select("bloque, hora_inicio, hora_fin")
      .eq("nivel", nivel)
      .order("bloque");

    if (!error && data && data.length > 0) {
      setBloques(data.map((b) => ({ inicio: b.hora_inicio, fin: b.hora_fin })));
    } else {
      // Defaults (8 bloques de 45 min desde 07:15)
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
    if (campo === "inicio") nuevos[index].fin = sumarMinutos(valor, 45);
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

  // =======================
  //  GUARDAR (UPSERT + trim)
  // =======================
  const guardarConfiguracion = async () => {
    setSaving(true);
    setSaveStatus({ message: "", type: "" });

    try {
      // 1) UPSERT: inserta nuevos y actualiza existentes por (nivel, bloque)
      const nuevaConfiguracion = bloques.map((b, index) => ({
        nivel,
        bloque: index + 1,
        hora_inicio: b.inicio,
        hora_fin: b.fin,
      }));

      const { error: upsertErr } = await supabase
        .from("franjas_horarias")
        .upsert(nuevaConfiguracion, { onConflict: "nivel,bloque" });

      if (upsertErr) {
        console.error("Upsert error:", upsertErr);
        setSaveStatus({ message: "Error al guardar la configuración.", type: "error" });
        setSaving(false);
        return;
      }

      // 2) Recorte opcional: elimina SOLO los bloques que sobren
      const { error: deleteErr } = await supabase
        .from("franjas_horarias")
        .delete()
        .eq("nivel", nivel)
        .gt("bloque", bloques.length);

      if (deleteErr) {
        // No es crítico; lo avisamos en consola
        console.warn("No se pudieron eliminar bloques sobrantes:", deleteErr);
      }

      setSaveStatus({ message: "Configuración guardada exitosamente.", type: "success" });
    } catch (e) {
      console.error(e);
      setSaveStatus({ message: "Error al guardar la configuración.", type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus({ message: "", type: "" }), 3000);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Breadcrumbs />

      {/* ======= Encabezado principal sticky con icono ======= */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 mt-4 mb-4 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-slate-200">
        <div className="px-4 md:px-6 py-3 max-w-7xl mx-auto">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Clock8 className="size-6 text-blue-600" />
              <div>
                <h1 className="text-xl md:text-2xl font-semibold text-slate-800 leading-tight">
                  Configuración de Bloques Horarios
                </h1>
                <div className="mt-1">
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                    <Users className="size-3.5" />
                    Nivel — <strong className="font-semibold text-slate-700">{nivel}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
              <LastEditPill edit={ultimaEdicion} />
              <button
                onClick={guardarConfiguracion}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-70 w-full sm:w-auto"
                disabled={saving || cargando}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Descripción */}
      <p className="text-slate-600 mb-6">
        Define los bloques horarios de Lunes a Viernes para el nivel {nivel}. La hora de fin se calcula automáticamente a los{" "}
        <b>45 min</b> del inicio.
      </p>

      {/* Tabla de bloques */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
        <header className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
          <Clock8 className="size-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-800">Bloques configurados</h3>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-4 py-3 font-medium border-b border-slate-200">Bloque</th>
                <th className="px-4 py-3 font-medium border-b border-slate-200">Hora de inicio</th>
                <th className="px-4 py-3 font-medium border-b border-slate-200">Hora de fin (automático)</th>
                <th className="px-4 py-3 font-medium border-b border-slate-200 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {bloques.map((bloque, index) => (
                <tr key={index} className="odd:bg-white even:bg-slate-50/40">
                  <td className="px-4 py-2 font-medium text-slate-800 border-t border-slate-200">Bloque {index + 1}</td>
                  <td className="px-4 py-2 border-t border-slate-200">
                    <input
                      type="time"
                      value={bloque.inicio}
                      onChange={(e) => actualizarBloque(index, "inicio", e.target.value)}
                      className="border border-slate-300 px-2 py-1 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </td>
                  <td className="px-4 py-2 border-t border-slate-200">
                    <input
                      type="time"
                      value={bloque.fin}
                      readOnly
                      className="border border-slate-300 px-2 py-1 rounded-md bg-slate-100 cursor-not-allowed"
                    />
                  </td>
                  <td className="px-4 py-2 text-center border-t border-slate-200">
                    <button
                      onClick={() => eliminarBloque(index)}
                      className="inline-flex items-center gap-1 text-rose-600 px-2 py-1 rounded hover:bg-rose-50"
                      title="Eliminar bloque"
                    >
                      <Trash2 className="h-4 w-4" /> Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Acciones inferiores */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={agregarBloque}
          disabled={bloques.length >= 9}
          className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" /> Añadir bloque
        </button>

        <button
          onClick={guardarConfiguracion}
          disabled={saving || cargando}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar configuración
        </button>

        {saveStatus.message && (
          <span
            className={`text-sm font-medium ${
              saveStatus.type === "success" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {saveStatus.message}
          </span>
        )}
      </div>

      {cargando && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-white/60">
          <div className="rounded-xl bg-white p-4 shadow ring-1 ring-slate-200 inline-flex items-center gap-3">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm text-slate-700">Cargando…</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FranjasHorariasForm;
