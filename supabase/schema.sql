-- Bitácora · esquema de base de datos para Supabase (Postgres)
-- Ejecutar una vez en SQL Editor. Crea tablas, seguridad por fila (RLS),
-- el espacio "Personal" automático al registrarse y el límite de 10 etiquetas.

-- Espacios: "Personal" hoy, equipos mañana
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid references public.workspaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  primary key (workspace_id, user_id)
);

create table public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  remind_after_days smallint not null default 3 check (remind_after_days in (1,3,5,7)),
  confirm_done boolean not null default true,
  email_digest boolean not null default true
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  color smallint not null default 0 check (color between 0 and 9),
  position smallint not null default 0,
  unique (workspace_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity,
  workspace_id uuid not null references public.workspaces on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  notes text not null default '',
  tag_id uuid references public.tags on delete set null,
  due_date date not null default current_date,
  priority boolean not null default false,
  repeat text check (repeat in ('d','w','m')),
  remind_after_days smallint check (remind_after_days in (1,3,5,7)),
  done_at timestamptz,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index tasks_ws_due on public.tasks (workspace_id, due_date);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks on delete cascade,
  title text not null,
  done boolean not null default false,
  position smallint not null default 0
);

create table public.daily_notes (
  workspace_id uuid references public.workspaces on delete cascade,
  day date not null,
  body text not null default '',
  primary key (workspace_id, day)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ¿El usuario actual pertenece a este espacio?
create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members
                 where workspace_id = ws and user_id = auth.uid());
$$;

-- Seguridad por fila: cada uno ve solo lo suyo
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.user_settings enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.daily_notes enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "ver mis espacios" on public.workspaces for select using (public.is_member(id));
create policy "ver mis membresias" on public.workspace_members for select using (user_id = auth.uid());
create policy "mis ajustes" on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "etiquetas del espacio" on public.tags for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "tareas del espacio" on public.tasks for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "notas del espacio" on public.daily_notes for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "subtareas del espacio" on public.subtasks for all
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_member(t.workspace_id)))
  with check (exists (select 1 from public.tasks t where t.id = task_id and public.is_member(t.workspace_id)));
create policy "mis dispositivos" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Al registrarse: espacio Personal + ajustes por defecto
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into workspaces (name, owner_id) values ('Personal', new.id) returning id into ws;
  insert into workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  insert into user_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Máximo 10 etiquetas por espacio, validado en la base de datos
create or replace function public.check_tag_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.tags where workspace_id = new.workspace_id) >= 10 then
    raise exception 'Máximo 10 etiquetas por espacio';
  end if;
  return new;
end $$;

create trigger tag_limit before insert on public.tags
  for each row execute function public.check_tag_limit();

-- ============================================================
-- Recordatorios diarios (los llama el cron de Vercel)
-- Protegidos con un secreto guardado en un esquema privado,
-- así el servidor no necesita la llave service_role.
-- ============================================================
create schema if not exists private;
-- El esquema private no se expone por la API de Supabase.

create table private.app_secrets (
  name text primary key,
  value text not null
);

create or replace function private.check_secret(p_secret text)
returns void language plpgsql security definer set search_path = private as $$
begin
  if p_secret is null or not exists (
    select 1 from private.app_secrets where name = 'cron' and value = p_secret
  ) then
    raise exception 'no autorizado';
  end if;
end $$;

-- Usuarios con tareas atrasadas más allá de su plazo de aviso
create or replace function public.reminder_digest(p_secret text)
returns table (user_id uuid, email text, titles text[], email_digest boolean)
language plpgsql security definer set search_path = public, private as $$
declare hoy date := (now() at time zone 'America/Santiago')::date;
begin
  perform private.check_secret(p_secret);
  return query
    select w.owner_id, u.email::text,
           array_agg(t.title order by t.due_date, t.folio),
           coalesce(s.email_digest, true)
    from tasks t
    join workspaces w on w.id = t.workspace_id
    join auth.users u on u.id = w.owner_id
    left join user_settings s on s.user_id = w.owner_id
    where t.done_at is null
      and hoy - t.due_date >= coalesce(t.remind_after_days, s.remind_after_days, 3)
    group by w.owner_id, u.email, s.email_digest;
end $$;

create or replace function public.reminder_subscriptions(p_secret text, p_user uuid)
returns table (id uuid, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.check_secret(p_secret);
  return query select ps.id, ps.endpoint, ps.p256dh, ps.auth
               from push_subscriptions ps where ps.user_id = p_user;
end $$;


-- Después de crear el proyecto, guarda el mismo valor que CRON_SECRET en Vercel:
-- insert into private.app_secrets (name, value) values ('cron', 'TU_CRON_SECRET');

-- Funciones internas: sin acceso público por la API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

-- Rendimiento: índices para llaves foráneas y auth.uid() evaluado una vez por consulta
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists subtasks_task_idx on public.subtasks (task_id);
create index if not exists tasks_tag_idx on public.tasks (tag_id);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);
create index if not exists workspaces_owner_idx on public.workspaces (owner_id);
alter policy "ver mis membresias" on public.workspace_members using (user_id = (select auth.uid()));
alter policy "mis ajustes" on public.user_settings using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "mis dispositivos" on public.push_subscriptions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Perfil: nombre visible
alter table public.user_settings add column if not exists display_name text check (display_name is null or char_length(display_name) <= 60);
