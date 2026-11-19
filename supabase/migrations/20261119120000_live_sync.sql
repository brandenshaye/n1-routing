-- Live sync: broadcast row changes to every open screen, and let the schedule
-- save a single field of a single day without overwriting the rest of the week.

-- 1. Add the app's tables to Supabase Realtime (skipping any already added).
do $$
declare t text;
begin
  foreach t in array array[
    'routing_schools', 'routing_service_windows', 'routing_routes',
    'routing_employees', 'routing_schedule_weeks', 'routing_schedule_entries'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 2. Merge a partial days patch into a schedule entry, two levels deep:
--    patch_schedule_days(id, '{"tue": {"in": "6:00 AM"}}') changes only Tuesday's
--    "in" and leaves every other day and field exactly as stored.
create or replace function public.patch_schedule_days(p_entry_id uuid, p_days jsonb)
returns void
language sql
security invoker
as $$
  update public.routing_schedule_entries e
     set days = coalesce(e.days, '{}'::jsonb) || (
           select coalesce(jsonb_object_agg(k, coalesce(e.days -> k, '{}'::jsonb) || v), '{}'::jsonb)
           from jsonb_each(p_days) as t(k, v)
         ),
         updated_at = now()
   where e.id = p_entry_id;
$$;

grant execute on function public.patch_schedule_days(uuid, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
