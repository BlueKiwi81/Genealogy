create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id) on delete set null,
  evidence_type text not null check (evidence_type in ('birth_certificate','baptism_record','marriage_record','death_notice','estate_record','identity_document','church_register','civil_register','family_bible','newspaper_notice','photograph','letter','oral_recollection','researcher_report','other')),
  title text not null,
  document_date date,
  date_text text,
  issuing_authority text,
  repository text,
  storage_path text,
  original_filename text,
  notes text,
  visibility text not null default 'family' check (visibility in ('family','restricted')),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','needs_clarification')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.genealogy_claims (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete cascade,
  relationship_id uuid references public.relationships(id) on delete cascade,
  claim_type text not null,
  claim_label text not null,
  claim_value jsonb not null default '{}'::jsonb,
  evidence_status text not null default 'unresolved' check (evidence_status in ('documented','strong','family_supplied','probable','hypothesis','unresolved')),
  canonical boolean not null default true,
  include_in_dossier boolean not null default true,
  dossier_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint genealogy_claim_target check (person_id is not null or relationship_id is not null)
);

create table if not exists public.claim_evidence (
  claim_id uuid not null references public.genealogy_claims(id) on delete cascade,
  evidence_id uuid not null references public.evidence_items(id) on delete cascade,
  support_type text not null default 'supports' check (support_type in ('supports','contradicts','context')),
  evidence_strength text not null default 'indirect' check (evidence_strength in ('direct','strong','indirect','weak')),
  note text,
  primary key (claim_id, evidence_id)
);

create table if not exists public.claim_review_suggestions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.genealogy_claims(id) on delete cascade,
  evidence_id uuid references public.evidence_items(id) on delete cascade,
  current_status text not null,
  suggested_status text not null check (suggested_status in ('documented','strong','family_supplied','probable','hypothesis','unresolved')),
  rationale text not null,
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists evidence_items_review_status_idx on public.evidence_items(review_status);
create index if not exists genealogy_claims_person_idx on public.genealogy_claims(person_id);
create index if not exists genealogy_claims_relationship_idx on public.genealogy_claims(relationship_id);
create index if not exists genealogy_claims_status_idx on public.genealogy_claims(evidence_status);
create index if not exists claim_evidence_evidence_idx on public.claim_evidence(evidence_id);
create index if not exists claim_review_suggestions_status_idx on public.claim_review_suggestions(status);

alter table public.evidence_items enable row level security;
alter table public.genealogy_claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.claim_review_suggestions enable row level security;

create policy evidence_items_family_read on public.evidence_items for select to authenticated using (private.is_approved_member());
create policy evidence_items_family_insert on public.evidence_items for insert to authenticated with check (private.is_approved_member() and submitted_by = auth.uid());
create policy evidence_items_editor_update on public.evidence_items for update to authenticated using (private.is_editor()) with check (private.is_editor());
create policy evidence_items_editor_delete on public.evidence_items for delete to authenticated using (private.is_editor());
create policy genealogy_claims_family_read on public.genealogy_claims for select to authenticated using (private.is_approved_member());
create policy genealogy_claims_editor_all on public.genealogy_claims for all to authenticated using (private.is_editor()) with check (private.is_editor());
create policy claim_evidence_family_read on public.claim_evidence for select to authenticated using (private.is_approved_member());
create policy claim_evidence_editor_all on public.claim_evidence for all to authenticated using (private.is_editor()) with check (private.is_editor());
create policy claim_review_suggestions_editor_only on public.claim_review_suggestions for all to authenticated using (private.is_editor()) with check (private.is_editor());

grant select, insert, update, delete on public.evidence_items to authenticated;
grant select, insert, update, delete on public.genealogy_claims to authenticated;
grant select, insert, update, delete on public.claim_evidence to authenticated;
grant select, insert, update, delete on public.claim_review_suggestions to authenticated;

comment on table public.genealogy_claims is 'Evidence-controlled assertions used by the live tree and future dossier exports.';
comment on table public.claim_review_suggestions is 'Editor-facing recommendations only; a suggested evidence-status upgrade never changes the canonical claim automatically.';
