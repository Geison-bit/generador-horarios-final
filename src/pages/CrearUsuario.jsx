import React, { useState } from "react";
import { createUser } from "../services/userService";
import Breadcrumbs from "../components/Breadcrumbs";

export default function CrearUsuario() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Evaluación simple de seguridad de contraseña
  const evaluarSeguridad = (password) => {
    let score = 0;

    if (!password) return { nivel: "Vacía", color: "gray", valor: 0 };

    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[\W_]/.test(password)) score++;

    if (score <= 2) return { nivel: "Débil", color: "red", valor: score };
    if (score === 3 || score === 4) return { nivel: "Media", color: "yellow", valor: score };
    if (score === 5) return { nivel: "Fuerte", color: "green", valor: score };

    return { nivel: "Vacía", color: "gray", valor: 0 };
  };

  const seguridad = evaluarSeguridad(form.password);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await createUser(form);
      alert("Usuario creado correctamente");
      setForm({ email: "", password: "", full_name: "" });
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    }
  }

  return (
    <div className="w-full">
      <Breadcrumbs />

      <div className="p-8 max-w-xl mx-auto bg-white rounded-lg sm:rounded-xl shadow mt-6">
        <h2 className="text-xl sm:text-2xl font-bold mb-6">Crear nuevo usuario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium">
            Nombre completo
            <input
              name="full_name"
              type="text"
              value={form.full_name}
              onChange={handleChange}
              className="w-full border p-2 rounded mt-1"
              required
            />
          </label>

          <label className="block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="w-full border p-2 rounded mt-1"
              required
            />
          </label>

          <label className="block text-sm font-medium">
            Contraseña inicial
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              className="w-full border p-2 rounded mt-1"
              required
            />
          </label>

          {form.password && (
            <div className="mt-1">
              <p className="text-xs font-medium">
                Seguridad de contraseña:{" "}
                <span
                  className={`font-bold ${
                    seguridad.color === "red"
                      ? "text-red-600"
                      : seguridad.color === "yellow"
                      ? "text-yellow-600"
                      : seguridad.color === "green"
                      ? "text-green-600"
                      : "text-gray-500"
                  }`}
                >
                  {seguridad.nivel}
                </span>
              </p>

              <div className="w-full h-2 bg-gray-200 rounded mt-1 overflow-hidden">
                <div
                  style={{ width: `${seguridad.valor * 20}%` }}
                  className={`h-full transition-all duration-300 ${
                    seguridad.color === "red"
                      ? "bg-red-500"
                      : seguridad.color === "yellow"
                      ? "bg-yellow-400"
                      : seguridad.color === "green"
                      ? "bg-green-500"
                      : "bg-gray-300"
                  }`}
                ></div>
              </div>

              <ul className="text-xs mt-1 text-gray-600">
                <li>• Mínimo 8 caracteres</li>
                <li>• Al menos 1 mayúscula (A-Z)</li>
                <li>• Al menos 1 minúscula (a-z)</li>
                <li>• Al menos 1 número (0-9)</li>
                <li>• Al menos 1 símbolo (!@#...)</li>
              </ul>
            </div>
          )}

          <button
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
            disabled={seguridad.nivel === "Débil"}
          >
            Crear usuario
          </button>
        </form>
      </div>
    </div>
  );
}
