// src/pages/AsignacionDocentesPage.jsx
import { useLocation } from "react-router-dom";
import AsignacionDocenteCurso from "../features/docentes/AsignacionDocenteCurso";
import AsignacionDocentePrimaria from "../features/docentes/AsignacionDocentePrimaria";

const AsignacionDocentesPage = () => {
  const location = useLocation();
  const nivel = new URLSearchParams(location.search).get("nivel") || "Secundaria";

  return nivel === "Primaria" ? <AsignacionDocentePrimaria /> : <AsignacionDocenteCurso />;
};

export default AsignacionDocentesPage;
