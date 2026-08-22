create or replace function private.is_approved_member()
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
  );
$$;

revoke all on function private.is_approved_member() from public, anon, authenticated;
grant execute on function private.is_approved_member() to authenticated;

create table if not exists public.person_photos (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  date_text text,
  place text,
  source_status text not null default 'family_supplied' check (source_status in ('documented','strong','family_supplied','probable','hypothesis','unresolved')),
  is_primary boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists person_photos_person_id_idx on public.person_photos(person_id);
alter table public.person_photos enable row level security;

create policy person_photos_family_read on public.person_photos
for select to authenticated using (private.is_approved_member());
create policy person_photos_editor_insert on public.person_photos
for insert to authenticated with check (private.is_editor());
create policy person_photos_editor_update on public.person_photos
for update to authenticated using (private.is_editor()) with check (private.is_editor());
create policy person_photos_editor_delete on public.person_photos
for delete to authenticated using (private.is_editor());

grant select, insert, update, delete on public.person_photos to authenticated;

insert into storage.buckets (id, name, public)
values ('person-photos', 'person-photos', false)
on conflict (id) do update set public = false;

create policy person_photos_storage_family_read on storage.objects
for select to authenticated
using (bucket_id = 'person-photos' and private.is_approved_member());
create policy person_photos_storage_editor_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'person-photos' and private.is_editor());
create policy person_photos_storage_editor_update on storage.objects
for update to authenticated
using (bucket_id = 'person-photos' and private.is_editor())
with check (bucket_id = 'person-photos' and private.is_editor());
create policy person_photos_storage_editor_delete on storage.objects
for delete to authenticated
using (bucket_id = 'person-photos' and private.is_editor());
