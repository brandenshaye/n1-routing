-- OPS II scheduling: employee roster + dated weekly schedules.
-- RLS intentionally left disabled to match the existing routing_* tables,
-- which the SPA accesses directly with the anon key.

create table if not exists public.routing_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null default '',
  roles jsonb not null default '["driver"]'::jsonb,
  availability jsonb not null default '{}'::jsonb,
  notes text not null default '',
  contact text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.routing_schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  banner_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.routing_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.routing_schedule_weeks(id) on delete cascade,
  employee_id uuid not null references public.routing_employees(id) on delete cascade,
  days jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (week_id, employee_id)
);

create index if not exists idx_schedule_entries_week on public.routing_schedule_entries (week_id);
