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
import CrearUsuario from "./pages/CrearUsuario";  // ⬅️ NUEVO IMPORT
import BitacoraAuditoriaPage from "./pages/BitacoraAuditoriaPage";

import ProtectedRoute from "./auth/ProtectedRoute";
import Login from "./auth/login";

import { Routes, Route, Navigate } from "react-router-dom";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900"> 
      <Routes>

        {/* LOGIN */}
        <Route path="/login" element={<Login />} />

        {/* HOME protegido */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />

        {/* DOCENTES */}
        <Route
          path="/docentes"
          element={
            <ProtectedRoute>
              <DocentesForm />
            </ProtectedRoute>
          }
        />

        {/* FRANJAS HORARIAS */}
        <Route
          path="/franjas"
          element={
            <ProtectedRoute>
              <FranjasHorariasForm />
            </ProtectedRoute>
          }
        />

        {/* ASIGNACIÓN DOCENTES */}
        <Route
          path="/asignacion"
          element={
            <ProtectedRoute>
              <AsignacionDocentesPage />
            </ProtectedRoute>
          }
        />

        {/* RESTRICCIONES */}
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

        {/* HORARIO GENERAL */}
        <Route
          path="/horario"
          element={
            <ProtectedRoute>
              <HorarioTable />
            </ProtectedRoute>
          }
        />

        {/* HORARIO POR DOCENTE */}
        <Route
          path="/horario-docente"
          element={
            <ProtectedRoute>
              <HorarioPorDocente />
            </ProtectedRoute>
          }
        />

        {/* AULAS */}
        <Route
          path="/aulas"
          element={
            <ProtectedRoute>
              <AulasForm />
            </ProtectedRoute>
          }
        />

        {/* ADMIN: DOCENTES */}
        <Route
          path="/admin/docentes"
          element={
            <ProtectedRoute need={["user.read"]}>
              <DocentesAdmin />
            </ProtectedRoute>
          }
        />

        {/* ADMIN: ROLES */}
        <Route
          path="/admin/roles"
          element={
            <ProtectedRoute need={["role.read"]}>
              <RolesAdminInner />
            </ProtectedRoute>
          }
        />

        {/* ADMIN: CUENTAS */}
        <Route
          path="/admin/cuentas"
          element={
            <ProtectedRoute need={["user.read"]}>
              <GestionCuentasPage />
            </ProtectedRoute>
          }
        />

        {/* 🔥 NUEVA RUTA: CREAR USUARIO */}
        <Route
          path="/admin/cuentas/crear"
          element={
            <ProtectedRoute need={["user.read"]}>
              <CrearUsuario />
            </ProtectedRoute>
          }
        />

        {/* AUDITORÍA */}
        <Route
          path="/auditoria"
          element={
            <ProtectedRoute need={["audit.read"]}>
              <BitacoraAuditoriaPage />
            </ProtectedRoute>
          }
        />

        {/* NOT FOUND */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </div>
  );
}
