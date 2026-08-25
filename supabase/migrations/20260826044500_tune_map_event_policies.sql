-- Approved editors are approved family members, so the family SELECT policy
-- already covers their reads. Keep write policies action-specific to avoid
-- evaluating two permissive SELECT policies for every map-data query.

drop policy places_editor_all on public.places;
create policy places_editor_insert on public.places
for insert to authenticated with check (private.is_editor());
create policy places_editor_update on public.places
for update to authenticated using (private.is_editor()) with check (private.is_editor());
create policy places_editor_delete on public.places
for delete to authenticated using (private.is_editor());

drop policy life_event_sources_editor_all on public.life_event_sources;
create policy life_event_sources_editor_insert on public.life_event_sources
for insert to authenticated with check (private.is_editor());
create policy life_event_sources_editor_update on public.life_event_sources
for update to authenticated using (private.is_editor()) with check (private.is_editor());
create policy life_event_sources_editor_delete on public.life_event_sources
for delete to authenticated using (private.is_editor());

drop policy life_event_routes_editor_all on public.life_event_routes;
create policy life_event_routes_editor_insert on public.life_event_routes
for insert to authenticated with check (private.is_editor());
create policy life_event_routes_editor_update on public.life_event_routes
for update to authenticated using (private.is_editor()) with check (private.is_editor());
create policy life_event_routes_editor_delete on public.life_event_routes
for delete to authenticated using (private.is_editor());
