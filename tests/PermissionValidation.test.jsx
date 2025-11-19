import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import RolePermsModal from "../src/components/RolePermsModal.jsx";
import permissions from "../src/auth/permissions";

describe("PermissionValidation - Seguridad de integridad", () => {
  test("ignora permisos inválidos y solo muestra permisos válidos", async () => {
    const mockPermissions = [
      "user.read",       // válido
      "role.read",       // válido
      "inventado.xxx",   // inválido
      "hack.admin",      // inválido
      " "                // inválido pero sin romper sintaxis
    ];

    render(
      <RolePermsModal
        open={true}
        roleName="Test"
        permissions={mockPermissions}
        onClose={() => {}}
        onToggle={() => {}}
      />
    );

    // Espera a que los permisos válidos aparezcan
    await waitFor(() =>
      expect(screen.getByText("user.read")).toBeInTheDocument()
    );

    // Deben aparecer estos
    expect(screen.getByText("user.read")).toBeInTheDocument();
    expect(screen.getByText("role.read")).toBeInTheDocument();

    // NO deben aparecer estos
    expect(screen.queryByText("inventado.xxx")).toBeNull();
    expect(screen.queryByText("hack.admin")).toBeNull();
    expect(screen.queryByText(" ")).toBeNull();
  });
});
