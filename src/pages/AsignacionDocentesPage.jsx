// src/pages/AsignacionDocentesPage.jsx
import { useLocation } from "react-router-dom";
import AsignacionDocenteCurso from "../components/AsignacionDocenteCurso";
import AsignacionDocentePrimaria from "../components/AsignacionDocentePrimaria"; // ✅ ruta corregida

const AsignacionDocentesPage = () => {
  const location = useLocation();
  const nivel = new URLSearchParams(location.search).get("nivel") || "Secundaria";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {nivel === "Primaria" ? <AsignacionDocentePrimaria /> : <AsignacionDocenteCurso />}
    </div>
  );
};

export default AsignacionDocentesPage;
