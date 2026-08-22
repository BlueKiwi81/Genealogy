alter table public.people add column if not exists preferred_name_status text not null default 'unresolved';

alter table public.people drop constraint if exists people_preferred_name_status_check;
alter table public.people add constraint people_preferred_name_status_check
  check (preferred_name_status in ('documented','strong','family_supplied','probable','hypothesis','unresolved'));

-- Confirmed directly by family during the August 2026 review pass.
update public.people
set preferred_name_status = 'family_supplied'
where slug = 'sarie';
