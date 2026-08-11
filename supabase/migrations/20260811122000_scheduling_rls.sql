-- This project auto-enables RLS on newly created tables; the pre-existing
-- routing_* tables run without it (the SPA uses the anon key directly).
-- Match that model for the scheduling tables.

alter table public.routing_employees disable row level security;
alter table public.routing_schedule_weeks disable row level security;
alter table public.routing_schedule_entries disable row level security;
