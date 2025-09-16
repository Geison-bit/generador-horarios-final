import { useState } from "react";
import { Link } from "react-router-dom";
import SelectorNivel from "../components/SelectorNivel";
import { motion } from "framer-motion";
import {
  Users,
  School,
  Ban,
  Clock3,
  BookOpen,
  CalendarDays,
  IdCard,
} from "lucide-react";

/**
 * Home.jsx — Interfaz mejorada
 * - Encabezado con gradiente y micro-animaciones
 * - Tarjetas accesibles (foco visible, aria-label)
 * - Grid responsivo y limpio
 * - Reutiliza ActionCard para cada navegación
 */
export default function Home() {
  const [nivelSeleccionado, setNivelSeleccionado] = useState("Secundaria");

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_-20%,#93c5fd33,transparent)]" />
        <div className="mx-auto max-w-6xl px-6 pt-10 pb-4">
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-800"
          >
            Bienvenido al <span className="text-blue-700">Generador de Horarios</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-2 text-slate-600 max-w-2xl"
          >
            Selecciona un nivel y accede a los módulos para configurar docentes, aulas,
            restricciones y construir tu horario óptimo.
          </motion.p>
        </div>
      </header>

      {/* Selector de nivel */}
      <section className="mx-auto max-w-6xl px-6">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <School className="size-5 text-blue-600" aria-hidden="true" />
                Nivel y sección
              </h2>
              <p className="text-sm text-slate-600">Define el contexto antes de continuar.</p>
            </div>
            <div className="w-full sm:w-auto">
              <SelectorNivel
                nivelSeleccionado={nivelSeleccionado}
                setNivelSeleccionado={setNivelSeleccionado}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Grid de acciones */}
      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          <ActionCard
            to={`/docentes?nivel=${nivelSeleccionado}`}
            icon={Users}
            title="Registrar Docentes"
            desc="Crea y edita el staff docente, carga horas y especialidades."
            ariaLabel="Ir a registro de docentes"
            accent="from-blue-600/10 to-blue-600/0"
          />

          <ActionCard
            to={`/aulas?nivel=${nivelSeleccionado}`}
            icon={School}
            title="Registrar Aulas"
            desc="Gestiona salones, laboratorios y capacidad por ambiente."
            ariaLabel="Ir a registro de aulas"
            accent="from-indigo-700/10 to-indigo-700/0"
          />

          <ActionCard
            to={`/restricciones?nivel=${nivelSeleccionado}`}
            icon={Ban}
            title="Restricciones"
            desc="Define reglas duras y blandas: disponibilidad, solapes, etc."
            ariaLabel="Ir a restricciones"
            accent="from-rose-600/10 to-rose-600/0"
          />

          <ActionCard
            to={`/franjas?nivel=${nivelSeleccionado}`}
            icon={Clock3}
            title="Franjas Horarias"
            desc="Configura turnos, bloques pedagógicos y jornadas."
            ariaLabel="Ir a franjas horarias"
            accent="from-amber-500/10 to-amber-500/0"
          />

          <ActionCard
            to={`/asignacion?nivel=${nivelSeleccionado}`}
            icon={BookOpen}
            title="Asignar Materias"
            desc="Vincula cursos con docentes y grupos según carga horaria."
            ariaLabel="Ir a asignación de materias"
            accent="from-emerald-600/10 to-emerald-600/0"
          />

          <ActionCard
            to={`/horario?nivel=${nivelSeleccionado}`}
            icon={CalendarDays}
            title="Horario General"
            desc="Visualiza el mapa completo por días, aulas y secciones."
            ariaLabel="Ir al horario general"
            accent="from-violet-600/10 to-violet-600/0"
          />

          <ActionCard
            to={`/horario-docente?nivel=${nivelSeleccionado}`}
            icon={IdCard}
            title="Horario por Docente"
            desc="Consulta y exporta la grilla individual por profesor."
            ariaLabel="Ir al horario por docente"
            accent="from-indigo-600/10 to-indigo-600/0"
          />
        </div>
      </main>
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, desc, ariaLabel, accent }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      whileHover={{ y: -2 }}
      className="h-full"
    >
      <Link
        to={to}
        aria-label={ariaLabel}
        className="group block h-full rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-transparent transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/60 hover:shadow-md"
      >
        <div className={`rounded-t-2xl bg-gradient-to-b ${accent} p-4`}>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-xl bg-white/70 p-2 ring-1 ring-slate-200">
              <Icon className="size-5 text-slate-800" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          </div>
        </div>
        <div className="p-4">
          <p className="text-sm leading-6 text-slate-600">{desc}</p>
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-700">
            <span>Entrar</span>
            <svg
              className="size-4 transition-transform group-hover:translate-x-0.5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12.293 3.293a1 1 0 011.414 0l4.999 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L15.586 11H3a1 1 0 110-2h12.586l-3.293-3.293a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
