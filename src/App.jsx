import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./auth/Login";
import ProtectedRoute from "./auth/ProtectedRoute";

// Rutas existentes
import DocentesForm from "./components/DocentesForm";
import FranjasHorariasForm from "./components/FranjasHorariasForm";
import RestriccionesForm from "./components/RestriccionesForm";
import HorarioTable from "./components/HorarioTable";
import HorarioPorDocente from "./components/HorarioPorDocente";
import AsignacionDocentesPage from "./pages/AsignacionDocentesPage";
import AulasForm from "./components/AulasForm";

// Panel de restricciones
import RestriccionesPanel from "./components/RestriccionesPanel";

// Gestión y roles
import DocentesAdmin from "./components/DocentesAdmin";
import RolesAdmin from "./components/RolesAdmin";
import CrearUsuario from "./pages/CrearUsuario";
import BitacoraAuditoriaPage from "./pages/BitacoraAuditoriaPage";
import GestionCuentas from "./components/GestionCuentas";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />

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

        <Route
          path="/restricciones"
          element={
            <ProtectedRoute>
              <RestriccionesForm />
            </ProtectedRoute>
          }
        />
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
        <Route
          path="/admin/cuentas"
          element={
            <ProtectedRoute>
              <GestionCuentas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/usuarios/crear"
          element={
            <ProtectedRoute>
              <CrearUsuario />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/auditoria"
          element={
            <ProtectedRoute>
              <BitacoraAuditoriaPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<div className="p-6">Ruta no encontrada</div>} />
      </Routes>
    </Router>
  );
}

export default App;
