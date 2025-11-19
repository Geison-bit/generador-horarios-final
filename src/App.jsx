import Home from "./pages/Home";

import DocentesForm from "./components/DocentesForm";
import FranjasHorariasForm from "./components/FranjasHorariasForm";
import RestriccionesForm from "./components/RestriccionesForm";
import HorarioTable from "./components/HorarioTable";
import HorarioPorDocente from "./components/HorarioPorDocente";
import AsignacionDocentesPage from "./pages/AsignacionDocentesPage";
import AulasForm from "./components/AulasForm";
import RestriccionesPanel from "./components/RestriccionesPanel";
import DocentesAdmin from "./components/DocentesAdmin";
import { RolesAdminInner } from "./components/RolesAdmin";

import GestionCuentasPage from "./components/GestiónCuentas";
import BitacoraAuditoriaPage from "./pages/BitacoraAuditoriaPage";

import ProtectedRoute from "./auth/ProtectedRoute";
import Login from "./auth/login";

import { Routes, Route, Navigate } from "react-router-dom";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">  {/* ⬅️ layout base */}
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Rutas protegidas */}
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

        {/* Admin */}
        <Route
          path="/admin/docentes"
          element={
            <ProtectedRoute need={["user.read"]}>
              <DocentesAdmin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/roles"
          element={
            <ProtectedRoute need={["role.read"]}>
              <RolesAdminInner />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/cuentas"
          element={
            <ProtectedRoute need={["user.read"]}>
              <GestionCuentasPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/auditoria"
          element={
            <ProtectedRoute need={["audit.read"]}>
              <BitacoraAuditoriaPage />
            </ProtectedRoute>
          }
        />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
