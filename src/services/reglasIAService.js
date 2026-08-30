import { supabase } from "../supabaseClient";

const baseURL = import.meta.env.DEV ? "" : import.meta.env.VITE_API_URL || "";

const sinAcentos = (valor = "") => String(valor)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const corregirClasificacion = (regla) => {
  const texto = sinAcentos([
    regla.texto_original,
    regla.formalizacion,
    regla.ambiguedad,
  ].filter(Boolean).join(" "));
  let tipo = regla.tipo;

  if (tipo === "no_soportada" && regla.cursos?.length && regla.bloques_preferidos?.length) {
    tipo = "preferencia_franja_curso";
  } else if (["limite_materia_dia", "no_soportada"].includes(tipo)
      && texto.includes("docente")
      && (texto.includes("grado") || texto.includes("seccion"))
      && (texto.includes("maximo") || texto.includes("sum(bloques_docente_grado_dia)"))) {
    tipo = "limite_docente_grado_dia";
  } else if (tipo === "no_soportada" && texto.includes("docente") && texto.includes("dos clases al mismo tiempo")) {
    tipo = "no_solape_docente";
  } else if (tipo === "no_soportada" && texto.includes("sesion") && texto.includes("bloques consecutivos")) {
    tipo = "sesiones_consecutivas";
  } else if (tipo === "no_soportada"
      && (texto.includes("mismo grado") || texto.includes("misma seccion"))
      && ["unico periodo continuo", "no podra regresar", "regresar a ensenar"].some((frase) => texto.includes(frase))) {
    tipo = "bloque_unico_docente_grado_dia";
  } else if (tipo === "no_soportada" && texto.includes("carga semanal total") && texto.includes("una hora")) {
    tipo = "excluir_carga_una_hora";
  } else if (tipo === "no_soportada" && texto.includes("docente")
      && ["hueco", "consecutiv", "compact"].some((palabra) => texto.includes(palabra))) {
    tipo = "evitar_huecos_docente";
  }

  const corregida = { ...regla, tipo };
  if (tipo !== "no_soportada") corregida.estado = "ejecutable";
  corregida.dureza = regla.dureza === "soft" ? "soft" : "hard";
  if (["no_solape_docente", "sesiones_consecutivas", "excluir_carga_una_hora", "disponibilidad_docente"].includes(tipo)) {
    corregida.dureza = "hard";
  }
  return corregida;
};

const normalizarRegla = (row) => corregirClasificacion({
  id: row.id,
  nivel: row.nivel,
  texto_original: row.texto_original,
  tipo: row.tipo,
  dureza: row.dureza,
  formalizacion: row.formalizacion,
  estado: row.estado,
  activa: row.activa,
  fuente: row.fuente,
  created_at: row.created_at,
  ...(row.parametros || {}),
});

const parametrosDeRegla = (regla) => ({
  total_horas: Number(regla.total_horas || 0),
  patron: Array.isArray(regla.patron) ? regla.patron.map(Number) : [],
  patrones: Array.isArray(regla.patrones)
    ? regla.patrones.map((patron) => patron.map(Number))
    : (Array.isArray(regla.patron) ? [regla.patron.map(Number)] : []),
  maximo: Number(regla.maximo || 0),
  cursos: Array.isArray(regla.cursos) ? regla.cursos.map(String) : [],
  excepto_cursos: Array.isArray(regla.excepto_cursos) ? regla.excepto_cursos.map(String) : [],
  bloques_preferidos: Array.isArray(regla.bloques_preferidos)
    ? regla.bloques_preferidos.map(Number).filter((bloque) => Number.isInteger(bloque) && bloque > 0)
    : [],
  docente_id: regla.docente_id == null ? null : Number(regla.docente_id),
  ambiguedad: regla.ambiguedad || "",
});

export async function cargarReglasIA(nivel = "Secundaria") {
  const { data, error } = await supabase
    .from("reglas_ia")
    .select("id,nivel,texto_original,tipo,dureza,parametros,formalizacion,estado,activa,fuente,created_at")
    .eq("nivel", nivel)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`No se pudieron cargar las reglas desde Supabase: ${error.message}`);
  return (data || []).map(normalizarRegla);
}

export async function guardarReglasIA(nivel = "Secundaria", _version = 1, reglas = []) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const filas = (reglas || []).map((regla) => ({
    nivel,
    texto_original: regla.texto_original || "",
    tipo: regla.tipo || "no_soportada",
    dureza: regla.dureza || "hard",
    parametros: parametrosDeRegla(regla),
    formalizacion: regla.formalizacion || "",
    estado: regla.estado || "no_soportada",
    activa: regla.estado === "ejecutable" && regla.activa !== false,
    fuente: regla.fuente || "Gemini",
    creado_por: user?.id || null,
  }));

  if (filas.length === 0) {
    const { error } = await supabase.from("reglas_ia").delete().eq("nivel", nivel);
    if (error) throw new Error(`No se pudieron eliminar las reglas anteriores: ${error.message}`);
    return [];
  }

  // Inserta primero el conjunto nuevo para no perder el anterior si falla la escritura.
  const { data: insertadas, error: insertError } = await supabase
    .from("reglas_ia")
    .insert(filas)
    .select("id,nivel,texto_original,tipo,dureza,parametros,formalizacion,estado,activa,fuente,created_at");

  if (insertError) throw new Error(`No se pudieron guardar las reglas en Supabase: ${insertError.message}`);

  const idsNuevos = (insertadas || []).map((regla) => regla.id);
  if (idsNuevos.length > 0) {
    const { error: deleteError } = await supabase
      .from("reglas_ia")
      .delete()
      .eq("nivel", nivel)
      .not("id", "in", `(${idsNuevos.join(",")})`);
    if (deleteError) {
      throw new Error(`Las reglas nuevas se guardaron, pero no se pudo limpiar el conjunto anterior: ${deleteError.message}`);
    }
  }

  return (insertadas || []).map(normalizarRegla);
}

export async function cargarReglasIAActivas(nivel = "Secundaria") {
  const reglas = await cargarReglasIA(nivel);
  return reglas.filter(
    (regla) => regla?.tipo !== "disponibilidad_docente"
      && regla?.activa !== false
      && regla?.estado === "ejecutable"
  );
}

export async function extraerReglasConIA({ texto, nivel, version }) {
  const response = await fetch(`${baseURL}/extraer-reglas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto, nivel, version }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "No se pudieron analizar las reglas.");
  return {
    ...data,
    reglas: (data.reglas || []).map(corregirClasificacion),
  };
}
