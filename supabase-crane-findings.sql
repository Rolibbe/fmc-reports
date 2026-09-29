-- Bitacora de hallazgos por grua: un renglon por hallazgo.
-- Ejecutar una sola vez en Supabase > SQL Editor.
--
-- Hasta ahora la bitacora viajaba como un solo bloque por grua dentro de
-- active_crane_findings. Con esta tabla cada hallazgo vive por su cuenta,
-- anclado a la grua, y cualquier equipo (y el portal) lo lee y lo actualiza
-- por separado. La app detecta sola que la tabla existe: la primera vez que un
-- equipo sincroniza, sube toda su bitacora aqui.

create table if not exists public.crane_findings (
  id text primary key,
  company_id text,
  crane_id text not null,
  number text not null default '',
  status text not null default 'open',
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists crane_findings_company_idx on public.crane_findings (company_id);
create index if not exists crane_findings_crane_idx on public.crane_findings (company_id, crane_id);

alter table public.crane_findings enable row level security;

drop policy if exists "crane_findings_read" on public.crane_findings;
drop policy if exists "crane_findings_write" on public.crane_findings;

-- Mismo nivel de acceso que tienen hoy las demas tablas: cualquier cuenta con
-- sesion. PENDIENTE: cerrarla por empresa junto con las otras cinco tablas
-- antes de crear la primera cuenta de cliente.
create policy "crane_findings_read"
on public.crane_findings for select to authenticated
using (true);

create policy "crane_findings_write"
on public.crane_findings for all to authenticated
using (true) with check (true);
