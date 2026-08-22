-- Phase 1 hardening additions applied after the initial schema.

alter table public.people add column if not exists slug text;
create unique index if not exists people_slug_unique_idx on public.people(slug) where slug is not null;

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.access_requests enable row level security;
grant select, insert, update on public.access_requests to authenticated;

create policy "user can read own access request" on public.access_requests
for select to authenticated
using (user_id = (select auth.uid()));

create policy "user can request family access" on public.access_requests
for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "user can refresh own pending request" on public.access_requests
for update to authenticated
using (user_id = (select auth.uid()) and status = 'pending')
with check (user_id = (select auth.uid()) and status = 'pending');

create index if not exists app_users_person_idx on public.app_users(person_id);
create index if not exists contributions_reviewed_by_idx on public.contributions(reviewed_by);
create index if not exists life_events_person_idx on public.life_events(person_id);
create index if not exists person_sources_source_idx on public.person_sources(source_id);
