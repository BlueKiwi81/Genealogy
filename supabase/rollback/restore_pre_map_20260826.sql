-- EMERGENCY MANUAL RESTORE ONLY.
-- Pair this database restore with Git branch:
--   backup/pre-map-heraldry-2026-08-26
--
-- This removes the map/location layer and restores public.life_events to the
-- exact pre-map snapshot. It intentionally does not run as a migration.

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.schemata
    where schema_name = 'backup_pre_map_20260826'
  ) then
    raise exception 'Required backup schema backup_pre_map_20260826 is missing';
  end if;

  if (select count(*) from backup_pre_map_20260826.table_manifest where verified) <> 24 then
    raise exception 'Pre-map backup manifest is not fully verified';
  end if;

  if (select count(*) from backup_pre_map_20260826.life_events) <> 11 then
    raise exception 'Expected 11 snapshotted life_events before restore';
  end if;
end;
$$;

drop table if exists public.life_event_routes;
drop table if exists public.life_event_sources;

delete from public.life_events current_event
where not exists (
  select 1
  from backup_pre_map_20260826.life_events backup_event
  where backup_event.id = current_event.id
);

update public.life_events current_event
set
  person_id = backup_event.person_id,
  event_type = backup_event.event_type,
  date_from = backup_event.date_from,
  date_to = backup_event.date_to,
  date_text = backup_event.date_text,
  place = backup_event.place,
  title = backup_event.title,
  narrative = backup_event.narrative,
  source_status = backup_event.source_status,
  created_at = backup_event.created_at
from backup_pre_map_20260826.life_events backup_event
where backup_event.id = current_event.id;

insert into public.life_events (
  id, person_id, event_type, date_from, date_to, date_text, place, title,
  narrative, source_status, created_at
)
select
  backup_event.id, backup_event.person_id, backup_event.event_type,
  backup_event.date_from, backup_event.date_to, backup_event.date_text,
  backup_event.place, backup_event.title, backup_event.narrative,
  backup_event.source_status, backup_event.created_at
from backup_pre_map_20260826.life_events backup_event
where not exists (
  select 1 from public.life_events current_event where current_event.id = backup_event.id
);

drop trigger if exists life_events_touch_updated_at on public.life_events;

alter table public.life_events
  drop constraint if exists life_events_event_type_check,
  drop constraint if exists life_events_source_status_check,
  drop constraint if exists life_events_date_precision_check,
  drop constraint if exists life_events_location_precision_check,
  drop constraint if exists life_events_coordinates_together,
  drop constraint if exists life_events_latitude_range,
  drop constraint if exists life_events_longitude_range,
  drop constraint if exists life_events_date_order,
  drop column if exists place_id,
  drop column if exists historical_place_name,
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists date_precision,
  drop column if exists location_precision,
  drop column if exists source_reference,
  drop column if exists map_visibility,
  drop column if exists is_active,
  drop column if exists updated_at;

drop table if exists public.places;
drop function if exists private.validate_life_event_route();

do $$
begin
  if (select count(*) from public.life_events) <> 11 then
    raise exception 'Restore validation failed: public.life_events row count is not 11';
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('places','life_event_sources','life_event_routes')
  ) then
    raise exception 'Restore validation failed: map tables remain';
  end if;
end;
$$;

commit;
