import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const DocenteContext = createContext();

export const useDocentes = () => useContext(DocenteContext);

export const DocenteProvider = ({ children }) => {
  const [docentes, setDocentes] = useState([]);
  const [restricciones, setRestricciones] = useState({});
  const [asignaciones, setAsignaciones] = useState({});
  const [horasCursos, setHorasCursos] = useState({});
  const [horarioGeneral, setHorarioGeneral] = useState(null); // ✅ NUEVO

  useEffect(() => {
    const fetchData = async () => {
      try {
        // ✅ Docentes (incluye 'nivel')
        const { data: docentesData } = await supabase
          .from("docentes")
          .select("id, nombre, jornada_total, aula_id, nivel");
        setDocentes(docentesData || []);

        // Asignaciones agrupadas por curso_id y grado_id
        const { data: asignacionesData } = await supabase
          .from("asignaciones")
          .select(`
            id,
            docente_id,
            curso_id,
            grado_id,
            horas,
            curso:curso_id (nombre)
          `);

        const asignacionesMap = {};
        (asignacionesData || []).forEach(a => {
          if (!asignacionesMap[a.curso_id]) asignacionesMap[a.curso_id] = {};
          asignacionesMap[a.curso_id][a.grado_id] = {
            docente_id: a.docente_id,
            nombre: a.curso?.nombre || "Sin nombre"
          };
        });
        setAsignaciones(asignacionesMap);

        // Horas por curso y grado
        const { data: horasData } = await supabase
          .from("horas_curso_grado")
          .select("curso_id, grado_id, horas");

        const horasMap = {};
        (horasData || []).forEach(h => {
          if (!horasMap[h.curso_id]) horasMap[h.curso_id] = {};
          horasMap[h.curso_id][h.grado_id] = h.horas;
        });
        setHorasCursos(horasMap);

        // Restricciones por docente, día y bloque
        const { data: restriccionesData } = await supabase
          .from("restricciones_docente")
          .select("docente_id, dia, bloque");

        const restriccionesMap = {};
        (restriccionesData || []).forEach(r => {
          const key = `${r.dia}-${r.bloque}`;
          if (!restriccionesMap[r.docente_id]) restriccionesMap[r.docente_id] = {};
          restriccionesMap[r.docente_id][key] = true;
        });
        setRestricciones(restriccionesMap);

      } catch (error) {
        console.error("❌ Error al cargar datos del contexto:", error);
      }
    };

    fetchData();
  }, []);

  return (
    <DocenteContext.Provider
      value={{
        docentes,
        setDocentes,
        restricciones,
        setRestricciones,
        asignaciones,
        setAsignaciones,
        horasCursos,
        setHorasCursos,
        horarioGeneral,
        setHorarioGeneral // ✅ NUEVO
      }}
    >
      {children}
    </DocenteContext.Provider>
  );
};
