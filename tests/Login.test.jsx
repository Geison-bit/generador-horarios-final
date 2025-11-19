import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../src/auth/login";
import { vi } from "vitest";

// ================================
// MOCK: useAuth()
// ================================
vi.mock("../src/auth/AuthContext", () => ({
  useAuth: () => ({
    bannedMessage: null,
    setBannedMessage: vi.fn(),
    session: null,
    user: null,
    roles: [],
    permissions: [],
    loading: false,
  }),
}));

// ================================
// MOCK: Supabase
// ================================
vi.mock("../src/supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },

    // ⭐ Mock completo con .single()
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { status: "active" },
              error: null,
            }),
        }),
      }),
    }),
  },
}));

import { supabase } from "../src/supabaseClient";

describe("Login Component", () => {
  test("muestra error si los campos están vacíos", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(
      await screen.findByText("Completa correo y contraseña.")
    ).toBeInTheDocument();
  });

  test("envía credenciales correctamente", async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { email: "test@correo.com", id: "123" } },
      error: null,
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("Correo electrónico"), {
      target: { value: "test@correo.com" },
    });

    fireEvent.change(screen.getByPlaceholderText("Contraseña"), {
      target: { value: "123456" },
    });

    fireEvent.click(screen.getByRole("button", { name: /ingresar/i }));

    expect(supabase.auth.signInWithPassword).toHaveBeenCalled();
  });
});
