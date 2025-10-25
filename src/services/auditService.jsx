import { supabase } from "../supabaseClient";

// Última modificación para una fila concreta
export async function getLastChangeForHorario(id) {
  return supabase
    .from("v_last_change_horarios")
    .select("actor_email, actor_id, operation, created_at")
    .eq("id", id)
    .maybeSingle();
}

// Historial (con filtros opcionales)
export async function listAuditLogs({ table, rowId, limit = 50 }) {
  let q = supabase
    .from("v_audit_logs_human")
    .select("table_name,row_id,actor_email,operation,created_at,old_values,new_values")
    .limit(limit);

  if (table) q = q.eq("table_name", table);
  if (rowId) q = q.eq("row_id", String(rowId));

  return q.order("created_at", { ascending: false });
}
