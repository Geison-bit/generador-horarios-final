import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Clock3, RefreshCw } from "lucide-react";
import Breadcrumbs from "../components/Breadcrumbs";

export default function BitacoraAuditoriaPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    setLoading(true);

    const { data, error } = await supabase
      .from("v_audit_logs_human")
      .select("actor_name, operacion_es, entidad_es, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error) {
      setRows(data || []);
    } else {
      console.error("Error cargando auditoría:", error);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="mt-4 mb-4 flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-semibold text-slate-800 flex items-center gap-2">
          <Clock3 className="size-6 text-blue-600" />
          Bitácora de Auditoría
        </h2>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm bg-white hover:bg-slate-50"
          title="Recargar"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Recargar
        </button>
      </div>

      <div className="mb-3 text-xs text-slate-600 flex items-center gap-2">
        <Clock3 className="size-4" />
        <span>Mostrando últimos {rows.length} eventos</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-700">
            <tr>
              <th className="border-b border-slate-200 px-4 py-1.5 sm:py-2.5 lg:py-3">Usuario</th>
              <th className="border-b border-slate-200 px-4 py-1.5 sm:py-2.5 lg:py-3">Acción</th>
              <th className="border-b border-slate-200 px-4 py-1.5 sm:py-2.5 lg:py-3">Entidad</th>
              <th className="border-b border-slate-200 px-4 py-1.5 sm:py-2.5 lg:py-3">Fecha</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No hay eventos de auditoría.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.created_at}-${i}`} className="hover:bg-slate-50">
                  <td className="border-b border-slate-200 px-4 py-2">{r.actor_name || "Desconocido"}</td>
                  <td className="border-b border-slate-200 px-4 py-2">{r.operacion_es}</td>
                  <td className="border-b border-slate-200 px-4 py-2">{r.entidad_es}</td>
                  <td className="border-b border-slate-200 px-4 py-2">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
