import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";

// ✅ Importaciones corregidas desde ./components
import DocentesForm from "./components/DocentesForm";
import FranjasHorariasForm from "./components/FranjasHorariasForm";
import RestriccionesForm from "./components/RestriccionesForm";
import HorarioTable from "./components/HorarioTable";
import HorarioPorDocente from "./components/HorarioPorDocente";

// ✅ Contenedor dinámico de asignaciones
import AsignacionDocentesPage from "./pages/AsignacionDocentesPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docentes" element={<DocentesForm />} />
        <Route path="/franjas" element={<FranjasHorariasForm />} />
        <Route path="/asignacion" element={<AsignacionDocentesPage />} />
        <Route path="/restricciones" element={<RestriccionesForm />} />
        <Route path="/horario" element={<HorarioTable />} />
        <Route path="/horario-docente" element={<HorarioPorDocente />} />
      </Routes>
    </Router>
  );
}

export default App;
