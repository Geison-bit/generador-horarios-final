import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./auth/Login";
import ProtectedRoute from "./auth/ProtectedRoute";

// ƒo. Rutas existentes
import DocentesForm from "./components/DocentesForm";
import FranjasHorariasForm from "./components/FranjasHorariasForm";
import RestriccionesForm from "./components/RestriccionesForm"; // Disponibilidad del profesor
import HorarioTable from "./components/HorarioTable";
import HorarioPorDocente from "./components/HorarioPorDocente";
import AsignacionDocentesPage from "./pages/AsignacionDocentesPage";
import AulasForm from "./components/AulasForm";

// ƒo. NUEVO: Panel de restricciones (no reemplaza al form de disponibilidad)
import RestriccionesPanel from "./components/RestriccionesPanel";

// ƒo. NUEVO: GestiÇün (CRUD) y Roles
import DocentesAdmin from "./components/DocentesAdmin";
import RolesAdmin from "./components/RolesAdmin";

function App() {
  return (
    <Router>
      <Routes>
        {/* Home */}
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />

        {/* Formularios / flujos actuales */}
        <Route
          path="/docentes"
          element={
            <ProtectedRoute>
              <DocentesForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/franjas"
          element={
            <ProtectedRoute>
              <FranjasHorariasForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/asignacion"
          element={
            <ProtectedRoute>
              <AsignacionDocentesPage />
            </ProtectedRoute>
          }
        />

        {/* ÐY'% Esta ruta sigue siendo el formulario de disponibilidad */}
        <Route
          path="/restricciones"
          element={
            <ProtectedRoute>
              <RestriccionesForm />
            </ProtectedRoute>
          }
        />

        {/* ÐY'% NUEVO panel general de restricciones (Aplica / No aplica) */}
        <Route
          path="/restricciones-panel"
          element={
            <ProtectedRoute>
              <RestriccionesPanel />
            </ProtectedRoute>
          }
        />

        <Route
          path="/horario"
          element={
            <ProtectedRoute>
              <HorarioTable />
            </ProtectedRoute>
          }
        />
        <Route
          path="/horario-docente"
          element={
            <ProtectedRoute>
              <HorarioPorDocente />
            </ProtectedRoute>
          }
        />
        <Route
          path="/aulas"
          element={
            <ProtectedRoute>
              <AulasForm />
            </ProtectedRoute>
          }
        />

        {/* ƒo. NUEVAS PANTALLAS DE ADMINISTRACIÇ"N */}
        <Route
          path="/admin/docentes"
          element={
            <ProtectedRoute>
              <DocentesAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <ProtectedRoute>
              <RolesAdmin />
            </ProtectedRoute>
          }
        />

        {/* (Opcional) 404 simple */}
        <Route path="*" element={<div className="p-6">Ruta no encontrada</div>} />
      </Routes>
    </Router>
  );
}

export default App;
