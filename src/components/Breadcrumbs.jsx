import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const rutas = [
  { label: "Registrar Docentes", path: "/docentes" },
  { label: "Asignar Materias", path: "/asignacion" },
  { label: "Franjas Horarias", path: "/franjas" },
  { label: "Restricciones", path: "/restricciones" },
  { label: "Horario General", path: "/horario" },
  { label: "Horario por Docente", path: "/horario-docente" }
];

const Breadcrumbs = () => {
  const [nivel, setNivel] = useState("Primaria");
  const location = useLocation();
  const navigate = useNavigate();

  // Detectar nivel educativo desde la URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nivelURL = params.get("nivel");

    if (nivelURL) {
      setNivel(nivelURL);
      localStorage.setItem("nivelSeleccionado", nivelURL);
    } else {
      const guardado = localStorage.getItem("nivelSeleccionado") || "Primaria";
      setNivel(guardado);
    }
  }, [location.search]);

  // Buscar ruta actual según el pathname
  const rutaActual = rutas.find((ruta) => location.pathname.startsWith(ruta.path));

  const irA = (path) => {
    navigate(`${path}?nivel=${nivel}`);
  };

  return (
    <div className="bg-gray-100 p-3 rounded shadow flex flex-wrap gap-3 items-center justify-between mb-6">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-lg font-semibold text-blue-700">
          🏫 Nivel seleccionado: {nivel}
        </span>
        <span className="text-sm text-gray-600">
          📍 Estás en:{" "}
          <strong>
            {rutaActual ? rutaActual.label : "Inicio"}
          </strong>
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => navigate(`/`)}
          className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
        >
          🏠 Inicio
        </button>
        {rutas.map((ruta) => (
          <button
            key={ruta.path}
            onClick={() => irA(ruta.path)}
            className={`px-3 py-1 rounded ${
              location.pathname.startsWith(ruta.path)
                ? "bg-blue-200 font-semibold"
                : "bg-gray-200 hover:bg-gray-300"
            }`}
          >
            {ruta.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Breadcrumbs;
