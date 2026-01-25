// src/services/restriccionesService.js
import { supabase } from "../supabaseClient";

/**
 * Lee el catálogo con columnas EXACTAS de tu esquema.
 * Sin .order() (evitamos 400 si algún entorno no la tiene) y luego
 * ordenamos en cliente si existe 'orden'.
 */
async function safeSelectCatalog() {
  // Columnas reales de tu tabla
  const cols = "key,nombre,descripcion,tipo,por_defecto,peso,default_aplica,orden";
  const { data, error } = await supabase
    .from("restricciones_catalogo")
    .select(cols);

  if (!error) return data || [];

  // Último recurso: select("*") y normalizamos
  const fallback = await supabase.from("restricciones_catalogo").select("*");
  if (!fallback.error) return fallback.data || [];

  throw error || fallback.error || new Error("No fue posible leer restricciones_catalogo.");
}

/**
 * Lee overrides del nivel y normaliza a {regla_key, aplica, nivel}.
 * Tu tabla usa 'regla_key' (confirmado).
 */
async function safeSelectOverrides(nivel) {
  const { data, error } = await supabase
    .from("restricciones_overrides")
    .select("regla_key, aplica, nivel")
    .eq("nivel", nivel);

  if (error) throw error;
  return (data || []).map((r) => ({
    regla_key: r.regla_key,
    aplica: r.aplica,
    nivel: r.nivel,
  }));
}

/**
 * Defaults por si el catálogo está vacío.
 */
const DEFAULTS_FALLBACK = [
  { key: "disponibilidad_docente", default_aplica: true, orden: 1 },
  { key: "no_solape_docente",     default_aplica: true, orden: 2 },
  { key: "bloques_consecutivos",  default_aplica: true, orden: 3 },
  { key: "distribuir_en_dias_distintos", default_aplica: true, orden: 4 },
  { key: "no_puentes_docente",    default_aplica: true, orden: 5 },
  { key: "no_dias_consecutivos",  default_aplica: true, orden: 6 },
  { key: "omitir_cursos_1h",      default_aplica: true, orden: 7 },
  { key: "limitar_carga_docente_grado", default_aplica: true, orden: 8 },
];

/**
 * Devuelve { [regla_key]: boolean } con el valor efectivo (override o default).
 * - Usa 'default_aplica' si existe; si no, cae a 'por_defecto'.
 * - Filtra por 'activo' si existiera (en tu tabla no está; tolerante).
 */
export async function loadReglasParaNivel(nivel = "Secundaria") {
  const catalogo = await safeSelectCatalog();

  const base = (catalogo && catalogo.length) ? [...catalogo] : DEFAULTS_FALLBACK;

  // Orden en cliente si existe 'orden'
  if (base.length && Object.prototype.hasOwnProperty.call(base[0], "orden")) {
    base.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  }

  // Si existiera 'activo', respétalo; en tu tabla no está.
  const activas = base.filter((r) =>
    Object.prototype.hasOwnProperty.call(r, "activo") ? r.activo !== false : true
  );

  // Overrides normalizados
  const ov = await safeSelectOverrides(nivel);
  const overrides = new Map(ov.map((r) => [r.regla_key, r.aplica]));

  // Fusión
  const reglas = {};
  activas.forEach((r) => {
    // preferimos default_aplica; si viene nulo/undefined, usamos por_defecto; si nada, true
    const def =
      (Object.prototype.hasOwnProperty.call(r, "default_aplica") &&
        r.default_aplica !== null &&
        r.default_aplica !== undefined)
        ? Boolean(r.default_aplica)
        : (Object.prototype.hasOwnProperty.call(r, "por_defecto") &&
           r.por_defecto !== null &&
           r.por_defecto !== undefined)
          ? Boolean(r.por_defecto)
          : true;

    reglas[r.key] = overrides.has(r.key) ? Boolean(overrides.get(r.key)) : def;
  });

  return reglas;
}

/**
 * Guarda overrides:
 * - Borra los overrides del nivel
 * - Inserta SOLO reglas que difieren del default
 * - Sin onConflict (no necesitas índice único)
 */
