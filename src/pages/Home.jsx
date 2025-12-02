// src/pages/Home.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "../supabaseClient";
import { useAuth } from "../auth/AuthContext";

import SelectorNivel from "../components/SelectorNivel";
import {
  Users, School, Ban, Clock3, BookOpen, CalendarDays,
  IdCard, UserCog, ShieldCheck, LogOut, UserPlus,
  AtSign, User as UserIcon, BookCheck
} from "lucide-react";

export default function Home() {
  console.log("[HOME] Render");

  const [nivelSeleccionado, setNivelSeleccionado] = useState("Secundaria");
  const [email, setEmail] = useState(null);
  const [fullName, setFullName] = useState(null);
  const [role, setRole] = useState(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const { permissions } = useAuth();
  const navigate = useNavigate();

  // ============================================================
  // CARGAR ROL DEL USUARIO
  // ============================================================
  useEffect(() => {
    (async () => {
      setLoadingRole(true);

      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user || null;

      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      setEmail(user.email || null);
      // Nombre desde metadata o perfil
      let nombre = user.user_metadata?.full_name || "";
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile?.full_name) nombre = profile.full_name;
      } catch {
        // ignorar errores de lectura de perfil
      }
      setFullName(nombre || user.email || "");

      // rol inicial desde metadata
      let resolvedRole =
        user?.app_metadata?.role &&
        String(user.app_metadata.role).toLowerCase();

      // buscar en user_roles si no está
      if (!resolvedRole) {
        const { data: ur } = await supabase
          .from("user_roles")
          .select("roles(name)")
          .eq("user_id", user.id);

        if (ur?.length) {
          resolvedRole = ur[0]?.roles?.name || "docente";
        }
      }

      if (!resolvedRole) resolvedRole = "docente";

      setRole(resolvedRole);
      setLoadingRole(false);
    })();
  }, [navigate]);

  const isAdmin = role === "admin";

  // Permiso helper
  const can = (perm) => {
    if (isAdmin) return true;
    if (!permissions) return false;
    return permissions.includes(perm);
  };

  // logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (loadingRole) {
    return (
      <div className="min-h-[100dvh] grid place-items-center text-slate-500">
        Cargando…
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_-20%,#93c5fd33,transparent)]" />
        <div className="mx-auto max-w-6xl px-3 sm:px-4 lg:px-6 pt-10 pb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <motion.h1
              className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-800"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Bienvenido al{" "}
              <span className="text-blue-700">Generador de Horarios</span>
            </motion.h1>

            <motion.p
              className="mt-2 text-slate-600 max-w-2xl"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Selecciona un nivel y accede a los módulos para configurar docentes,
              aulas, restricciones y construir tu horario óptimo.
            </motion.p>
          </div>

          {/* Identidad + Logout */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-end gap-2"
          >
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-md sm:rounded-lg px-3 py-1.5 shadow-sm">
              <UserIcon className="w-4 h-4 text-slate-700" />
              <span className="text-sm font-semibold capitalize text-slate-800">
                {fullName || "Usuario"}
              </span>
              <span className="text-slate-300">·</span>
              <AtSign className="w-4 h-4 text-slate-700" />
              <span className="text-sm text-slate-700">
                {role ? `Rol: ${role}` : "Sin rol"}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 rounded-md sm:rounded-lg px-3 py-1.5 shadow-sm hover:bg-slate-100 transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Cerrar sesión</span>
            </button>
          </motion.div>
        </div>
      </header>

      {/* Selector */}
      <section className="mx-auto max-w-6xl px-3 sm:px-4 lg:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <School className="size-5 text-blue-600" />
                Nivel y sección
              </h2>
              <p className="text-sm text-slate-600">
                Define el contexto antes de continuar.
              </p>
            </div>
            <SelectorNivel
              nivelSeleccionado={nivelSeleccionado}
              setNivelSeleccionado={setNivelSeleccionado}
            />
          </div>
        </div>
      </section>

      {/* Grid */}
      <main className="mx-auto max-w-6xl px-3 sm:px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {can("ui.restric.docente") && (
            <ActionCard
              to={`/restricciones?nivel=${nivelSeleccionado}`}
              icon={Ban}
              title="Disponibilidad del Profesor"
              desc="Marca qué horas puede impartir clase cada docente."
              accent="from-rose-600/10 to-rose-600/0"
            />
          )}

          {can("ui.horario.docente") && (
            <ActionCard
              to={`/horario-docente?nivel=${nivelSeleccionado}`}
              icon={IdCard}
              title="Mi Horario"
              desc="Consulta y exporta tu grilla."
              accent="from-indigo-600/10 to-indigo-600/0"
            />
          )}

          {can("ui.horario.general") && (
            <ActionCard
              to={`/horario?nivel=${nivelSeleccionado}`}
              icon={CalendarDays}
              title="Horario General"
              desc="Mapa completo por días, aulas y secciones."
              accent="from-violet-600/10 to-violet-600/0"
            />
          )}

          {can("ui.docentes") && (
            <ActionCard
              to={`/docentes?nivel=${nivelSeleccionado}`}
              icon={Users}
              title="Registrar Docentes"
              desc="Crea y edita el staff docente."
              accent="from-blue-600/10 to-blue-600/0"
            />
          )}

          {can("ui.aulas") && (
            <ActionCard
              to={`/aulas?nivel=${nivelSeleccionado}`}
              icon={School}
              title="Registrar Aulas"
              desc="Gestiona salones y laboratorios."
              accent="from-indigo-700/10 to-indigo-700/0"
            />
          )}

          {can("ui.restricciones.panel") && (
            <ActionCard
              to={`/restricciones-panel?nivel=${nivelSeleccionado}`}
              icon={Ban}
              title="Panel de Restricciones"
              desc="Visualiza y controla las reglas."
              accent="from-fuchsia-600/10 to-fuchsia-600/0"
            />
          )}

          {can("ui.franjas") && (
            <ActionCard
              to={`/franjas?nivel=${nivelSeleccionado}`}
              icon={Clock3}
              title="Franjas Horarias"
              desc="Configura turnos y bloques pedagógicos."
              accent="from-amber-500/10 to-amber-500/0"
            />
          )}

          {can("ui.asignacion") && (
            <ActionCard
              to={`/asignacion?nivel=${nivelSeleccionado}`}
              icon={BookOpen}
              title="Asignar Materias"
              desc="Vincula cursos con docentes."
              accent="from-emerald-600/10 to-emerald-600/0"
            />
          )}

          {can("ui.admin.docentes") && (
            <ActionCard
              to="/admin/docentes"
              icon={UserCog}
              title="Gestión de Docentes"
              desc="Lista, crea y edita docentes."
              accent="from-sky-600/10 to-sky-600/0"
            />
          )}

          {can("ui.admin.roles") && (
            <ActionCard
              to="/admin/roles"
              icon={ShieldCheck}
              title="Gestión de Roles"
              desc="Configura roles y permisos."
              accent="from-teal-600/10 to-teal-600/0"
            />
          )}

          {can("ui.admin.cuentas") && (
            <ActionCard
              to="/admin/cuentas"
              icon={UserPlus}
              title="Gestión de Cuentas"
              desc="Crea y activa usuarios."
              accent="from-cyan-600/10 to-cyan-600/0"
            />
          )}

          {/* ⭐ NUEVA TARJETA INTEGRADA: CREAR USUARIO */}
          {can("ui.admin.cuentas") && (
            <ActionCard
              to="/admin/cuentas/crear"
              icon={UserPlus}
              title="Crear Usuario"
              desc="Registrar nuevos usuarios en el sistema."
              accent="from-green-600/10 to-green-600/0"
            />
          )}

          {can("ui.auditoria") && (
            <ActionCard
              to={`/auditoria?nivel=${nivelSeleccionado}`}
              icon={BookCheck}
              title="Bitácora de Auditoría"
              desc="Registros completos del sistema."
              accent="from-purple-600/10 to-purple-600/0"
            />
          )}

        </div>
      </main>
    </div>
  );
}

// Tarjeta estándar
function ActionCard({ to, icon: Icon, title, desc, accent }) {
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
        className="group block h-full rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition"
      >
        <div className={`rounded-t-2xl bg-gradient-to-b ${accent} p-4`}>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg sm:rounded-xl bg-white/70 p-2 ring-1 ring-slate-200">
              <Icon className="size-5 text-slate-800" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          </div>
        </div>
        <div className="p-4">
          <p className="text-sm text-slate-600">{desc}</p>
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-700">
            <span>Entrar</span>
            <svg
              className="size-4 group-hover:translate-x-0.5 transition-transform"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M12.293 3.293a1 1 0 011.414 0l4.999 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L15.586 11H3a1 1 0 110-2h12.586l-3.293-3.293a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

