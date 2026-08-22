insert into public.genealogy_claims (person_id, claim_type, claim_label, claim_value, evidence_status, canonical, include_in_dossier)
select p.id, 'birth_date', 'Birth date', jsonb_build_object('date', p.birth_date), p.source_status, true, true from public.people p
where p.birth_date is not null and not exists (select 1 from public.genealogy_claims c where c.person_id = p.id and c.claim_type = 'birth_date' and c.canonical);

insert into public.genealogy_claims (person_id, claim_type, claim_label, claim_value, evidence_status, canonical, include_in_dossier)
select p.id, 'death_date', 'Death date', jsonb_build_object('date', p.death_date), p.source_status, true, true from public.people p
where p.death_date is not null and not exists (select 1 from public.genealogy_claims c where c.person_id = p.id and c.claim_type = 'death_date' and c.canonical);

insert into public.genealogy_claims (person_id, claim_type, claim_label, claim_value, evidence_status, canonical, include_in_dossier)
select p.id, 'birth_place', 'Birth place', jsonb_build_object('place', p.birth_place), p.source_status, true, true from public.people p
where p.birth_place is not null and not exists (select 1 from public.genealogy_claims c where c.person_id = p.id and c.claim_type = 'birth_place' and c.canonical);

insert into public.genealogy_claims (person_id, claim_type, claim_label, claim_value, evidence_status, canonical, include_in_dossier)
select p.id, 'death_place', 'Death place', jsonb_build_object('place', p.death_place), p.source_status, true, true from public.people p
where p.death_place is not null and not exists (select 1 from public.genealogy_claims c where c.person_id = p.id and c.claim_type = 'death_place' and c.canonical);

insert into public.genealogy_claims (person_id, claim_type, claim_label, claim_value, evidence_status, canonical, include_in_dossier)
select p.id, 'occupation', 'Occupation / life work', jsonb_build_object('text', p.occupation_summary), p.source_status, true, true from public.people p
where p.occupation_summary is not null and not exists (select 1 from public.genealogy_claims c where c.person_id = p.id and c.claim_type = 'occupation' and c.canonical);

insert into public.genealogy_claims (person_id, claim_type, claim_label, claim_value, evidence_status, canonical, include_in_dossier)
select p.id, 'known_as', 'Known as', jsonb_build_object('name', p.preferred_name), p.preferred_name_status, true, true from public.people p
where p.preferred_name is not null and not exists (select 1 from public.genealogy_claims c where c.person_id = p.id and c.claim_type = 'known_as' and c.canonical);

insert into public.genealogy_claims (relationship_id, claim_type, claim_label, claim_value, evidence_status, canonical, include_in_dossier)
select r.id,
       case when r.relationship_type = 'parent' then 'parentage' else r.relationship_type end,
       case when r.relationship_type = 'parent' then 'Parent-child relationship' else initcap(replace(r.relationship_type, '_', ' ')) || ' relationship' end,
       jsonb_build_object('person1_id', r.person1_id, 'person2_id', r.person2_id, 'relationship_status', r.relationship_status, 'start_date', r.start_date, 'end_date', r.end_date, 'date_note', r.date_note),
       r.source_status, true, true
from public.relationships r
where not exists (select 1 from public.genealogy_claims c where c.relationship_id = r.id and c.canonical);
