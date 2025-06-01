import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import es from "date-fns/locale/es";
import { supabase } from "../supabaseClient";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import Breadcrumbs from "../components/Breadcrumbs";

const locales = { es };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

const RestriccionesForm = () => {
  const [docentes, setDocentes] = useState([]);
  const [docenteSeleccionado, setDocenteSeleccionado] = useState("");
  const [eventos, setEventos] = useState([]);
  const { setRestricciones } = useDocentes();

  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivelURL = params.get("nivel") || "Secundaria";

  useEffect(() => {
    cargarDocentes();
  }, [nivelURL]);

  useEffect(() => {
    if (docenteSeleccionado) cargarRestriccionesGuardadas();
  }, [docenteSeleccionado]);

  const cargarDocentes = async () => {
    const { data } = await supabase
      .from("docentes")
      .select("id, nombre")
      .eq("nivel", nivelURL);
    setDocentes(data || []);
  };

  const cargarRestriccionesGuardadas = async () => {
    const docente = docentes.find((d) => d.nombre === docenteSeleccionado);
    if (!docente) return;

    const { data } = await supabase
      .from("restricciones_docente")
      .select()
      .eq("docente_id", docente.id)
      .eq("nivel", nivelURL);

    const nuevosEventos = (data || []).map((r) => {
      const diaSemana = ["lunes", "martes", "miércoles", "jueves", "viernes"];
      const indiceDia = diaSemana.indexOf(r.dia);
      const inicioBase = new Date(2024, 3, 22 + indiceDia, 7, 15);
      const start = new Date(inicioBase.getTime() + r.bloque * 45 * 60000);
      const end = new Date(start.getTime() + 45 * 60000);
      return { title: "Disponible", start, end };
    });

    setEventos(nuevosEventos);
  };

  const manejarSeleccion = ({ start, end }) => {
    const seSuperpone = eventos.some(
      (evento) => start < evento.end && end > evento.start
    );

    if (!seSuperpone) {
      setEventos([...eventos, { start, end, title: "Disponible" }]);
    } else {
      alert("⚠ Ya existe una disponibilidad en ese horario.");
    }
  };

  const manejarDobleClickEvento = (eventoEliminado) => {
    if (window.confirm("¿Deseas eliminar esta disponibilidad?")) {
      setEventos(
        eventos.filter(
          (e) =>
            !(
              e.start.getTime() === eventoEliminado.start.getTime() &&
              e.end.getTime() === eventoEliminado.end.getTime()
            )
        )
      );
    }
  };

  const guardarRestricciones = async () => {
    if (!docenteSeleccionado) return alert("Seleccione un docente.");
    const docente = docentes.find((d) => d.nombre === docenteSeleccionado);
    if (!docente) return alert("Docente no encontrado.");

    // Elimina solo restricciones del docente en ese nivel
    await supabase
      .from("restricciones_docente")
      .delete()
      .match({ docente_id: docente.id, nivel: nivelURL });

    const bloquesDisponibles = new Set();
    eventos.forEach(({ start, end }) => {
      const dia = start
        .toLocaleDateString("es-PE", { weekday: "long" })
        .toLowerCase();
      const horaInicio = start.getHours() + start.getMinutes() / 60;
      const horaFin = end.getHours() + end.getMinutes() / 60;

      for (let i = 0; i < 8; i++) {
        const inicioBloque = 7.25 + i * 0.75;
        const finBloque = inicioBloque + 0.75;
        if (horaInicio < finBloque && horaFin > inicioBloque) {
          bloquesDisponibles.add(`${dia}-${i}`);
        }
      }
    });

    const restricciones = [];
    const restriccionesMap = {};
    for (let clave of bloquesDisponibles) {
      const [dia, bloqueStr] = clave.split("-");
      const bloque = parseInt(bloqueStr);
      restricciones.push({
        docente_id: docente.id,
        dia,
        bloque,
        nivel: nivelURL, // 👈 importante
      });
      restriccionesMap[clave] = true;
    }

    const { error } = await supabase
      .from("restricciones_docente")
      .insert(restricciones);
    if (error) {
      alert("❌ Error al guardar restricciones");
      console.error(error);
    } else {
      alert("✅ Restricciones guardadas correctamente");
      if (setRestricciones) {
        setRestricciones((prev) => ({
          ...prev,
          [docente.id.toString()]: restriccionesMap,
        }));
      }
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <Breadcrumbs />
      <h2 className="text-xl font-semibold mb-4">
        Restricciones tipo calendario ({nivelURL})
      </h2>

      <select
        value={docenteSeleccionado}
        onChange={(e) => setDocenteSeleccionado(e.target.value)}
        className="border px-3 py-2 mb-4 rounded w-full"
      >
        <option value="">-- Seleccione un docente --</option>
        {docentes.map((d) => (
          <option key={d.id} value={d.nombre}>
            {d.nombre}
          </option>
        ))}
      </select>

      {docenteSeleccionado && (
        <>
          <div className="bg-white border rounded mb-4" style={{ height: 600 }}>
            <Calendar
              localizer={localizer}
              events={eventos}
              startAccessor="start"
              endAccessor="end"
              selectable
              defaultView="week"
              views={["week"]}
              timeslots={1}
              step={45}
              onSelectSlot={manejarSeleccion}
              onDoubleClickEvent={manejarDobleClickEvento}
              defaultDate={new Date(2024, 3, 22)}
              min={new Date(1970, 1, 1, 7, 15)}
              max={new Date(1970, 1, 1, 13, 30)}
              toolbar={false}
              formats={{
                dayFormat: (date) =>
                  ["Lun", "Mar", "Mié", "Jue", "Vie"][date.getDay() - 1],
              }}
              dayPropGetter={(date) =>
                date.getDay() === 0 || date.getDay() === 6
                  ? { style: { display: "none" } }
                  : {}
              }
            />
          </div>

          <button
            onClick={guardarRestricciones}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Guardar restricciones
          </button>
        </>
      )}
    </div>
  );
};

export default RestriccionesForm;
