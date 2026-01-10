// src/pages/RestriccionesPanel.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import Breadcrumbs from "../components/Breadcrumbs";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import {
  loadReglasParaNivel,
  saveReglasParaNivel,
} from "../services/restriccionesService";

export default function RestriccionesPanel() {
  const navigate = useNavigate();
  const nivel =
    new URLSearchParams(useLocation().search).get("nivel") || "Secundaria";

  const { refrescarReglas } = useDocentes();

  const [catalogo, setCatalogo] = useState([]);
  const [reglas, setReglas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // -------------------- CARGA --------------------
  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      setError("");
      try {
        // 1) Cargar reglas efectivas para el nivel
        const reglasCargadas = await loadReglasParaNivel(nivel);
        setReglas(reglasCargadas || {});

        // 2) Catálogo visible (usa texto “base” por si la tabla no tiene nombre/desc)
        const baseCatalogo = [
          {
            key: "disponibilidad_docente",
            nombre: "Respetar disponibilidad del docente",
            descripcion:
              "No asigna clases en horas o días marcados como no disponibles.",
          },
          {
            key: "no_solape_docente",
            nombre: "Evitar solape del mismo docente por bloque",
            descripcion:
              "Un docente no puede dictar a dos grados en el mismo bloque.",
          },
          {
            key: "bloques_consecutivos",
            nombre: "Usar bloques consecutivos por segmento",
            descripcion:
              "Agrupa horas del mismo curso en sesiones continuas (2–3 seguidas).",
          },
          {
            key: "distribuir_en_dias_distintos",
            nombre: "Distribuir segmentos en días distintos",
            descripcion:
              "Evita concentrar todas las horas de un curso en un solo día.",
          },
          {
            key: "omitir_cursos_1h",
            nombre: "Omitir cursos con 1h",
            descripcion:
              "No intenta ubicar materias que solo tienen 1 hora semanal.",
          },
        ];
        setCatalogo(baseCatalogo);
      } catch (e) {
        console.error(e);
        setError(
          "No fue posible cargar las reglas. Se muestran valores por defecto."
        );
        const fallback = {
          disponibilidad_docente: true,
          no_solape_docente: true,
          bloques_consecutivos: true,
          distribuir_en_dias_distintos: true,
          omitir_cursos_1h: true,
        };
        setReglas(fallback);
        setCatalogo(
          Object.keys(fallback).map((key) => ({
            key,
            nombre: key,
            descripcion: "",
          }))
        );
      } finally {
        setCargando(false);
      }
    };

    cargar();
  }, [nivel]);

  // -------------------- HANDLERS --------------------
  const toggleRegla = (key) =>
    setReglas((p) => ({
      ...p,
      [key]: !p[key],
    }));

  const aplicarTodas = () => {
    const allOn = {};
    catalogo.forEach((i) => (allOn[i.key] = true));
    setReglas(allOn);
  };

  const noAplicarTodas = () => {
    const allOff = {};
    catalogo.forEach((i) => (allOff[i.key] = false));
    setReglas(allOff);
  };

  const guardar = async () => {
    try {
      setCargando(true);
      await saveReglasParaNivel(nivel, reglas); // guarda overrides (solo difiere de defaults)
      await refrescarReglas(); // 🔁 actualiza contexto global para que el generador use las nuevas reglas
      alert("✅ Reglas guardadas y aplicadas correctamente.");
    } catch (e) {
      console.error(e);
      alert("❌ No se pudieron guardar los cambios.");
    } finally {
      setCargando(false);
    }
  };

  // -------------------- UI --------------------
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Breadcrumbs />

      <div className="mt-6 md:mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <span className="inline-flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 p-2 ring-1 ring-indigo-200">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>Restricciones aplicadas</span>
        </h1>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <button
            onClick={aplicarTodas}
            disabled={cargando}
            className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 w-full sm:w-auto"
          >
            Aplicar todas
          </button>
          <button
            onClick={noAplicarTodas}
            disabled={cargando}
            className="px-3 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 w-full sm:w-auto"
          >
            No aplicar todas
          </button>
          <button
            onClick={guardar}
            disabled={cargando}
            className="px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 w-full sm:w-auto"
          >
            Guardar cambios
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 rounded border w-full sm:w-auto"
          >
            Cerrar
          </button>
        </div>
      </div>

      <div className="mt-2 text-sm text-slate-600">
        Nivel: <b>{nivel}</b>
      </div>

      {error && (
        <div className="mt-3 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="px-4 py-3 border-b bg-slate-50 rounded-t-2xl">
          <h3 className="font-semibold text-slate-900">Reglas del modelo</h3>
          <p className="text-xs text-slate-500">
            Activa o desactiva las reglas globales que el generador aplicará.
          </p>
        </header>

        <ul className="divide-y">
          {catalogo.map(({ key, nombre, descripcion }) => {
            const activo = !!reglas[key];
            return (
              <li
                key={key}
                className="flex items-start justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{nombre}</p>
                  <p className="text-sm text-slate-600">{descripcion}</p>
                </div>

                <button
                  onClick={() => toggleRegla(key)}
                  disabled={cargando}
                  className={`shrink-0 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    activo
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-rose-50 border-rose-200 text-rose-700"
                  } disabled:opacity-50`}
                >
                  {activo ? "✓ Aplica" : "✕ No aplica"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-4 text-xs text-slate-500">
        Estos switches controlan la lógica del generador. Puedes cambiarlos
        antes de crear un nuevo horario.
      </p>
    </div>
  );
}
