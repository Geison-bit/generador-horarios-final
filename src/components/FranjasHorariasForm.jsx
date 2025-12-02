// src/components/FranjasHorariasForm.jsx
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Breadcrumbs from "../components/Breadcrumbs";
import { withAudit } from "../services/auditService";
import { Clock8, History, Loader2, Plus, Save, Trash2, Users } from "lucide-react";

const LastEditPill = ({ edit }) => {
  const actor =
    edit?.actor_name || edit?.actor_full_name || edit?.actor_email || "Desconocido";
  const fecha = edit?.created_at ? new Date(edit.created_at).toLocaleString() : "—";
  return (
    <div className="flex items-center gap-2 text-xs px-3 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 shadow-sm">
      <History className="w-4 h-4" />
      <span>
        <span className="text-slate-600">Última edición:</span> <b>{actor}</b> · {fecha}
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

// --- helper: busca último audit y resuelve nombre desde view_user_accounts
const fetchUltimaEdicionConNombre = async (tableName) => {
  const resolveNombre = async (email) => {
    if (!email) return null;
    const { data } = await supabase
      .from("view_user_accounts")
      .select("full_name")
      .eq("email", email)
      .limit(1);
    return data?.[0]?.full_name || null;
  };

  const prefer = await supabase
    .from("audit_logs")
    .select("actor_email, created_at, operation")
    .eq("table_name", tableName)
    .neq("actor_email", "unknown")
    .order("created_at", { ascending: false })
    .limit(1);
  if (!prefer.error && prefer.data?.length) {
    const entrada = prefer.data[0];
    const nombre = await resolveNombre(entrada.actor_email);
    return nombre ? { ...entrada, actor_name: nombre } : entrada;
  }

  const fallback = await supabase
    .from("audit_logs")
    .select("actor_email, created_at, operation")
    .eq("table_name", tableName)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!fallback.error && fallback.data?.length) {
    const entrada = fallback.data[0];
    const nombre = await resolveNombre(entrada.actor_email);
    return nombre ? { ...entrada, actor_name: nombre } : entrada;
  }

  return null;
};

export default function FranjasHorariasForm() {
  const [bloques, setBloques] = useState([]);
  const [saving, setSaving] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [status, setStatus] = useState({ type: "", msg: "" });

  // permisos UI
  const [canWrite, setCanWrite] = useState(false);

  // Auditoría
  const [ultimaEdicion, setUltimaEdicion] = useState(null);

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivel = params.get("nivel") || "Secundaria";

  // ---------- Permisos (UI) ----------
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("v_user_permissions")
        .select("permission_key");
      if (!error) {
        const keys = new Set((data || []).map((r) => r.permission_key));
        // acepta cualquiera de estos permisos
        setCanWrite(keys.has("franjas.write") || keys.has("horario.write"));
      }
    })();
  }, []);

  // ---------- Carga ----------
  useEffect(() => {
    (async () => {
      setCargando(true);
      await cargarBloquesDesdeDB();
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel]);

  // ---------- Auditoría (como AulasForm, pero con preferencia @gmail.com) ----------
  useEffect(() => {
    (async () => {
      const last = await fetchUltimaEdicionConNombre("franjas_horarias");
      setUltimaEdicion(last);
    })();
  }, [nivel, bloques.length]);

  useEffect(() => {
    const ch = supabase
      .channel("audit_franjas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs", filter: "table_name=eq.franjas_horarias" },
        async () => {
          const last = await fetchUltimaEdicionConNombre("franjas_horarias");
          setUltimaEdicion(last);
        }
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, []);

  const cargarBloquesDesdeDB = async () => {
    const { data, error } = await supabase
      .from("franjas_horarias")
      .select("bloque, hora_inicio, hora_fin")
      .eq("nivel", nivel)
      .order("bloque");

    if (!error && data?.length) {
      setBloques(data.map((b) => ({ inicio: b.hora_inicio, fin: b.hora_fin })));
    } else {
      // defaults (8 x 45min)
      const out = [];
      let inicio = "07:15";
      for (let i = 0; i < 8; i++) {
        const fin = sumarMinutos(inicio, 45);
        out.push({ inicio, fin });
        inicio = fin;
      }
      setBloques(out);
    }
  };

  const actualizarBloque = (i, campo, valor) => {
    const next = [...bloques];
    next[i][campo] = valor;
    if (campo === "inicio") next[i].fin = sumarMinutos(valor, 45);
    setBloques(next);
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

  // ---------- Guardar (con withAudit como AulasForm) ----------
  const guardarConfiguracion = async () => {
    if (!canWrite) {
      setStatus({ type: "error", msg: "No tienes permiso para editar las franjas (franjas.write / horario.write)." });
      return;
    }

    setSaving(true);
    setStatus({ type: "", msg: "" });

    try {
      const nueva = bloques.map((b, i) => ({
        nivel,
        bloque: i + 1,
        hora_inicio: b.inicio,
        hora_fin: b.fin,
      }));

      // operación compuesta: upsert + delete sobrantes, audit como en AulasForm
      const op = async () => {
        const up = await supabase
          .from("franjas_horarias")
          .upsert(nueva, { onConflict: "nivel,bloque" });

        if (up.error) return up;

        const del = await supabase
          .from("franjas_horarias")
          .delete()
          .eq("nivel", nivel)
          .gt("bloque", bloques.length);

        // si del falla no cortamos el flujo; devolvemos el error para que withAudit lo refleje
        if (del?.error) return del;

        // devolver una forma compatible con withAudit
        return { data: { upserted: nueva.length }, error: null };
      };

      const res = await withAudit(op, {
        action: "UPSERT",
        entity: "franjas_horarias",
        // Para identificar el conjunto editado
        entityId: nivel,
        details: () => ({ nivel, bloques: nueva }),
        success: (r) => !r?.error,
      });

      if (res?.error) throw res.error;

      setStatus({ type: "success", msg: "Configuración guardada." });
    } catch (e) {
      setStatus({ type: "error", msg: e?.message || "Error al guardar la configuración." });
      console.error("[franjas] save error:", e);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus({ type: "", msg: "" }), 3500);
    }
  };

  const headerActionsDisabled = useMemo(() => saving || cargando || !canWrite, [saving, cargando, canWrite]);

  return (
    <div className="p-3 sm:p-4 lg:p-6 w-full max-w-[1200px] mx-auto">
      <Breadcrumbs />

      {/* Header sticky */}
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 mb-4 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-slate-200">
        <div className="px-4 md:px-3 sm:px-4 lg:px-6 py-1.5 sm:py-2.5 lg:py-3 max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock8 className="size-6 text-blue-700" />
              <div>
                <h1 className="text-lg sm:text-xl md:text-xl sm:text-2xl font-semibold text-slate-800 leading-tight">
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

            <div className="flex items-center gap-2">
              <LastEditPill edit={ultimaEdicion} />
              <button
                onClick={guardarConfiguracion}
                className="inline-flex items-center gap-2 rounded-md sm:rounded-lg px-4 py-2 text-white shadow-sm disabled:opacity-60
                           bg-emerald-600 hover:bg-emerald-700"
                disabled={headerActionsDisabled}
                title={!canWrite ? "Sin permiso para editar" : "Guardar"}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="text-slate-600 mb-6">
        Define los bloques de Lunes a Viernes para el nivel {nivel}. La hora de fin se calcula automáticamente a los <b>45 min</b> del inicio.
      </p>

      <section className="bg-white rounded-lg sm:rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
        <header className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
          <Clock8 className="size-4 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-800">Bloques configurados</h3>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-4 py-1.5 sm:py-2.5 lg:py-3 font-medium border-b border-slate-200">Bloque</th>
                <th className="px-4 py-1.5 sm:py-2.5 lg:py-3 font-medium border-b border-slate-200">Hora de inicio</th>
                <th className="px-4 py-1.5 sm:py-2.5 lg:py-3 font-medium border-b border-slate-200">Hora de fin (automático)</th>
                <th className="px-4 py-1.5 sm:py-2.5 lg:py-3 font-medium border-b border-slate-200 text-center">Acción</th>
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
                      disabled={!canWrite}
                    />
                  </td>
                  <td className="px-4 py-2 border-t border-slate-200">
                    <input
                      type="time"
                      value={bloque.fin}
                      readOnly
                      className="border border-slate-300 px-2 py-1 rounded-md bg-slate-100"
                    />
                  </td>
                  <td className="px-4 py-2 text-center border-t border-slate-200">
                    <button
                      onClick={() => eliminarBloque(index)}
                      className="inline-flex items-center gap-1 text-rose-600 px-2 py-1 rounded hover:bg-rose-50 disabled:opacity-40"
                      title="Eliminar bloque"
                      disabled={!canWrite}
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={agregarBloque}
          disabled={bloques.length >= 9 || !canWrite}
          className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-md sm:rounded-lg font-semibold hover:bg-blue-800 disabled:bg-slate-300"
        >
          <Plus className="h-4 w-4" /> Añadir bloque
        </button>

        <button
          onClick={guardarConfiguracion}
          disabled={saving || cargando || !canWrite}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md sm:rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar configuración
        </button>

        {status.msg && (
          <span className={`text-sm font-medium ${status.type === "success" ? "text-emerald-700" : "text-rose-700"}`}>
            {status.msg}
          </span>
        )}
      </div>

      {cargando && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-white/60">
          <div className="rounded-lg sm:rounded-xl bg-white p-4 shadow ring-1 ring-slate-200 inline-flex items-center gap-3">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm text-slate-700">Cargando…</span>
          </div>
        </div>
      )}
    </div>
  );
}

