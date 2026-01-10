import { useState } from "react";
import { Link } from "react-router-dom";
import SelectorNivel from "../components/SelectorNivel";
import { useAuth } from "../auth/AuthContext";
import { motion } from "framer-motion";
import {
  Users,
  School,
  Ban,
  Clock3,
  BookOpen,
  CalendarDays,
  IdCard,
  UserCog,
  ShieldCheck,
  UserPlus,
  FileSearch,
  User,
  AtSign,
  LogOut,
  Users2,
} from "lucide-react";

export default function Home() {
  const [nivelSeleccionado, setNivelSeleccionado] = useState("Secundaria");
  const { user, role, signOut } = useAuth();
  const displayName = user?.user_metadata?.full_name || user?.email || "Usuario";
  const roleLabel = role || "sin rol";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_-20%,#93c5fd33,transparent)]" />
        <div className="mx-auto max-w-6xl px-6 pt-10 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
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
                Selecciona un nivel y accede a los modulos para configurar docentes, aulas,
                restricciones y construir tu horario optimo.
              </motion.p>
            </div>

            <div className="flex flex-col items-start gap-2">
              <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <User className="size-4 text-slate-500" />
                  <span className="font-semibold">{displayName}</span>
                </div>
                <div className="h-4 w-px bg-slate-200" />
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <AtSign className="size-4 text-slate-500" />
                  <span>Rol:</span>
                  <span className="font-semibold text-slate-800">{roleLabel}</span>
                </div>
              </div>
              <button
                onClick={signOut}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <LogOut className="size-4" />
                Cerrar sesion
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Selector de nivel */}
      <section className="mx-auto max-w-6xl px-6">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <School className="size-5 text-blue-600" aria-hidden="true" />
                Nivel y seccion
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
            title="Disponibilidad del Profesor"
            desc="Marca que horas puede impartir clase cada docente."
            ariaLabel="Ir al formulario de disponibilidad"
            accent="from-rose-600/10 to-rose-600/0"
          />

          <ActionCard
            to={`/restricciones-panel?nivel=${nivelSeleccionado}`}
            icon={Ban}
            title="Panel de Restricciones"
            desc="Visualiza todas las reglas y decide cuales aplicar."
            ariaLabel="Ir al panel de restricciones"
            accent="from-fuchsia-600/10 to-fuchsia-600/0"
          />

          <ActionCard
            to={`/franjas?nivel=${nivelSeleccionado}`}
            icon={Clock3}
            title="Franjas Horarias"
            desc="Configura turnos, bloques pedagogicos y jornadas."
            ariaLabel="Ir a franjas horarias"
            accent="from-amber-500/10 to-amber-500/0"
          />

          <ActionCard
            to={`/asignacion?nivel=${nivelSeleccionado}`}
            icon={BookOpen}
            title="Asignar Materias"
            desc="Vincula cursos con docentes y grupos segun carga horaria."
            ariaLabel="Ir a asignacion de materias"
            accent="from-emerald-600/10 to-emerald-600/0"
          />

          <ActionCard
            to={`/horario?nivel=${nivelSeleccionado}`}
            icon={CalendarDays}
            title="Horario General"
            desc="Visualiza el mapa completo por dias, aulas y secciones."
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

          {/* Administracion / Seguridad */}
          <ActionCard
            to="/admin/docentes"
            icon={UserCog}
            title="Gestion de Docentes"
            desc="Lista, crea/edita y activa/desactiva docentes."
            ariaLabel="Ir a gestion de docentes"
            accent="from-sky-600/10 to-sky-600/0"
          />

          <ActionCard
            to="/admin/roles"
            icon={ShieldCheck}
            title="Gestion de Roles"
            desc="Crea roles y asignalos a docentes para controlar permisos."
            ariaLabel="Ir a gestion de roles"
            accent="from-teal-600/10 to-teal-600/0"
          />
          <ActionCard
            to="/admin/cuentas"
            icon={Users2}
            title="Gestion de Cuentas"
            desc="Activa/desactiva perfiles y edita datos de cuenta."
            ariaLabel="Ir a gestion de cuentas"
            accent="from-cyan-600/10 to-cyan-600/0"
          />

          <ActionCard
            to="/admin/usuarios/crear"
            icon={UserPlus}
            title="Crear Usuario"
            desc="Registra cuentas nuevas con nombre, correo y contrasena inicial."
            ariaLabel="Ir a crear usuario"
            accent="from-emerald-600/10 to-emerald-600/0"
          />

          <ActionCard
            to="/admin/auditoria"
            icon={FileSearch}
            title="Bitacora de Auditoria"
            desc="Revisa las acciones recientes registradas en el sistema."
            ariaLabel="Ir a bitacora de auditoria"
            accent="from-orange-500/10 to-orange-500/0"
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
