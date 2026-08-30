-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Las reglas configurables ahora se almacenan exclusivamente en public.reglas_ia.

begin;

drop table if exists public.restricciones_overrides cascade;
drop table if exists public.restricciones_catalogo cascade;
drop table if exists public.horas_curso_grado_division cascade;

commit;
