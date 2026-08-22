-- Expand passwordless family registration so the editor can identify and approve relatives.

alter table public.access_requests
  add column if not exists first_name text,
  add column if not exists middle_names text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists email_updates_opt_in boolean not null default false;

comment on column public.access_requests.birth_date is
  'Date of birth supplied by the registering family member. Treat as family-supplied evidence until reconciled with the canonical person record.';

comment on column public.access_requests.email_updates_opt_in is
  'Optional consent to receive family-tree update emails relevant to the registered person.';

create index if not exists access_requests_birth_date_idx
  on public.access_requests(birth_date);

create index if not exists access_requests_email_idx
  on public.access_requests(lower(email));
