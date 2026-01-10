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

// Helper genérico: ejecuta fn() y registra auditoría si la tabla audit_logs existe
export async function withAudit(fn, meta = {}) {
  const result = await fn();
  try {
    if (meta.action || meta.entity || meta.details) {
      await supabase.from("audit_logs").insert({
        action: meta.action || "unknown",
        entity: meta.entity || "unknown",
        details: meta.details || null,
      });
    }
  } catch (e) {
    // No bloquear si la tabla no existe o falla el insert
    console.warn("Audit log falló:", e?.message || e);
  }
  return result;
}

// Inserta un registro de auditoría sin envolver otra operación
export async function logAudit(meta = {}) {
  try {
    if (meta.action || meta.entity || meta.details) {
      await supabase.from("audit_logs").insert({
        action: meta.action || "unknown",
        entity: meta.entity || "unknown",
        entity_id: meta.entityId || null,
        details: meta.details || null,
      });
    }
  } catch (e) {
    console.warn("Audit log falló:", e?.message || e);
  }
}
