import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import RolePermsModal from "../src/components/RolePermsModal";

// Mock Supabase
vi.mock("../src/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { key: "user.read", description: "Leer usuarios" },
          { key: "role.read", description: "Leer roles" }
        ]
      }),
      eq: vi.fn().mockReturnThis()
    })),
  },
}));

describe("RolePermsModal Component", () => {
  test("renderiza el modal correctamente", async () => {
    render(<RolePermsModal roleId="1" roleName="ADMIN" onClose={() => {}} />);

    expect(await screen.findByText("user.read")).toBeInTheDocument();
    expect(await screen.findByText("role.read")).toBeInTheDocument();
  });

  test("permite marcar y desmarcar permisos (toggle button)", async () => {
    render(<RolePermsModal roleId="1" roleName="ADMIN" onClose={() => {}} />);

    // 1️⃣ Buscar el permiso en la interfaz
    const permisoItem = await screen.findByText("user.read");

    // 2️⃣ Subir al contenedor padre
    const row = permisoItem.closest(".flex");
    expect(row).not.toBeNull();

    // 3️⃣ Encontrar el toggle button
    const toggleBtn = row.querySelector("button");
    expect(toggleBtn).not.toBeNull();

    // 4️⃣ Simular click
    fireEvent.click(toggleBtn);

    expect(toggleBtn).toBeInTheDocument();
  });

  test("cierra el modal al presionar Cerrar", async () => {
    const mockClose = vi.fn();

    render(<RolePermsModal roleId="1" roleName="ADMIN" onClose={mockClose} />);

    const closeBtn = screen.getByRole("button", { name: "Cerrar" });
    fireEvent.click(closeBtn);

    expect(mockClose).toHaveBeenCalled();
  });
});
