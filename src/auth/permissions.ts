export const PERMISSIONS = [
  // permisos técnicos ya existentes
  'user.read',
  'user.write',
  'user.status.write',
  'role.read',
  'role.write',
  'perm.read',
  'perm.write',
  'horario.read',
  'horario.write',
  'restric.read',
  'restric.write',
  'audit.read',

  // 🔥 NUEVOS PERMISOS DE INTERFAZ (UI)
  'ui.restric.docente',
  'ui.horario.docente',
  'ui.horario.general',
  'ui.docentes',
  'ui.aulas',
  'ui.restricciones.panel',
  'ui.franjas',
  'ui.asignacion',
  'ui.admin.docentes',
  'ui.admin.roles',
  'ui.admin.cuentas',
  'ui.audit',
] as const;

export type Permission = typeof PERMISSIONS[number];
