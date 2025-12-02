// src/pages/CrearUsuario.jsx
import React, { useState } from "react";
import { createUser } from "../services/userService";
import Breadcrumbs from "../components/Breadcrumbs";

export default function CrearUsuario() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
  });

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createUser(form);
      alert("Usuario creado correctamente");

      setForm({
        email: "",
        password: "",
        full_name: "",
      });
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    }
  };

  return (
    <div className="w-full">
      {/* 🔹 Breadcrumbs arriba */}
      <Breadcrumbs />

      {/* 🔹 Contenido centrado */}
      <div className="p-8 max-w-xl mx-auto bg-white rounded-xl shadow mt-6">
        <h2 className="text-2xl font-bold mb-6">Crear nuevo usuario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          <label className="block">
            Nombre completo
            <input
              name="full_name"
              type="text"
              value={form.full_name}
              onChange={handleChange}
              className="input w-full border p-2 rounded mt-1"
              required
            />
          </label>

          <label className="block">
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="input w-full border p-2 rounded mt-1"
              required
            />
          </label>

          <label className="block">
            Contraseña inicial
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              className="input w-full border p-2 rounded mt-1"
              required
            />
          </label>

          <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">
            Crear usuario
          </button>
        </form>
      </div>
    </div>
  );
}
