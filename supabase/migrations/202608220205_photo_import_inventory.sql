create table if not exists public.photo_import_items (
  id uuid primary key default gen_random_uuid(),
  source_collection text not null,
  source_item text not null,
  source_description text not null,
  source_file_hint text,
  import_status text not null default 'identified_only' check (import_status in ('identified_only','available_local','needs_file','imported','hold')),
  notes text,
  created_at timestamptz not null default now(),
  unique(source_collection, source_item)
);

create table if not exists public.photo_import_people (
  item_id uuid not null references public.photo_import_items(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  association_status text not null check (association_status in ('confirmed_person','person_present_position_unknown','context_only','tentative')),
  evidence_status text not null default 'family_supplied' check (evidence_status in ('documented','strong','family_supplied','probable','hypothesis','unresolved')),
  identification_note text,
  primary key (item_id, person_id)
);

alter table public.photo_import_items enable row level security;
alter table public.photo_import_people enable row level security;
grant select, insert, update, delete on public.photo_import_items to authenticated;
grant select, insert, update, delete on public.photo_import_people to authenticated;
create policy photo_import_items_editor_all on public.photo_import_items for all to authenticated using (private.is_editor()) with check (private.is_editor());
create policy photo_import_people_editor_all on public.photo_import_people for all to authenticated using (private.is_editor()) with check (private.is_editor());
create index if not exists photo_import_people_person_idx on public.photo_import_people(person_id);

alter table public.person_photos add column if not exists source_collection text;
alter table public.person_photos add column if not exists source_item text;
alter table public.person_photos add column if not exists association_status text check (association_status in ('confirmed_person','person_present_position_unknown','context_only','tentative'));
alter table public.person_photos add column if not exists identification_note text;
create unique index if not exists person_photos_archive_unique on public.person_photos(person_id, source_collection, source_item) where source_collection is not null and source_item is not null;
