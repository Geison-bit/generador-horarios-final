import { useState } from "react";
import { Link } from "react-router-dom";
import SelectorNivel from "../components/SelectorNivel";
import { useAuth } from "../auth/AuthContext";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import {
  Users,
  School,
  Ban,
  Clock3,
  BookOpen,
  CalendarDays,
  IdCard,
  UserCog,
  UserPlus,
  FileSearch,
  User,
  LogOut,
  Users2,
} from "lucide-react";

const horarioFlowCards = [
  {
    step: 1,
    to: "/franjas",
    icon: Clock3,
    title: "Franjas Horarias",
    desc: "Configura turnos, bloques pedagogicos y jornadas.",
    ariaLabel: "Ir a franjas horarias",
    accent: "from-amber-500/10 to-amber-500/0",
  },
  {
    step: 2,
    to: "/asignacion",
    icon: BookOpen,
    title: "Asignar Materias",
    desc: "Vincula cursos con docentes y grupos segun carga horaria.",
    ariaLabel: "Ir a asignacion de materias",
    accent: "from-emerald-600/10 to-emerald-600/0",
  },
  {
    step: 3,
    to: "/docentes",
    icon: Users,
    title: "Registrar Docentes",
    desc: "Crea y edita el staff docente, carga horas y especialidades.",
    ariaLabel: "Ir a registro de docentes",
    accent: "from-blue-600/10 to-blue-600/0",
  },
  {
    step: 4,
    to: "/aulas",
    icon: School,
    title: "Registrar Aulas",
    desc: "Gestiona salones, laboratorios y capacidad por ambiente.",
    ariaLabel: "Ir a registro de aulas",
    accent: "from-indigo-700/10 to-indigo-700/0",
  },
  {
    step: 5,
    to: "/restricciones",
    icon: Ban,
    title: "Disponibilidad del Profesor",
    desc: "Marca que horas puede impartir clase cada docente.",
    ariaLabel: "Ir al formulario de disponibilidad",
    accent: "from-rose-600/10 to-rose-600/0",
  },
  {
    step: 6,
    to: "/restricciones-panel",
    icon: Ban,
    title: "Panel de Restricciones",
    desc: "Visualiza todas las reglas y decide cuales aplicar.",
    ariaLabel: "Ir al panel de restricciones",
    accent: "from-fuchsia-600/10 to-fuchsia-600/0",
  },
  {
    step: 7,
    to: "/horario",
    icon: CalendarDays,
    title: "Horario General",
    desc: "Visualiza el mapa completo por dias, aulas y secciones.",
    ariaLabel: "Ir al horario general",
    accent: "from-violet-600/10 to-violet-600/0",
  },
  {
    step: 8,
    to: "/horario-docente",
    icon: IdCard,
    title: "Horario por Docente",
    desc: "Consulta y exporta la grilla individual por profesor.",
    ariaLabel: "Ir al horario por docente",
    accent: "from-indigo-600/10 to-indigo-600/0",
  },
];

const adminCards = [
  {
    step: 9,
    to: "/admin/usuarios/crear",
    icon: UserPlus,
    title: "Crear Usuario",
    desc: "Registra cuentas nuevas con nombre, correo y contrasena inicial.",
    ariaLabel: "Ir a crear usuario",
    accent: "from-emerald-600/10 to-emerald-600/0",
  },
  {
    step: 10,
    to: "/admin/cuentas",
    icon: Users2,
    title: "Gestion de Cuentas",
    desc: "Activa/desactiva perfiles y edita datos de cuenta.",
    ariaLabel: "Ir a gestion de cuentas",
    accent: "from-cyan-600/10 to-cyan-600/0",
  },
  {
    step: 11,
    to: "/admin/docentes",
    icon: UserCog,
    title: "Gestion de Docentes",
    desc: "Lista, crea/edita y activa/desactiva docentes.",
    ariaLabel: "Ir a gestion de docentes",
    accent: "from-sky-600/10 to-sky-600/0",
  },
  {
    step: 12,
    to: "/admin/auditoria",
    icon: FileSearch,
    title: "Bitacora de Auditoria",
    desc: "Revisa las acciones recientes registradas en el sistema.",
    ariaLabel: "Ir a bitacora de auditoria",
    accent: "from-orange-500/10 to-orange-500/0",
  },
];

export default function Home() {
  const [nivelSeleccionado, setNivelSeleccionado] = useState("Secundaria");
  const { user, signOut } = useAuth();
  const displayName = user?.user_metadata?.full_name || user?.email || "Usuario";
  const reduceMotion = useReducedMotion();
  const fadeUp = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5 } };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white">
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_-20%,#93c5fd33,transparent)]" />
        <div className="mx-auto max-w-6xl px-6 pt-10 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <LazyMotion features={domAnimation}>
                <m.h1
                  initial={fadeUp.initial}
                  animate={fadeUp.animate}
                  transition={fadeUp.transition}
                  className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-800"
                >
                  Bienvenido al <span className="text-blue-700">Generador de Horarios</span>
                </m.h1>
                <m.p
                  initial={fadeUp.initial}
                  animate={fadeUp.animate}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.6, delay: 0.05 }}
                  className="mt-2 max-w-2xl text-slate-600"
                >
                  Sigue la numeracion para avanzar por el flujo de configuracion del horario y
                  luego acceder a los modulos de seguridad y administracion.
                </m.p>
              </LazyMotion>
            </div>

            <div className="flex flex-col items-start gap-2">
              <div className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <User className="size-4 text-slate-500" />
                  <span className="font-semibold">{displayName}</span>
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

      <section className="mx-auto max-w-6xl px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
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

      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-slate-700 md:grid-cols-2">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
              1-8
            </span>
            <div>
              <p className="font-semibold text-slate-800">Proceso de generacion de horarios</p>
              <p>Sigue estas tarjetas en orden para configurar y generar los horarios.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
              9-12
            </span>
            <div>
              <p className="font-semibold text-slate-800">Seguridad y administracion</p>
              <p>Usa estos modulos para cuentas, usuarios, docentes y auditoria.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {horarioFlowCards.map((card) => (
            <ActionCard
              key={card.step}
              {...card}
              to={`${card.to}?nivel=${nivelSeleccionado}`}
              numberTone="horarios"
            />
          ))}

          {adminCards.map((card) => (
            <ActionCard
              key={card.step}
              {...card}
              numberTone="admin"
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, desc, ariaLabel, accent, step, numberTone }) {
  const reduceMotion = useReducedMotion();
  const numberClass =
    numberTone === "admin"
      ? "bg-emerald-600 text-white ring-emerald-200"
      : "bg-blue-600 text-white ring-blue-200";

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.35 }}
        whileHover={reduceMotion ? undefined : { y: -2 }}
        className="h-full"
      >
        <Link
          to={to}
          aria-label={ariaLabel}
          className="group block h-full rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-transparent transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/60"
        >
          <div className={`rounded-t-2xl bg-gradient-to-b ${accent} p-4`}>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-sm ring-4 ${numberClass}`}
              >
                {step}
              </span>
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
      </m.div>
    </LazyMotion>
  );
}
