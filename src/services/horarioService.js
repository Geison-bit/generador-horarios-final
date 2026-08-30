// src/services/horarioService.js
import { supabase } from "../supabaseClient";

// En desarrollo usa proxy de Vite (ruta relativa). En producción toma VITE_API_URL.
const baseURL = import.meta.env.DEV ? "" : import.meta.env.VITE_API_URL || "";

async function headersAutenticados() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Envía al backend el pedido de generación de horario.
 * Mantiene el contrato actual de tu API.
 */
export const enviarDznAlServidor = async (
  docentes,
  asignaciones,
  restricciones,
  horasCursos,
  nivel,
  version = 1
) => {
  try {
    console.log("🌐 Usando API:", `${baseURL}/generar-horario-general`);

    const response = await fetch(`${baseURL}/generar-horario-general`, {
      method: "POST",
      headers: await headersAutenticados(),
      body: JSON.stringify({
        docentes,
        asignaciones,
        restricciones,
        horas_curso_grado: horasCursos,
        nivel,
        version,
        overwrite: false,
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

export async function generarHorarioConProgreso({
  docentes,
  asignaciones,
  restricciones,
  horasCursos,
  columnas,
  nivel,
  version = 1,
  onProgress,
}) {
  const response = await fetch(`${baseURL}/generar-horario-general-job`, {
    method: "POST",
    headers: await headersAutenticados(),
    body: JSON.stringify({
      docentes,
      asignaciones,
      restricciones,
      horas_curso_grado: horasCursos,
      columnas,
      nivel,
      version,
      overwrite: false,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data?.job_id) {
    throw new Error(data?.error || "No se pudo iniciar la generacion.");
  }

  const jobId = data.job_id;
  const eventsUrl = `${baseURL}/generar-horario-general-job/${jobId}/events`;

  return await new Promise((resolve, reject) => {
    const es = new EventSource(eventsUrl);

    const cleanup = () => {
      try {
        es.close();
      } catch {
        // noop
      }
    };

    es.addEventListener("progress", (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (typeof payload?.progress === "number") {
          onProgress?.(payload.progress, payload.stage || "");
        }
      } catch {
        // noop
      }
    });

    es.addEventListener("done", (evt) => {
      cleanup();
      try {
        const payload = JSON.parse(evt.data);
        resolve(payload?.result || null);
      } catch (e) {
        reject(e);
      }
    });

    es.addEventListener("error", (evt) => {
      cleanup();
      let msg = "Error en el progreso.";
      try {
        const payload = JSON.parse(evt.data);
        msg = payload?.error || msg;
      } catch {
        // noop
      }
      reject(new Error(msg));
    });

    es.onerror = () => {
      cleanup();
      reject(new Error("Se perdio la conexion del progreso."));
    };
  });
}

// Compatibilidad para consumidores antiguos: solo conserva disponibilidad.
// Las reglas variables se cargan exclusivamente desde reglas_ia.
export async function generarHorarioConReglas({
  docentes,
  asignaciones,
  horasCursos,
  nivel,
  version = 1,
  disponibilidadMap = {},
}) {
  const restricciones = { disponibilidad: disponibilidadMap || {} };
  return await enviarDznAlServidor(
    docentes,
    asignaciones,
    restricciones,
    horasCursos,
    nivel,
    version
  );
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
  version = 1,
}) {
  return await enviarDznAlServidor(
    docentes,
    asignaciones,
    restricciones,
    horasCursos,
    nivel,
    version
  );
}
