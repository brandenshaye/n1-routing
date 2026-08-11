-- The scheduling tables were created without API-role grants (the push ran as
-- a role whose default privileges don't cover anon/authenticated). Match the
-- access model of the existing routing_* tables.

grant select, insert, update, delete
  on public.routing_employees, public.routing_schedule_weeks, public.routing_schedule_entries
  to anon, authenticated, service_role;
