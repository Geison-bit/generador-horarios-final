create table if not exists public.horario_generaciones (
  nivel text not null,
  version_num integer not null,
  generation_index integer not null check (generation_index between 1 and 5),
  horario jsonb not null,
  created_at timestamptz not null default now(),
  primary key (nivel, version_num, generation_index)
);

create index if not exists horario_generaciones_nivel_version_idx
  on public.horario_generaciones (nivel, version_num);
