import { supabase } from "../supabaseClient";
import { withAudit } from "./auditService";

/** Catálogo de permisos (key, description) */
export async function listPermissions() {
  const { data, error } = await supabase
    .from("permissions")
    .select("key, description")
    .order("key", { ascending: true });
  if (error) throw error;
  // formateo uniforme para UI
  return (data || []).map(p => ({
    key: p.key,
    nombre: p.key,             // para mostrar; ajusta si luego agregas "name"
    codigo: p.key,             // alias usado en algunas UIs
    descripcion: p.description || "",
  }));
}

/** Roles (id, name) */
export async function listRoles() {
  const { data, error } = await supabase
    .from("roles")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, nombre: r.name }));
}

/** Enlaces role_permissions (role_id, permission_key) */
export async function listRolePerms() {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_id, permission_key");
  if (error) throw error;
  return data || [];
}

/** Toggle de una celda (permission_key ↔ role_id) */
export async function toggleRolePerm({ roleId, permKey, on }) {
  if (on) {
    return withAudit(
      async () => {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role_id: roleId, permission_key: permKey });
        if (error) throw error;
        return { ok: true };
      },
      { action: "role_perm_add", entity: "role_permissions", details: { role_id: roleId, permission_key: permKey } }
    );
  } else {
    return withAudit(
      async () => {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .match({ role_id: roleId, permission_key: permKey });
        if (error) throw error;
        return { ok: true };
      },
      { action: "role_perm_remove", entity: "role_permissions", details: { role_id: roleId, permission_key: permKey } }
    );
  }
}

/** Set fila completa (un permiso para N roles) */
export async function setRowForRoles({ permKey, roleIds, value }) {
  if (value) {
    return withAudit(
      async () => {
        const rows = roleIds.map(rid => ({ role_id: rid, permission_key: permKey }));
        const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role_id,permission_key", ignoreDuplicates: true });
        if (error) throw error;
        return { ok: true };
      },
      { action: "role_perm_row_add", entity: "role_permissions", details: { permission_key: permKey, roles: roleIds } }
    );
  } else {
    return withAudit(
      async () => {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("permission_key", permKey)
          .in("role_id", roleIds);
        if (error) throw error;
        return { ok: true };
      },
      { action: "role_perm_row_remove", entity: "role_permissions", details: { permission_key: permKey, roles: roleIds } }
    );
  }
}

/** Set columna completa (un rol con N permisos) */
export async function setColForPerms({ roleId, permKeys, value }) {
  if (value) {
    return withAudit(
      async () => {
        const rows = permKeys.map(k => ({ role_id: roleId, permission_key: k }));
        const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role_id,permission_key", ignoreDuplicates: true });
        if (error) throw error;
        return { ok: true };
      },
      { action: "role_perm_col_add", entity: "role_permissions", details: { role_id: roleId, permissions: permKeys } }
    );
  } else {
    return withAudit(
      async () => {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role_id", roleId)
          .in("permission_key", permKeys);
        if (error) throw error;
        return { ok: true };
      },
      { action: "role_perm_col_remove", entity: "role_permissions", details: { role_id: roleId, permissions: permKeys } }
    );
  }
}
