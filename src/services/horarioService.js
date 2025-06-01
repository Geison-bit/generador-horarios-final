// src/services/horarioService.js

const baseURL = import.meta.env.VITE_API_URL;

export const enviarDznAlServidor = async (
  docentes,
  asignaciones,
  restricciones,
  horasCursos,
  nivel
) => {
  try {
    const response = await fetch(`${baseURL}/generar-horario-general`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        docentes,
        asignaciones,
        restricciones,
        horas_curso_grado: horasCursos,
        nivel, // ✅ Incluido correctamente
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Horario generado correctamente:", data);
      return { horario: data.horario };
    } else {
      console.error("❌ Error al generar horario:", data?.error || data);
      return null;
    }
  } catch (error) {
    console.error("❌ Error en la solicitud:", error.message || error);
    return null;
  }
};
