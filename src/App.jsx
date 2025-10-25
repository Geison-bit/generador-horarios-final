import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";

// ✅ Rutas existentes
import DocentesForm from "./components/DocentesForm";
import FranjasHorariasForm from "./components/FranjasHorariasForm";
import RestriccionesForm from "./components/RestriccionesForm"; // Disponibilidad del profesor
import HorarioTable from "./components/HorarioTable";
import HorarioPorDocente from "./components/HorarioPorDocente";
import AsignacionDocentesPage from "./pages/AsignacionDocentesPage";
import AulasForm from "./components/AulasForm";

// ✅ NUEVO: Panel de restricciones (no reemplaza al form de disponibilidad)
import RestriccionesPanel from "./components/RestriccionesPanel";

// ✅ NUEVO: Gestión (CRUD) y Roles
import DocentesAdmin from "./components/DocentesAdmin";
import RolesAdmin from "./components/RolesAdmin";

function App() {
  return (
    <Router>
      <Routes>
        {/* Home */}
        <Route path="/" element={<Home />} />

        {/* Formularios / flujos actuales */}
        <Route path="/docentes" element={<DocentesForm />} />
        <Route path="/franjas" element={<FranjasHorariasForm />} />
        <Route path="/asignacion" element={<AsignacionDocentesPage />} />

        {/* 👉 Esta ruta sigue siendo el formulario de disponibilidad */}
        <Route path="/restricciones" element={<RestriccionesForm />} />

        {/* 👉 NUEVO panel general de restricciones (Aplica / No aplica) */}
        <Route path="/restricciones-panel" element={<RestriccionesPanel />} />

        <Route path="/horario" element={<HorarioTable />} />
        <Route path="/horario-docente" element={<HorarioPorDocente />} />
        <Route path="/aulas" element={<AulasForm />} />

        {/* ✅ NUEVAS PANTALLAS DE ADMINISTRACIÓN */}
        <Route path="/admin/docentes" element={<DocentesAdmin />} />
        <Route path="/admin/roles" element={<RolesAdmin />} />

        {/* (Opcional) 404 simple */}
        <Route path="*" element={<div className="p-6">Ruta no encontrada</div>} />
      </Routes>
    </Router>
  );
}

export default App;
