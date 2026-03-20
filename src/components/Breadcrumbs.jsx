import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, ChevronRight, GraduationCap } from "lucide-react";

const RUTAS = [
  { step: 1, label: "Franjas Horarias", path: "/franjas", group: "horarios" },
  { step: 2, label: "Asignar Materias", path: "/asignacion", group: "horarios" },
  { step: 3, label: "Registrar Docentes", path: "/docentes", group: "horarios" },
  { step: 4, label: "Registrar Aulas", path: "/aulas", group: "horarios" },
  { step: 5, label: "Disponibilidad", path: "/restricciones", group: "horarios" },
  { step: 6, label: "Panel de restricciones", path: "/restricciones-panel", group: "horarios" },
  { step: 7, label: "Horario General", path: "/horario", group: "horarios" },
  { step: 8, label: "Horario por Docente", path: "/horario-docente", group: "horarios" },
  { step: 9, label: "Crear Usuario", path: "/admin/usuarios/crear", group: "admin" },
  { step: 10, label: "Gestion de Cuentas", path: "/admin/cuentas", group: "admin" },
  { step: 11, label: "Gestion de Docentes", path: "/admin/docentes", group: "admin" },
  { step: 12, label: "Bitacora de Auditoria", path: "/admin/auditoria", group: "admin" },
];

function getChipClasses(group, activo) {
  if (group === "admin") {
    return activo
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  }
  return activo
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
}

function getStepClasses(group, activo) {
  if (group === "admin") {
    return activo
      ? "bg-emerald-600 text-white ring-emerald-200"
      : "bg-emerald-100 text-emerald-700 ring-emerald-100";
  }
  return activo
    ? "bg-blue-600 text-white ring-blue-200"
    : "bg-blue-100 text-blue-700 ring-blue-100";
}

export default function Breadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();

  const [nivel, setNivel] = useState("Primaria");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qNivel = params.get("nivel");
    if (qNivel) {
      setNivel(qNivel);
      localStorage.setItem("nivelSeleccionado", qNivel);
    } else {
      const guardado = localStorage.getItem("nivelSeleccionado") || "Primaria";
      setNivel(guardado);
    }
  }, [location.search]);

  const onNivelChange = (nuevo) => {
    setNivel(nuevo);
    localStorage.setItem("nivelSeleccionado", nuevo);
    const params = new URLSearchParams(location.search);
    params.set("nivel", nuevo);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  const rutaActual = useMemo(
    () => RUTAS.find((r) => location.pathname.startsWith(r.path)),
    [location.pathname]
  );

  const crumbs = useMemo(() => {
    const items = [{ label: "Inicio", path: "/" }];
    if (rutaActual) items.push({ label: rutaActual.label, path: rutaActual.path });
    return items;
  }, [rutaActual]);

  const irA = (path) => {
    const params = new URLSearchParams(location.search);
    params.set("nivel", nivel);
    navigate(`${path}?${params.toString()}`);
  };

  return (
    <div className="w-full px-4">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex min-h-[52px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex items-center gap-3">
              <div className="inline-flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                <GraduationCap className="size-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium leading-9 text-slate-600">Nivel</span>
                <select
                  aria-label="Seleccionar nivel"
                  className="h-9 min-w-[140px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={nivel}
                  onChange={(e) => onNivelChange(e.target.value)}
                >
                  <option value="Primaria">Primaria</option>
                  <option value="Secundaria">Secundaria</option>
                </select>
              </div>
            </div>

            <nav aria-label="Breadcrumb" className="flex min-h-[36px] items-center text-sm">
              <ol className="flex items-center gap-2 text-slate-600">
                {crumbs.map((c, idx) => (
                  <li key={c.path} className="inline-flex items-center gap-2">
                    {idx === 0 ? (
                      <button
                        onClick={() => irA("/")}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <Home className="size-4" aria-hidden="true" />
                        <span className="font-medium">{c.label}</span>
                      </button>
                    ) : (
                      <span className="font-medium text-slate-800">{c.label}</span>
                    )}
                    {idx < crumbs.length - 1 && (
                      <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-500">Módulos</span>
              <button onClick={() => irA("/")} className="text-xs font-medium text-blue-700 hover:underline">
                Ir al inicio
              </button>
            </div>

            <div
              className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory"
              role="tablist"
              aria-label="Navegación de módulos"
            >
              {RUTAS.map((ruta) => {
                const activo = location.pathname.startsWith(ruta.path);
                return (
                  <button
                    key={ruta.path}
                    role="tab"
                    aria-selected={activo}
                    onClick={() => irA(ruta.path)}
                    className={`snap-start inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${getChipClasses(ruta.group, activo)}`}
                  >
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold ring-2 ${getStepClasses(ruta.group, activo)}`}
                    >
                      {ruta.step}
                    </span>
                    <span>{ruta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
