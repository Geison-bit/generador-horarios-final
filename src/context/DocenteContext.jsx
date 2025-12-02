// src/context/DocenteContext.jsx

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

import { supabase } from "../supabaseClient";
import { loadReglasParaNivel } from "../services/restriccionesService";

// ===============================
//  ✔️ 1. Valor inicial seguro
// ===============================
const DocenteContext = createContext({
  nivelSeleccionado: "Secundaria",
  docentes: [],
  asignaciones: {},
  horasCursos: {},
  disponibilidadDocente: {},
  reglas: {},
  horarioGeneral: null,
  loading: false,
  refresh: () => {},
  refrescarReglas: () => {},
});

// Hook seguro
export function useDocentes() {
  const ctx = useContext(DocenteContext);
  if (!ctx) {
    throw new Error(
      "useDocentes debe usarse dentro de <DocenteProvider/>"
    );
  }
  return ctx;
}

export function DocenteProvider({ children }) {
  // Estado principal
  const [nivelSeleccionado, setNivelSeleccionado] = useState("Secundaria");
  const [docentes, setDocentes] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [horasCursos, setHorasCursos] = useState({});
  const [disponibilidadDocente, setDisponibilidadDocente] = useState({});
  const [reglas, setReglas] = useState({});
  const [horarioGeneral, setHorarioGeneral] = useState(null);
  const [loading, setLoading] = useState(false);

  // =======================
  // CARGA DATOS PRINCIPALES
  // =======================
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // DOCENTES
      const { data: docentesData, error: docErr } = await supabase
        .from("docentes")
        .select(
          "id, nombre, apellido, tipo_profesor, jornada_total, aula_id, nivel, activo"
        )
        .eq("activo", true)
        .order("apellido");

      if (docErr) throw docErr;
      setDocentes(docentesData || []);

      // ASIGNACIONES
      const { data: asignData, error: asignErr } = await supabase
        .from("asignaciones")
        .select(
          `
          id,
          docente_id,
          curso_id,
          grado_id,
          horas,
          curso:curso_id(nombre)
        `
        );

      if (asignErr) throw asignErr;

      const asignMap = {};
      asignData?.forEach((a) => {
        if (!asignMap[a.curso_id]) asignMap[a.curso_id] = {};
        asignMap[a.curso_id][a.grado_id] = {
          docente_id: a.docente_id,
          nombre: a.curso?.nombre,
        };
      });

      setAsignaciones(asignMap);

      // HORAS
      const { data: horasData, error: horasErr } = await supabase
        .from("horas_curso_grado")
        .select("curso_id, grado_id, horas");

      if (horasErr) throw horasErr;

      const horasMap = {};
      horasData?.forEach((h) => {
        if (!horasMap[h.curso_id]) horasMap[h.curso_id] = {};
        horasMap[h.curso_id][h.grado_id] = h.horas;
      });

      setHorasCursos(horasMap);

      // DISPONIBILIDAD
      const { data: restrData, error: restrErr } = await supabase
        .from("restricciones_docente")
        .select("docente_id, dia, bloque");

      if (restrErr) throw restrErr;

      const dispMap = {};
      restrData?.forEach((r) => {
        const key = `${r.dia}-${r.bloque}`;
        if (!dispMap[r.docente_id]) dispMap[r.docente_id] = {};
        dispMap[r.docente_id][key] = true;
      });

      setDisponibilidadDocente(dispMap);
    } catch (e) {
      console.error("❌ Error en DocenteContext.refresh():", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // =======================
  // CARGA REGLAS DEL NIVEL
  // =======================
  const cargarReglas = useCallback(async () => {
    try {
      const r = await loadReglasParaNivel(nivelSeleccionado);
      setReglas(r || {});
    } catch (e) {
      console.error("❌ Error cargando reglas:", e);
      setReglas({});
    }
  }, [nivelSeleccionado]);

  useEffect(() => {
    cargarReglas();
  }, [cargarReglas]);

  const refrescarReglas = useCallback(async () => {
    await cargarReglas();
  }, [cargarReglas]);

  // =======================
  // VALOR EXPUESTO
  // =======================
  const value = {
    nivelSeleccionado,
    setNivelSeleccionado,
    docentes,
    setDocentes,
    asignaciones,
    setAsignaciones,
    horasCursos,
    setHorasCursos,
    disponibilidadDocente,
    setDisponibilidadDocente,
    reglas,
    setReglas,
    refrescarReglas,
    horarioGeneral,
    setHorarioGeneral,
    loading,
    refresh,
  };

  return (
    <DocenteContext.Provider value={value}>
      {children}
    </DocenteContext.Provider>
  );
}

