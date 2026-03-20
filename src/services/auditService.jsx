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

function normalizeAuditMeta(meta = {}) {
  return {
    table_name: meta.tableName || meta.entity || "unknown",
    operation: (meta.operation || meta.action || "unknown").toLowerCase(),
    row_id: meta.rowId != null ? String(meta.rowId) : meta.entityId != null ? String(meta.entityId) : null,
    old_values: meta.oldValues || null,
    new_values: meta.newValues || meta.details || null,
  };
}

async function getActorContext() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return {
      actor_id: user?.id || null,
      actor_email: user?.email || null,
    };
  } catch {
    return {
      actor_id: null,
      actor_email: null,
    };
  }
}

function ensureSupabaseSuccess(result) {
  if (result?.error) {
    throw result.error;
  }
  return result;
}

async function insertAudit(meta = {}) {
  const normalized = normalizeAuditMeta(meta);
  if (!normalized.table_name || !normalized.operation) return;

  const actor = await getActorContext();
  const payload = {
    ...normalized,
    ...actor,
  };

  const { error } = await supabase.from("audit_logs").insert(payload);
  if (error) {
    console.warn("Audit log falló:", error.message || error);
  }
}

// Helper genérico: ejecuta fn() y registra auditoría si la operación principal fue exitosa
export async function withAudit(fn, meta = {}) {
  const result = ensureSupabaseSuccess(await fn());
  await insertAudit(meta);
  return result;
}

// Inserta un registro de auditoría sin envolver otra operación
export async function logAudit(meta = {}) {
  await insertAudit(meta);
}
