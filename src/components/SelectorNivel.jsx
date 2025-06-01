import React, { useState } from 'react';

export default function SelectorNivel({ nivelSeleccionado, setNivelSeleccionado }) {
  return (
    <div className="flex justify-center my-4">
      <div className="bg-gray-100 rounded-full p-1 flex gap-1 shadow-md">
        <button
          className={`px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200 ${
            nivelSeleccionado === 'Primaria'
              ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white'
              : 'text-gray-600'
          }`}
          onClick={() => setNivelSeleccionado('Primaria')}
        >
          Nivel Primaria
        </button>
        <button
          className={`px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200 ${
            nivelSeleccionado === 'Secundaria'
              ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white'
              : 'text-gray-600'
          }`}
          onClick={() => setNivelSeleccionado('Secundaria')}
        >
          Nivel Secundaria
        </button>
      </div>
    </div>
  );
}
