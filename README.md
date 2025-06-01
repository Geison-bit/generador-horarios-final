# Generador de Horarios Escolares

Aplicación web desarrollada para la generación automática de horarios escolares, utilizando programación por restricciones con MiniZinc. Este sistema está orientado a instituciones educativas rurales como la I.E. Campo Bello.

## 🚀 Tecnologías utilizadas

- 🧠 MiniZinc – Motor de programación por restricciones
- ⚙️ Flask – Backend Python para ejecutar el modelo
- 💻 React + Vite – Interfaz web dinámica
- 🎨 Tailwind CSS – Estilos modernos y responsivos
- 🗃️ Supabase – Base de datos y autenticación
- 🧩 Context API – Gestión global de estados

## 📦 Estructura del proyecto

```bash
generador-horarios-final/
├── src/
│   ├── backend-minizinc/       # Flask + modelo .mzn
│   ├── components/             # Componentes React
│   ├── pages/                  # Vistas principales
│   ├── context/                # Estado global (DocenteContext)
│   └── services/               # Servicios para Supabase y generación
├── index.html
├── package.json
└── vite.config.js
