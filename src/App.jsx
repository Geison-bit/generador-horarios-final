import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./auth/Login";
import ProtectedRoute from "./auth/ProtectedRoute";

// Rutas existentes
import DocentesForm from "./features/docentes/DocentesForm";
import FranjasHorariasForm from "./features/configuracion/FranjasHorariasForm";
import RestriccionesForm from "./features/disponibilidad/RestriccionesForm";
import HorarioTable from "./features/horarios/HorarioTable";
import HorarioPorDocente from "./features/horarios/HorarioPorDocente";
import AsignacionDocentesPage from "./pages/AsignacionDocentesPage";
import AulasForm from "./features/configuracion/AulasForm";
import SeccionesForm from "./features/configuracion/SeccionesForm";

// Panel de restricciones
import RestriccionesPanel from "./features/reglas/RestriccionesPanel";
import ReglasIAForm from "./features/reglas/ReglasIAForm";

// Gestión y roles
import DocentesAdmin from "./features/administracion/DocentesAdmin";
import CrearUsuario from "./pages/CrearUsuario";
import BitacoraAuditoriaPage from "./pages/BitacoraAuditoriaPage";
import GestionCuentas from "./features/administracion/GestionCuentas";

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
          path="/secciones"
          element={
            <ProtectedRoute>
              <SeccionesForm />
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
          path="/reglas-ia"
          element={
            <ProtectedRoute>
              <ReglasIAForm />
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
