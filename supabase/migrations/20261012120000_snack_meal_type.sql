-- Allow "snack" service windows alongside breakfast and lunch.
-- Drops whatever CHECK constraint currently limits meal_type, then re-adds it with snack included.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'routing_service_windows'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%meal_type%'
  loop
    execute format('alter table public.routing_service_windows drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.routing_service_windows
  add constraint routing_service_windows_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'snack'));
