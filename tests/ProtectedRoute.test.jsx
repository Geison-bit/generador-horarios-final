import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "../src/auth/ProtectedRoute";
import { vi } from "vitest";

// ================================
// MOCK: useAuth()
// ================================
vi.mock("../src/auth/AuthContext", () => ({
  useAuth: () => mockAuthValues,
}));

let mockAuthValues = {
  user: null,
  permissions: [],
  loading: false,
};

function DummyPage() {
  return <div>Contenido Protegido</div>;
}

describe("ProtectedRoute Component", () => {
  test("redirige a /login si NO hay usuario", () => {
    mockAuthValues = {
      user: null,
      permissions: [],
      loading: false,
    };

    render(
      <MemoryRouter initialEntries={["/protegido"]}>
        <Routes>
          <Route
            path="/protegido"
            element={
              <ProtectedRoute>
                <DummyPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Página Login</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Página Login")).toBeInTheDocument();
  });

  test("redirige a /403 si NO tiene permisos requeridos", () => {
    mockAuthValues = {
      user: { id: "123" },
      permissions: ["user.read"], // permiso insuficiente
      loading: false,
    };

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute need={["role.read"]}>
                <DummyPage />
              </ProtectedRoute>
            }
          />
          <Route path="/403" element={<div>Acceso Denegado</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Acceso Denegado")).toBeInTheDocument();
  });

  test("renderiza contenido si usuario cumple permisos", () => {
    mockAuthValues = {
      user: { id: "123" },
      permissions: ["role.read"],
      loading: false,
    };

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute need={["role.read"]}>
                <DummyPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Contenido Protegido")).toBeInTheDocument();
  });
});
