// src/pages/AsignacionDocentesPage.jsx
import { useLocation } from "react-router-dom";
import AsignacionDocenteCurso from "../components/AsignacionDocenteCurso";
import AsignacionDocentePrimaria from "../components/AsignacionDocentePrimaria"; // ✅ ruta corregida

const AsignacionDocentesPage = () => {
  const location = useLocation();
  const nivel = new URLSearchParams(location.search).get("nivel") || "Secundaria";

  return nivel === "Primaria" ? <AsignacionDocentePrimaria /> : <AsignacionDocenteCurso />;
};

export default AsignacionDocentesPage;
