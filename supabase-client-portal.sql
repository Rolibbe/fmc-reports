-- Portal de clientes FMC
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Los usuarios que ya existen al ejecutar este archivo se registran como internos/admin.
-- Despues crea las cuentas cliente en Authentication y guarda sus asignaciones
-- desde Configuracion > Usuarios y roles. El ejemplo del final sirve como alternativa manual.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  access_type text not null default 'internal' check (access_type in ('internal', 'client')),
  role text not null default 'solo_lectura' check (role in ('admin', 'supervisor', 'tecnico', 'solo_lectura', 'client')),
  company_id text,
  company_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_profiles (user_id, email, access_type, role, active)
select id, email, 'internal', 'admin', true
from auth.users
where email is not null
on conflict (user_id) do nothing;

create or replace function public.register_new_fmc_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null then
    insert into public.user_profiles (user_id, email, access_type, role, active)
    values (new.id, lower(new.email), 'internal', 'solo_lectura', false)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists register_new_fmc_user_trigger on auth.users;
create trigger register_new_fmc_user_trigger
after insert on auth.users
for each row execute function public.register_new_fmc_user();

alter table public.user_profiles enable row level security;

create or replace function public.is_fmc_internal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where user_id = auth.uid()
      and active = true
      and access_type = 'internal'
  );
$$;

create or replace function public.current_fmc_company_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.user_profiles
  where user_id = auth.uid()
    and active = true
    and access_type = 'client'
  limit 1;
$$;

revoke all on function public.is_fmc_internal() from public;
revoke all on function public.current_fmc_company_id() from public;
grant execute on function public.is_fmc_internal() to authenticated;
grant execute on function public.current_fmc_company_id() to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('user_profiles', 'companies', 'cranes', 'active_crane_findings', 'reports', 'app_settings')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end $$;

create policy "profiles_read_own_or_internal"
on public.user_profiles for select to authenticated
using (user_id = auth.uid() or public.is_fmc_internal());

create policy "profiles_internal_manage"
on public.user_profiles for all to authenticated
using (public.is_fmc_internal())
with check (public.is_fmc_internal());

alter table public.companies enable row level security;
alter table public.cranes enable row level security;
alter table public.active_crane_findings enable row level security;
alter table public.reports enable row level security;
alter table public.app_settings enable row level security;

create policy "companies_read_scope"
on public.companies for select to authenticated
using (public.is_fmc_internal() or id = public.current_fmc_company_id());

create policy "cranes_read_scope"
on public.cranes for select to authenticated
using (public.is_fmc_internal() or company_id = public.current_fmc_company_id());

create policy "findings_read_scope"
on public.active_crane_findings for select to authenticated
using (public.is_fmc_internal() or company_id = public.current_fmc_company_id());

create policy "reports_read_scope"
on public.reports for select to authenticated
using (public.is_fmc_internal() or company_id = public.current_fmc_company_id());

create policy "companies_internal_write"
on public.companies for all to authenticated
using (public.is_fmc_internal()) with check (public.is_fmc_internal());

create policy "cranes_internal_write"
on public.cranes for all to authenticated
using (public.is_fmc_internal()) with check (public.is_fmc_internal());

create policy "findings_internal_write"
on public.active_crane_findings for all to authenticated
using (public.is_fmc_internal()) with check (public.is_fmc_internal());

create policy "reports_internal_write"
on public.reports for all to authenticated
using (public.is_fmc_internal()) with check (public.is_fmc_internal());

create policy "settings_internal_only"
on public.app_settings for all to authenticated
using (public.is_fmc_internal()) with check (public.is_fmc_internal());

-- Evidencias privadas. La segunda carpeta del objeto corresponde al ID del reporte:
-- reportes/{report_id}/equipos/...
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname in ('evidence_read_scope', 'evidence_internal_insert', 'evidence_internal_update', 'evidence_internal_delete')
        or coalesce(qual, '') ilike '%report-evidence%'
        or coalesce(with_check, '') ilike '%report-evidence%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
  end loop;
end $$;

create policy "evidence_read_scope"
on storage.objects for select to authenticated
using (
  bucket_id = 'report-evidence'
  and (
    public.is_fmc_internal()
    or exists (
      select 1 from public.reports
      where reports.id = split_part(storage.objects.name, '/', 2)
        and reports.company_id = public.current_fmc_company_id()
    )
  )
);

create policy "evidence_internal_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'report-evidence' and public.is_fmc_internal());

create policy "evidence_internal_update"
on storage.objects for update to authenticated
using (bucket_id = 'report-evidence' and public.is_fmc_internal())
with check (bucket_id = 'report-evidence' and public.is_fmc_internal());

create policy "evidence_internal_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'report-evidence' and public.is_fmc_internal());

-- EJEMPLO PARA ASIGNAR UNA CUENTA CLIENTE DESPUES DE CREARLA EN AUTHENTICATION:
-- insert into public.user_profiles (user_id, email, access_type, role, company_id, company_name)
-- select id, email, 'client', 'client', 'company-ivemsa', 'IVEMSA'
-- from auth.users where lower(email) = lower('cliente@empresa.com')
-- on conflict (user_id) do update set
--   access_type = excluded.access_type,
--   role = excluded.role,
--   company_id = excluded.company_id,
--   company_name = excluded.company_name,
--   active = true,
--   updated_at = now();
