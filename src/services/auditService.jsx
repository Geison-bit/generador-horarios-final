// src/services/auditService.jsx
import { supabase } from "../supabaseClient";

/** Normaliza 'action' a los valores que usa audit_logs.operation */
function normalizeOperation(action) {
  const a = String(action || "").toLowerCase();
  if (["insert", "create", "add", "nuevo", "agregar", "crear"].includes(a)) return "INSERT";
  if (["update", "edit", "editar", "modify", "patch"].includes(a)) return "UPDATE";
  if (["delete", "remove", "eliminar", "borrar", "destroy"].includes(a)) return "DELETE";
  if (["login", "sign_in", "signin"].includes(a)) return "LOGIN";
  if (["logout", "sign_out", "signout"].includes(a)) return "LOGOUT";
  return "OTHER";
}

/**
 * Inserta un registro en public.audit_logs.
 * Enviamos actor (uuid) y actor_email para evitar 'unknown' si el trigger no puede leer el JWT.
 */
export async function logAudit({
  action,
  entity,
  entityId = null,
  details = null,
  success = true,
}) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user || null;

  const row = {
    table_name: entity || "unknown",
    operation: normalizeOperation(action),
    entity_id: entityId ?? null,
    details: details ?? null,
    success: !!success,
  };

  if (user) {
    row.actor = user.id;        // si existe la columna uuid 'actor'
    row.actor_email = user.email;
  }

  const { data, error } = await supabase.from("audit_logs").insert(row).select().single();
  if (error) console.error("[audit] insert error:", error);

  return { ok: !error, data, error };
}

/**
 * Envuelve una operación (fn) y registra auditoría según resultado.
 * Ejemplo:
 *   withAudit(() => supabase.from('aulas').delete().eq('id', id), {
 *     action: 'DELETE', entity: 'aulas', entityId: id
 *   })
 */
export async function withAudit(fn, meta) {
  let opResult;
  let ok = false;
  let err = null;

  try {
    opResult = await fn();
    ok = !(opResult && opResult.error);
    if (!ok) err = opResult.error;
  } catch (e) {
    ok = false;
    err = e;
  }

  try {
    const entityId =
      typeof meta?.getEntityId === "function" ? meta.getEntityId(opResult) : meta?.entityId;

    const details =
      typeof meta?.details === "function" ? meta.details(opResult) : meta?.details;

    const effectiveSuccess =
      typeof meta?.success === "function" ? !!meta.success(opResult) : ok;

    await logAudit({
      action: meta?.action,
      entity: meta?.entity,
      entityId,
      details: details ?? (err ? { error: String(err?.message || err) } : null),
      success: effectiveSuccess,
    });
  } catch (logErr) {
    console.warn("[audit] withAudit: failed to write audit entry:", logErr);
  }

  return ok
    ? { ok: true, data: opResult?.data ?? null, error: null, raw: opResult }
    : { ok: false, data: null, error: err, raw: opResult };
}
