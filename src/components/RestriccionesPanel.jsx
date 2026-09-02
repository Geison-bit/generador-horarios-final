// src/pages/RestriccionesPanel.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import Breadcrumbs from "../components/Breadcrumbs";
import { useDocentes } from "../context(CONTROLLER)/DocenteContext";
import { supabase } from "../supabaseClient";
import {
  loadCatalogoRestricciones,
  loadReglasParaNivel,
  saveReglasParaNivel,
} from "../services/restriccionesService";

const CATALOGO_FALLBACK = {
  disponibilidad_docente: {
    nombre: "Respetar disponibilidad del docente",
    descripcion: "No asigna clases en horas o dias marcados como no disponibles.",
  },
  no_solape_docente: {
    nombre: "Evitar solape del mismo docente por bloque",
    descripcion: "Un docente no puede dictar a dos grados en el mismo bloque.",
  },
  bloques_consecutivos: {
    nombre: "Usar bloques consecutivos por segmento",
    descripcion: "Agrupa horas del mismo curso en sesiones continuas (2-3 seguidas).",
  },
  distribuir_en_dias_distintos: {
    nombre: "Distribuir segmentos en dias distintos",
    descripcion: "Evita concentrar todas las horas de un curso en un solo dia.",
  },
  no_dias_consecutivos: {
    nombre: "Evitar dias consecutivos por curso",
    descripcion: "Evita 3 dias seguidos y desincentiva dias consecutivos (solo cursos >4h).",
  },
  no_puentes_docente: {
    nombre: "Evitar puentes del docente",
    descripcion: "Evita huecos intermedios entre clases del mismo docente en un dia.",
  },
  prohibir_sesiones_1h: {
    nombre: "Omitir cursos con 1h",
    descripcion: "No intenta ubicar materias que solo tienen 1 hora semanal.",
  },
  limitar_carga_docente_grado: {
    nombre: "Maximo 3h por docente en un grado al dia",
    descripcion: "Evita que un docente dicte mas de 3 horas al mismo grado en un dia.",
  },
};

const normalizarCatalogo = (items = []) =>
  items.map((item) => {
    const meta = CATALOGO_FALLBACK[item.key] || {};
    return {
      ...item,
      nombre: item.nombre || meta.nombre || item.key,
      descripcion: item.descripcion || meta.descripcion || "",
    };
  });

export default function RestriccionesPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nivel = params.get("nivel") || "Secundaria";
  const versionParam = Number(params.get("version")) || 1;

  const { refrescarReglas } = useDocentes();

  const [catalogo, setCatalogo] = useState([]);
  const [reglas, setReglas] = useState({});
  const [versiones, setVersiones] = useState([versionParam]);
  const [versionSeleccionada, setVersionSeleccionada] = useState(versionParam);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setVersionSeleccionada(versionParam);
  }, [versionParam]);

  useEffect(() => {
    const cargarVersiones = async () => {
      const { data, error: versionError } = await supabase
        .from("franjas_horarias")
        .select("version_num")
        .eq("nivel", nivel)
        .order("version_num", { ascending: true });

      if (!versionError && data?.length) {
        const unique = Array.from(new Set(data.map((v) => v.version_num))).sort((a, b) => a - b);
        setVersiones(unique);
        if (!unique.includes(versionParam)) {
          setVersionSeleccionada(unique[0]);
        }
        return;
      }

      setVersiones([versionParam || 1]);
    };

    cargarVersiones();
  }, [nivel, versionParam]);

  useEffect(() => {
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("version", String(versionSeleccionada));
    if (nextParams.toString() !== location.search.replace(/^\?/, "")) {
      navigate({ search: nextParams.toString() }, { replace: true });
    }
  }, [versionSeleccionada, navigate, location.search]);

  // -------------------- CARGA --------------------
  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      setError("");
      try {
        const [reglasCargadas, catalogoCargado] = await Promise.all([
          loadReglasParaNivel(nivel, versionSeleccionada),
          loadCatalogoRestricciones(),
        ]);
        setReglas(reglasCargadas || {});
        setCatalogo(normalizarCatalogo(catalogoCargado || []));
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
          no_puentes_docente: true,
          no_dias_consecutivos: true,
          prohibir_sesiones_1h: true,
          limitar_carga_docente_grado: true,
        };
        setReglas(fallback);
        setCatalogo(
          normalizarCatalogo(
            Object.keys(fallback).map((key) => ({
              key,
              nombre: "",
              descripcion: "",
            }))
          )
        );
      } finally {
        setCargando(false);
      }
    };

    cargar();
  }, [nivel, versionSeleccionada]);

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
      await saveReglasParaNivel(nivel, reglas, versionSeleccionada);
      await refrescarReglas({ nivel, versionNum: versionSeleccionada });
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

      <div className="mt-4 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-800 flex items-center gap-2">
          <span className="inline-flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-200 size-10">
            <ShieldCheck className="size-6" aria-hidden="true" />
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

      <div className="mt-2 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:gap-4">
        <div>
          Nivel: <b>{nivel}</b>
        </div>
        <div className="flex items-center gap-2">
          <span>Version</span>
          <select
            value={versionSeleccionada}
            onChange={(e) => setVersionSeleccionada(Number(e.target.value))}
            disabled={cargando}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            {versiones.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
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
