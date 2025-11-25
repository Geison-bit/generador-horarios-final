import React, { useState } from "react";
import { createUser } from "../services/userService";

export default function CrearUsuario() {

  const [form, setForm] = useState({
    email: "",
    password: "",
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
      });

    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    }
  };

  return (
    <div className="p-8 max-w-xl mx-auto bg-white rounded-xl shadow">
      <h2 className="text-2xl font-bold mb-6">Crear nuevo usuario</h2>

      <form onSubmit={handleSubmit} className="space-y-4">

        <label className="block">
          Email
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            className="input w-full border p-2 rounded"
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
            className="input w-full border p-2 rounded"
            required
          />
        </label>

        <button className="btn-primary w-full bg-blue-600 text-white py-2 rounded">
          Crear usuario
        </button>
      </form>
    </div>
  );
}
