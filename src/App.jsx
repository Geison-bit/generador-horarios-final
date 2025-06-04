import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";

// ✅ Importaciones de componentes
import DocentesForm from "./components/DocentesForm";
import FranjasHorariasForm from "./components/FranjasHorariasForm";
import RestriccionesForm from "./components/RestriccionesForm";
import HorarioTable from "./components/HorarioTable";
import HorarioPorDocente from "./components/HorarioPorDocente";
import AsignacionDocentesPage from "./pages/AsignacionDocentesPage";
import AulasForm from "./components/AulasForm"; // ✅ NUEVA RUTA AGREGADA

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
        <Route path="/aulas" element={<AulasForm />} /> {/* ✅ NUEVA PANTALLA */}
      </Routes>
    </Router>
  );
}

export default App;
