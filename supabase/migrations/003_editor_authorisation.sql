create schema if not exists private;

create or replace function private.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users au
    where au.user_id = (select auth.uid())
      and au.status = 'approved'
      and au.role in ('editor','admin')
  );
$$;

revoke all on function private.is_editor() from public, anon, authenticated;
grant execute on function private.is_editor() to authenticated;

grant insert, update on public.app_users to authenticated;
grant insert, update, delete on public.people, public.relationships, public.life_events, public.narratives, public.sources, public.person_sources to authenticated;
grant update on public.contributions to authenticated;

create policy "editors can read all app users" on public.app_users for select to authenticated using (private.is_editor());
create policy "editors can add app users" on public.app_users for insert to authenticated with check (private.is_editor());
create policy "editors can update app users" on public.app_users for update to authenticated using (private.is_editor()) with check (private.is_editor());

create policy "editors can read access requests" on public.access_requests for select to authenticated using (private.is_editor());
create policy "editors can update access requests" on public.access_requests for update to authenticated using (private.is_editor()) with check (private.is_editor());

create policy "editors can read contributions" on public.contributions for select to authenticated using (private.is_editor());
create policy "editors can update contributions" on public.contributions for update to authenticated using (private.is_editor()) with check (private.is_editor());

create policy "editors can add people" on public.people for insert to authenticated with check (private.is_editor());
create policy "editors can update people" on public.people for update to authenticated using (private.is_editor()) with check (private.is_editor());
create policy "editors can delete people" on public.people for delete to authenticated using (private.is_editor());

create policy "editors can add relationships" on public.relationships for insert to authenticated with check (private.is_editor());
create policy "editors can update relationships" on public.relationships for update to authenticated using (private.is_editor()) with check (private.is_editor());
create policy "editors can delete relationships" on public.relationships for delete to authenticated using (private.is_editor());

create policy "editors can add life events" on public.life_events for insert to authenticated with check (private.is_editor());
create policy "editors can update life events" on public.life_events for update to authenticated using (private.is_editor()) with check (private.is_editor());
create policy "editors can delete life events" on public.life_events for delete to authenticated using (private.is_editor());

create policy "editors can add narratives" on public.narratives for insert to authenticated with check (private.is_editor());
create policy "editors can update narratives" on public.narratives for update to authenticated using (private.is_editor()) with check (private.is_editor());
create policy "editors can delete narratives" on public.narratives for delete to authenticated using (private.is_editor());