export async function saveReglasParaNivel(nivel = "Secundaria", reglas = {}) {
  if (!nivel) throw new Error("Nivel requerido");
  if (!reglas || typeof reglas !== "object") throw new Error("Reglas inválidas");

  const catalogo = await safeSelectCatalog();
  const base = catalogo.length ? catalogo : DEFAULTS_FALLBACK;

  const activos = base.filter((r) =>
    Object.prototype.hasOwnProperty.call(r, "activo") ? r.activo !== false : true
  );

  const defaults = new Map(
    activos.map((r) => {
      const def =
        (Object.prototype.hasOwnProperty.call(r, "default_aplica") &&
          r.default_aplica !== null &&
          r.default_aplica !== undefined)
          ? Boolean(r.default_aplica)
          : (Object.prototype.hasOwnProperty.call(r, "por_defecto") &&
             r.por_defecto !== null &&
             r.por_defecto !== undefined)
            ? Boolean(r.por_defecto)
            : true;
      return [r.key, def];
    })
  );

  // Diferencias respecto a defaults
  const difs = Object.entries(reglas)
    .filter(([key]) => defaults.has(key))
    .filter(([key, val]) => defaults.get(key) !== Boolean(val))
    .map(([key, val]) => ({
      regla_key: key,
      nivel,
      aplica: Boolean(val),
    }));

  // Borrar todo lo del nivel…
  const { error: errDel } = await supabase
    .from("restricciones_overrides")
    .delete()
    .eq("nivel", nivel);
  if (errDel) throw errDel;

  // …y reinsertar solo diferencias (si hay)
  if (difs.length > 0) {
    const { error: errIns } = await supabase
      .from("restricciones_overrides")
      .insert(difs); // sin onConflict
    if (errIns) throw errIns;
  }
}

/**
 * Payload para el backend generador.
 * (OJO: si quieres ignorar disponibilidad cuando la regla esté OFF,
 * usa 'disponibilidadEfectiva' antes de llamar a esta función.)
 */
export function buildRestriccionesPayload(disponibilidadMap = {}, reglas = {}) {
  return {
    disponibilidad: disponibilidadMap || {},
    reglas: {
      // defaults “de seguridad”
      disponibilidad_docente: true,
      no_solape_docente: true,
      bloques_consecutivos: true,
      distribuir_en_dias_distintos: true,
      no_puentes_docente: true,
      no_dias_consecutivos: true,
      omitir_cursos_1h: true,
      limitar_carga_docente_grado: true,
      // overrides efectivos
      ...reglas,
    },
  };
}

/* ================= Helpers adicionales ================== */

/**
 * Devuelve la disponibilidad efectiva según la regla 'disponibilidad_docente'.
 * Si la regla está OFF -> devolvemos {} para que el backend NO la aplique.
 */
export function disponibilidadEfectiva(disponibilidadMap = {}, reglas = {}) {
  const key = "disponibilidad_docente";
  const activa = Object.prototype.hasOwnProperty.call(reglas, key)
    ? Boolean(reglas[key])
    : true; // por defecto true si no existe
  return activa ? (disponibilidadMap || {}) : {};
}

/* ======= Helpers: 2.ª restricción (no_solape_docente) ======= */

export const NO_SOLAPE_KEY = "no_solape_docente";

export function isReglaActiva(reglas = {}, key) {
  return Object.prototype.hasOwnProperty.call(reglas, key)
    ? Boolean(reglas[key])
    : true;
}

export const bloqueKey = (dia, bloque) => `${dia}#${bloque}`;

export function createIndiceSolape() {
  return new Map(); // Map<docenteId, Set<bloqueKey>>
}

export function markAsignacion(indice, docenteId, dia, bloque) {
  const key = bloqueKey(dia, bloque);
  let set = indice.get(docenteId);
  if (!set) {
    set = new Set();
    indice.set(docenteId, set);
  }
  set.add(key);
}

export function hasSolape(indice, docenteId, dia, bloque) {
  const set = indice.get(docenteId);
  return !!(set && set.has(bloqueKey(dia, bloque)));
}

export function canAsignarDocenteEnBloque({ reglas = {}, indice, docenteId, dia, bloque }) {
  if (!isReglaActiva(reglas, NO_SOLAPE_KEY)) return true; // regla OFF
  return !hasSolape(indice, docenteId, dia, bloque);      // regla ON
}
