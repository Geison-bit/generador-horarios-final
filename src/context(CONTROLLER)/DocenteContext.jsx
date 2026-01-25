// src/context(CONTROLLER)/DocenteContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { loadReglasParaNivel } from "../services/restriccionesService";

const DocenteContext = createContext();
export const useDocentes = () => useContext(DocenteContext);

export const DocenteProvider = ({ children }) => {
  // =================== Estado principal ===================
  const [nivelSeleccionado, setNivelSeleccionado] = useState("Secundaria");

  // Datos base
  const [docentes, setDocentes] = useState([]);            // Solo ACTIVOS
  const [asignaciones, setAsignaciones] = useState({});    // {cursoId: {gradoId: {docente_id, nombre}}}
  const [horasCursos, setHorasCursos] = useState({});      // {cursoId: {gradoId: horas}}

  // Disponibilidad (antes llamado "restricciones_docente")
  // Mapa: { [docente_id]: { "dia-bloque": true } }
  const [disponibilidadDocente, setDisponibilidadDocente] = useState({});

  // Reglas activas (overrides + defaults) por nivel
  // Objeto plano: { [regla_key]: boolean }
  const [reglas, setReglas] = useState({});

  // Resultado del generador y carga
  const [horarioGeneral, setHorarioGeneral] = useState(null);
  const [loading, setLoading] = useState(false);

  // =================== Carga de datos base ===================
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // ✅ DOCENTES: solo activos
      const { data: docentesData, error: docErr } = await supabase
        .from("docentes")
        .select("id, nombre, apellido, tipo_profesor, jornada_total, aula_id, nivel, activo, color, version_num")
        .eq("activo", true)
        .order("apellido", { ascending: true });
      if (docErr) throw docErr;
      setDocentes(docentesData || []);

      // ✅ ASIGNACIONES: agrupadas por curso/grado
      const { data: asignacionesData, error: asigErr } = await supabase
        .from("asignaciones")
        .select(`
          id,
          docente_id,
          curso_id,
          grado_id,
          horas,
          curso:curso_id (nombre)
        `);
      if (asigErr) throw asigErr;

      const asignacionesMap = {};
      (asignacionesData || []).forEach((a) => {
        if (!asignacionesMap[a.curso_id]) asignacionesMap[a.curso_id] = {};
        asignacionesMap[a.curso_id][a.grado_id] = {
          docente_id: a.docente_id,
          nombre: a.curso?.nombre || "Sin nombre",
        };
      });
      setAsignaciones(asignacionesMap);

      // ✅ HORAS por curso/grado
      const { data: horasData, error: horasErr } = await supabase
        .from("horas_curso_grado")
        .select("curso_id, grado_id, horas");
      if (horasErr) throw horasErr;

      const horasMap = {};
      (horasData || []).forEach((h) => {
        if (!horasMap[h.curso_id]) horasMap[h.curso_id] = {};
        horasMap[h.curso_id][h.grado_id] = h.horas;
      });
      setHorasCursos(horasMap);

      // ✅ DISPONIBILIDAD (antes restricciones_docente)
      const { data: restrData, error: restErr } = await supabase
        .from("restricciones_docente")
        .select("docente_id, dia, bloque"); // filas donde ese slot está BLOQUEADO/NO DISPONIBLE
      if (restErr) throw restErr;

      const dispMap = {};
      (restrData || []).forEach((r) => {
        const key = `${r.dia}-${r.bloque}`;
        if (!dispMap[r.docente_id]) dispMap[r.docente_id] = {};
        dispMap[r.docente_id][key] = true; // true => no disponible ese slot
      });
      setDisponibilidadDocente(dispMap);
    } catch (e) {
      console.error("❌ Error al cargar datos del contexto:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial de datos base
  useEffect(() => {
    refresh();
  }, [refresh]);

  // =================== Carga de REGLAS por nivel ===================
  const cargarReglas = useCallback(async () => {
    try {
      const reglasActivas = await loadReglasParaNivel(nivelSeleccionado);
      setReglas(reglasActivas || {});
    } catch (e) {
      console.error("❌ Error al cargar reglas:", e);
      setReglas({});
    }
  }, [nivelSeleccionado]);

  // Carga (o recarga) de reglas al montar y al cambiar de nivel
  useEffect(() => {
    cargarReglas();
  }, [cargarReglas]);

  // Llamar esto después de guardar en el panel para reflejar cambios al instante
  const refrescarReglas = useCallback(async () => {
    await cargarReglas();
  }, [cargarReglas]);

  // =================== Exponer en contexto ===================
  return (
    <DocenteContext.Provider
      value={{
        // Nivel
        nivelSeleccionado,
        setNivelSeleccionado,

        // Datos base
        docentes,                     // solo activos
        setDocentes,
        asignaciones,
        setAsignaciones,
        horasCursos,
        setHorasCursos,

        // Disponibilidad (antes "restricciones" por docente/día/bloque)
        disponibilidadDocente,
        setDisponibilidadDocente,

        // Reglas activas por nivel (incluye no_solape_docente)
        reglas,
        setReglas,          // por si necesitas setear manual (normalmente usa refrescarReglas)
        refrescarReglas,    // úsalo al guardar en el panel

        // Resultado/estado
        horarioGeneral,
        setHorarioGeneral,
        loading,

        // Utilidad para recargar datos base
        refresh,
      }}
    >
      {children}
    </DocenteContext.Provider>
  );
};
