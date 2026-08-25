-- Small reviewed pilot for the map layer. Coordinates are locality centroids,
-- never claims about an exact church, hospital, farm or residence.

insert into public.places (
  id, canonical_name, historical_names, locality, district, province, country,
  latitude, longitude, coordinate_precision, notes
) values
  (
    uuid_generate_v5(uuid_ns_url(), 'genealogy:place:bethlehem-free-state-south-africa'),
    'Bethlehem', array['Bethlehem, Orange Free State','Bethlehem, Orange River Colony'],
    'Bethlehem', 'Thabo Mofutsanyana', 'Free State', 'South Africa',
    -28.230780, 28.307070, 'locality',
    'Reviewed locality centroid. Individual records retain their original historical jurisdiction wording.'
  ),
  (
    uuid_generate_v5(uuid_ns_url(), 'genealogy:place:germiston-gauteng-south-africa'),
    'Germiston', '{}'::text[],
    'Germiston', 'City of Ekurhuleni', 'Gauteng', 'South Africa',
    -26.216667, 28.166667, 'locality',
    'Reviewed city centroid. The linked 1961 death event retains the more specific Primrose wording.'
  ),
  (
    uuid_generate_v5(uuid_ns_url(), 'genealogy:place:aurora-western-cape-south-africa'),
    'Aurora', '{}'::text[],
    'Aurora', 'West Coast', 'Western Cape', 'South Africa',
    -32.704440, 18.485000, 'locality',
    'Reviewed town centroid; historically described in the event as Aurora in the Piketberg district.'
  ),
  (
    uuid_generate_v5(uuid_ns_url(), 'genealogy:place:gqeberha-eastern-cape-south-africa'),
    'Gqeberha', array['Port Elizabeth'],
    'Gqeberha', 'Nelson Mandela Bay', 'Eastern Cape', 'South Africa',
    -33.958000, 25.600000, 'locality',
    'Reviewed city centroid. Port Elizabeth is retained as the historical event name.'
  ),
  (
    uuid_generate_v5(uuid_ns_url(), 'genealogy:place:carolina-mpumalanga-south-africa'),
    'Carolina', '{}'::text[],
    'Carolina', 'Gert Sibande', 'Mpumalanga', 'South Africa',
    -26.069270, 30.114890, 'locality',
    'Reviewed town centroid. Exact addresses remain in event wording and are not represented by this point.'
  ),
  (
    uuid_generate_v5(uuid_ns_url(), 'genealogy:place:bloemhof-unresolved-1899'),
    'Bloemhof (unresolved 1899 reference)', '{}'::text[],
    null, null, null, 'South Africa',
    null, null, 'unknown',
    'The death notice says Bloemhof and describes it as near Kimberley. No coordinate is assigned until the historical locality is reconciled.'
  )
on conflict (id) do update set
  canonical_name = excluded.canonical_name,
  historical_names = excluded.historical_names,
  locality = excluded.locality,
  district = excluded.district,
  province = excluded.province,
  country = excluded.country,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  coordinate_precision = excluded.coordinate_precision,
  notes = excluded.notes;

update public.life_events event
set
  place_id = place_ref.id,
  location_precision = case when event.place = 'Bethlehem district' then 'district' else 'locality' end,
  historical_place_name = case
    when event.date_from = date '1908-02-04' then 'Bethlehem, Orange River Colony'
    else event.place
  end,
  source_reference = case
    when event.event_type = 'baptism' then 'Bethlehem baptism register entry 1208 (original record summarised in the canonical event).'
    when event.date_from = date '1908-02-04' then 'FamilySearch, Free State Dutch Reformed Church Records, Bethlehem Marriages 1904-1923, image 161 of 767, entry 275; inspected working screenshot IMG_0719.jpeg.'
    when event.place = 'Bethlehem district' then 'Death registration summarised in the canonical event.'
    else 'Bethlehem Dutch Reformed marriage register no. 10 (original record summarised in the canonical event).'
  end
from public.places place_ref
where place_ref.id = uuid_generate_v5(uuid_ns_url(), 'genealogy:place:bethlehem-free-state-south-africa')
  and event.place in ('Bethlehem, Orange Free State','Bethlehem','Bethlehem district');

update public.life_events event
set
  place_id = place_ref.id,
  location_precision = 'locality',
  historical_place_name = event.place,
  source_reference = 'Original and duplicate marriage registers summarised in the canonical event.'
from public.places place_ref
where place_ref.id = uuid_generate_v5(uuid_ns_url(), 'genealogy:place:aurora-western-cape-south-africa')
  and event.place = 'Aurora, Piketberg district';

update public.life_events event
set
  place_id = place_ref.id,
  location_precision = 'locality',
  historical_place_name = 'Port Elizabeth',
  source_reference = 'Official death-information form summarised in the canonical event.'
from public.places place_ref
where place_ref.id = uuid_generate_v5(uuid_ns_url(), 'genealogy:place:gqeberha-eastern-cape-south-africa')
  and event.place = 'Provincial Hospital, Port Elizabeth';

update public.life_events event
set
  place_id = place_ref.id,
  location_precision = 'locality',
  historical_place_name = event.place,
  source_reference = 'Official death registration summarised in the canonical event.'
from public.places place_ref
where place_ref.id = uuid_generate_v5(uuid_ns_url(), 'genealogy:place:germiston-gauteng-south-africa')
  and event.place = 'Primrose, Germiston';

update public.life_events event
set
  place_id = place_ref.id,
  location_precision = 'unknown',
  historical_place_name = event.place,
  source_reference = 'Original death notice summarised in the canonical event; locality requires reconciliation.'
from public.places place_ref
where place_ref.id = uuid_generate_v5(uuid_ns_url(), 'genealogy:place:bloemhof-unresolved-1899')
  and event.place = 'Bloemhof (described in death notice as near Kimberley)';

-- The 1961 death registration directly records usual residence at this
-- address. This is a presence statement, not an inferred journey from
-- Bethlehem or to Germiston, so no route row is created.
insert into public.life_events (
  id, person_id, event_type, date_from, date_text, date_precision, place,
  place_id, location_precision, title, narrative, source_status,
  source_reference, map_visibility, is_active
)
select
  uuid_generate_v5(uuid_ns_url(), 'genealogy:life-event:1961-carolina-usual-residence:' || death.person_id::text),
  death.person_id,
  'residence',
  death.date_from,
  death.date_text,
  'exact',
  '70 Steyn Street, Carolina',
  uuid_generate_v5(uuid_ns_url(), 'genealogy:place:carolina-mpumalanga-south-africa'),
  'property',
  'Usually resident at Carolina',
  'The 1961 death registration records 70 Steyn Street, Carolina as his usual residence. This does not establish the route or date of relocation.',
  'documented',
  'Official death registration already summarised in the linked 22 December 1961 death event.',
  true,
  true
from public.life_events death
where death.event_type = 'death'
  and death.date_from = date '1961-12-22'
  and death.place = 'Primrose, Germiston'
on conflict (id) do update set
  place_id = excluded.place_id,
  location_precision = excluded.location_precision,
  narrative = excluded.narrative,
  source_reference = excluded.source_reference,
  map_visibility = true,
  is_active = true;
