// src/services/horarioService.js
const baseURL = import.meta.env.VITE_API_URL;

import {
  loadReglasParaNivel,
  buildRestriccionesPayload,
  disponibilidadEfectiva,     // 👈 clave para ignorar disponibilidad cuando la regla esté OFF
  // helpers de la 2.ª restricción (pre-validación opcional)
  createIndiceSolape,
  canAsignarDocenteEnBloque,
  markAsignacion,
  isReglaActiva,
} from "./restriccionesService";

/**
 * Envía al backend el pedido de generación de horario.
 * Mantiene el contrato actual de tu API.
 */
export const enviarDznAlServidor = async (
  docentes,
  asignaciones,
  restricciones,
  horasCursos,
  nivel
) => {
  try {
    console.log("🌐 Usando API:", `${baseURL}/generar-horario-general`);

    const response = await fetch(`${baseURL}/generar-horario-general`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docentes,
        asignaciones,
        restricciones,
        horas_curso_grado: horasCursos,
        nivel,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Horario generado correctamente:", data);
      // devolvemos TODO el objeto del backend (incluye detalle_asignaciones)
      return data;
    } else {
      console.error("❌ Error al generar horario:", data?.error || data);
      return null;
    }
  } catch (error) {
    console.error("❌ Error en la solicitud:", error?.message || error);
    return null;
  }
};

/* ============================================================================
 * 1) API de alto nivel: arma las REGLAS por nivel y llama al backend
 *    - Lee reglas efectivas (overrides + defaults)
 *    - Construye el payload 'restricciones' que el backend consume
 *    - Llama a enviarDznAlServidor
 * ========================================================================== */

/**
 * Genera el horario leyendo automáticamente las reglas activas por nivel
 * y construyendo el payload `restricciones` que entiende el backend.
 *
 * @param {Object} params
 * @param {Array}  params.docentes
 * @param {Array}  params.asignaciones
 * @param {Object} params.horasCursos  (horas_curso_grado)
 * @param {String} params.nivel        ("Primaria" | "Secundaria" | ...)
 * @param {Object} [params.disponibilidadMap]  // mapa 0-based: { [docenteId]: { "dia-bloque": true } }
 */
export async function generarHorarioConReglas({
  docentes,
  asignaciones,
  horasCursos,
  nivel,
  disponibilidadMap = {},
}) {
  // 1) Reglas efectivas (overrides + defaults)
  const reglasEfectivas = await loadReglasParaNivel(nivel);

  // 2) Disponibilidad efectiva según la regla 'disponibilidad_docente'
  //    - Si la regla está OFF: se envía {}
  const disponibilidad = disponibilidadEfectiva(disponibilidadMap, reglasEfectivas);

  // 3) Construir payload que espera el backend
  const restricciones = buildRestriccionesPayload(disponibilidad, reglasEfectivas);

  // 4) (OPCIONAL) Pre-validación local de solapes (no bloqueante)
  const reporte = prevalidarSolapes(asignaciones, reglasEfectivas);
  if (reporte.haySolapes && isReglaActiva(restricciones.reglas, "no_solape_docente")) {
    console.info(
      "⚠️ Prevalidación: se detectaron posibles solapes de docente. " +
      "El backend igualmente re-verificará y podrá reubicar o rechazar."
    );
  }

  // 5) Enviar a backend
  return await enviarDznAlServidor(
    docentes,
    asignaciones,
    restricciones,
    horasCursos,
    nivel
  );
}

/* ============================================================================
 * 2) Utilidades: pre-validación local de la 2.ª restricción (no bloqueante)
 *    - NO impide generar: solo informa y ayuda a depurar
 *    - Si la regla está desactivada, no marca como error
 * ========================================================================== */

/**
 * Recorre las asignaciones candidatas y reporta si habría solapes de docente
 * en el mismo bloque (día & bloque). No modifica datos.
 *
 * Estructura mínima esperada de cada asignación:
 *   { docenteId, dia, bloque, ... }
 */
export function prevalidarSolapes(asignaciones = [], reglas = {}) {
  const indice = createIndiceSolape();
  const conflictos = [];

  for (const a of asignaciones) {
    const { docenteId, dia, bloque } = a ?? {};
    if (docenteId == null || dia == null || bloque == null) continue;

    const ok = canAsignarDocenteEnBloque({
      reglas,
      indice,
      docenteId,
      dia,
      bloque,
    });

    if (!ok) {
      conflictos.push(a);
      // no marcamos el índice para que se puedan listar todos los conflictos
      continue;
    }
    // marcamos igual: no daña si la regla está OFF y permite contar usos
    markAsignacion(indice, docenteId, dia, bloque);
  }

  return {
    haySolapes: conflictos.length > 0,
    conflictos, // puedes mostrar en UI si lo deseas
  };
}

/* ============================================================================
 * 3) Azúcar sintáctica: función delgada si ya traes 'restricciones' afuera
 *    (retro-compatibilidad con código existente)
 * ========================================================================== */

export async function generarHorarioConRestriccionesYaArmadas({
  docentes,
  asignaciones,
  restricciones,
  horasCursos,
  nivel,
}) {
  return await enviarDznAlServidor(
    docentes,
    asignaciones,
    restricciones,
    horasCursos,
    nivel
  );
}

