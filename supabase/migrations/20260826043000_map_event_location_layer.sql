-- Structured, evidence-led location data for the lazy-loaded map view.
-- This extends the canonical life_events table so the same facts can later
-- support maps, timelines and profile life journeys.

create table public.places (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  historical_names text[] not null default '{}'::text[],
  locality text,
  district text,
  province text,
  country text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  coordinate_precision text not null default 'unknown'
    check (coordinate_precision in ('exact','property','locality','district','region','country','unknown')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint places_coordinates_together check (
    (latitude is null and longitude is null) or
    (latitude is not null and longitude is not null)
  ),
  constraint places_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint places_longitude_range check (longitude is null or longitude between -180 and 180)
);

alter table public.life_events
  add column place_id uuid references public.places(id) on delete set null,
  add column historical_place_name text,
  add column latitude numeric(9,6),
  add column longitude numeric(9,6),
  add column date_precision text not null default 'unknown',
  add column location_precision text not null default 'unknown',
  add column source_reference text,
  add column map_visibility boolean not null default true,
  add column is_active boolean not null default true,
  add column updated_at timestamptz not null default now();

alter table public.life_events
  add constraint life_events_event_type_check check (
    event_type in (
      'birth','baptism','residence','marriage','farm_property','congregation',
      'employment','military_service','migration','census_register','death',
      'burial','other_documented_presence','other'
    )
  ),
  add constraint life_events_source_status_check check (
    source_status in ('documented','strong','family_supplied','probable','hypothesis','unresolved')
  ),
  add constraint life_events_date_precision_check check (
    date_precision in ('exact','month','year','range','circa','before','after','unknown')
  ),
  add constraint life_events_location_precision_check check (
    location_precision in ('exact','property','locality','district','region','country','unknown')
  ),
  add constraint life_events_coordinates_together check (
    (latitude is null and longitude is null) or
    (latitude is not null and longitude is not null)
  ),
  add constraint life_events_latitude_range check (latitude is null or latitude between -90 and 90),
  add constraint life_events_longitude_range check (longitude is null or longitude between -180 and 180),
  add constraint life_events_date_order check (date_to is null or date_from is null or date_to >= date_from);

-- Existing records contain complete day-level dates. Their location precision
-- remains unknown until each place is reviewed during the pilot-data phase.
update public.life_events
set date_precision = case
  when date_from is not null and (date_to is null or date_to = date_from) then 'exact'
  when date_from is not null and date_to is not null then 'range'
  else 'unknown'
end;

create table public.life_event_sources (
  event_id uuid not null references public.life_events(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  support_type text not null default 'supports'
    check (support_type in ('supports','contradicts','context')),
  note text,
  created_at timestamptz not null default now(),
  primary key (event_id, source_id)
);

-- Routes are explicit evidence objects. The map must never infer and display a
-- journey merely because two location events exist.
create table public.life_event_routes (
  id uuid primary key default gen_random_uuid(),
  from_event_id uuid not null references public.life_events(id) on delete cascade,
  to_event_id uuid not null references public.life_events(id) on delete cascade,
  movement_type text not null default 'other'
    check (movement_type in ('relocation','travel','military','employment','family','other')),
  route_status text not null
    check (route_status in ('documented','inferred','research_frontier')),
  source_reference text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_event_routes_distinct_events check (from_event_id <> to_event_id),
  constraint life_event_routes_unique_pair unique (from_event_id, to_event_id)
);

create or replace function private.validate_life_event_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_person uuid;
  to_person uuid;
begin
  select person_id into from_person
  from public.life_events
  where id = new.from_event_id;

  select person_id into to_person
  from public.life_events
  where id = new.to_event_id;

  if from_person is null or to_person is null then
    raise exception 'Both route events must exist';
  end if;

  if from_person <> to_person then
    raise exception 'A life-event route must connect events for the same person';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_life_event_route() from public, anon, authenticated;

create trigger validate_life_event_route_before_write
before insert or update of from_event_id, to_event_id on public.life_event_routes
for each row execute function private.validate_life_event_route();

create trigger places_touch_updated_at
before update on public.places
for each row execute function private.touch_updated_at();

create trigger life_events_touch_updated_at
before update on public.life_events
for each row execute function private.touch_updated_at();

create trigger life_event_routes_touch_updated_at
before update on public.life_event_routes
for each row execute function private.touch_updated_at();

create index places_canonical_name_lower_idx on public.places (lower(canonical_name));
create index life_events_map_person_date_idx
  on public.life_events (person_id, date_from)
  where is_active and map_visibility;
create index life_events_map_place_date_idx
  on public.life_events (place_id, date_from)
  where is_active and map_visibility and place_id is not null;
create index life_event_sources_source_idx on public.life_event_sources (source_id);
create index life_event_routes_from_idx on public.life_event_routes (from_event_id) where is_active;
create index life_event_routes_to_idx on public.life_event_routes (to_event_id) where is_active;

alter table public.places enable row level security;
alter table public.life_event_sources enable row level security;
alter table public.life_event_routes enable row level security;

create policy places_family_read on public.places
for select to authenticated using (private.is_approved_member());
create policy places_editor_all on public.places
for all to authenticated using (private.is_editor()) with check (private.is_editor());

create policy life_event_sources_family_read on public.life_event_sources
for select to authenticated using (private.is_approved_member());
create policy life_event_sources_editor_all on public.life_event_sources
for all to authenticated using (private.is_editor()) with check (private.is_editor());

create policy life_event_routes_family_read on public.life_event_routes
for select to authenticated using (private.is_approved_member());
create policy life_event_routes_editor_all on public.life_event_routes
for all to authenticated using (private.is_editor()) with check (private.is_editor());

grant select, insert, update, delete on public.places to authenticated;
grant select, insert, update, delete on public.life_event_sources to authenticated;
grant select, insert, update, delete on public.life_event_routes to authenticated;

comment on table public.places is 'Reusable, reviewed geographic references for evidence-led life events.';
comment on column public.life_events.place is 'Original display wording retained for backwards compatibility and historical citation fidelity.';
comment on column public.life_events.place_id is 'Optional reviewed place reference. Event coordinates override the place centroid when supplied.';
comment on column public.life_events.source_status is 'Canonical evidence vocabulary; the map presents these statuses as documented, family evidence, inferred or research frontier.';
comment on table public.life_event_routes is 'Explicitly reviewed movements. Absence of a route means the map must not invent one between known locations.';
comment on table public.life_event_sources is 'Structured source links for life events; source_reference remains available for citations not yet entered in sources.';
comment on table public.life_events is 'Canonical reusable historical events for profiles, timelines and the lazy-loaded map. Branch membership is calculated from the selected centre person or couple and is never persisted here.';
