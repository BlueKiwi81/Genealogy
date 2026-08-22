-- Phase 1 genealogy schema.
-- Canonical family information is edited by approved editors.
-- Family members submit proposed changes through contributions.

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  given_names text not null,
  preferred_name text,
  surname text,
  gender text,
  birth_date date,
  death_date date,
  life_status text not null default 'unknown' check (life_status in ('living','deceased','unknown')),
  birth_place text,
  death_place text,
  occupation_summary text,
  narrative_summary text,
  source_status text not null default 'family_supplied' check (source_status in ('documented','strong','family_supplied','probable','hypothesis','unresolved')),
  privacy_level text not null default 'family' check (privacy_level in ('family','restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  display_name text,
  role text not null default 'family' check (role in ('family','editor','admin')),
  status text not null default 'pending' check (status in ('pending','approved','blocked')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  person1_id uuid not null references public.people(id) on delete cascade,
  person2_id uuid not null references public.people(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('parent','spouse','partner','former_spouse','sibling','other')),
  relationship_status text not null default 'current' check (relationship_status in ('current','ended','historical','unknown')),
  start_date date,
  end_date date,
  date_note text,
  notes text,
  source_status text not null default 'family_supplied' check (source_status in ('documented','strong','family_supplied','probable','hypothesis','unresolved')),
  created_at timestamptz not null default now(),
  constraint different_people check (person1_id <> person2_id)
);

comment on column public.relationships.person1_id is 'For relationship_type=parent, person1 is parent and person2 is child.';

create table if not exists public.life_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  event_type text not null,
  date_from date,
  date_to date,
  date_text text,
  place text,
  title text,
  narrative text,
  source_status text not null default 'family_supplied',
  created_at timestamptz not null default now()
);

create table if not exists public.narratives (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete cascade,
  title text,
  original_language text not null default 'en',
  original_text text not null,
  edited_text text,
  narrative_status text not null default 'approved',
  source_status text not null default 'family_supplied',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text,
  repository text,
  citation text,
  url text,
  notes text,
  evidence_status text not null default 'unresolved',
  created_at timestamptz not null default now()
);

create table if not exists public.person_sources (
  person_id uuid not null references public.people(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  note text,
  primary key (person_id, source_id)
);

create table if not exists public.contributions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  target_person_id uuid references public.people(id) on delete set null,
  contribution_type text not null,
  original_language text not null default 'en',
  narrative_text text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','needs_clarification')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists relationships_person1_idx on public.relationships(person1_id);
create index if not exists relationships_person2_idx on public.relationships(person2_id);
create index if not exists life_events_person_idx on public.life_events(person_id);
create index if not exists narratives_person_idx on public.narratives(person_id);
create index if not exists contributions_submitter_idx on public.contributions(submitted_by);
create index if not exists contributions_target_idx on public.contributions(target_person_id);
create index if not exists contributions_status_idx on public.contributions(status);

alter table public.people enable row level security;
alter table public.app_users enable row level security;
alter table public.relationships enable row level security;
alter table public.life_events enable row level security;
alter table public.narratives enable row level security;
alter table public.sources enable row level security;
alter table public.person_sources enable row level security;
alter table public.contributions enable row level security;

create policy "app user can read own profile" on public.app_users
for select to authenticated
using (user_id = (select auth.uid()));

create policy "approved family can read people" on public.people
for select to authenticated
using (exists (select 1 from public.app_users au where au.user_id = (select auth.uid()) and au.status = 'approved'));

create policy "approved family can read relationships" on public.relationships
for select to authenticated
using (exists (select 1 from public.app_users au where au.user_id = (select auth.uid()) and au.status = 'approved'));

create policy "approved family can read life events" on public.life_events
for select to authenticated
using (exists (select 1 from public.app_users au where au.user_id = (select auth.uid()) and au.status = 'approved'));

create policy "approved family can read narratives" on public.narratives
for select to authenticated
using (exists (select 1 from public.app_users au where au.user_id = (select auth.uid()) and au.status = 'approved'));

create policy "approved family can read sources" on public.sources
for select to authenticated
using (exists (select 1 from public.app_users au where au.user_id = (select auth.uid()) and au.status = 'approved'));

create policy "approved family can read person sources" on public.person_sources
for select to authenticated
using (exists (select 1 from public.app_users au where au.user_id = (select auth.uid()) and au.status = 'approved'));

create policy "contributor can read own submissions" on public.contributions
for select to authenticated
using (submitted_by = (select auth.uid()));

create policy "approved family can submit contributions" on public.contributions
for insert to authenticated
with check (
  submitted_by = (select auth.uid()) and
  exists (select 1 from public.app_users au where au.user_id = (select auth.uid()) and au.status = 'approved')
);

grant usage on schema public to authenticated;
grant select on public.app_users to authenticated;
grant select on public.people, public.relationships, public.life_events, public.narratives, public.sources, public.person_sources to authenticated;
grant select, insert on public.contributions to authenticated;
