begin;

-- Structured detail already established in the dossier.
update public.people
set birth_place = coalesce(birth_place, 'Piketberg, Cape Province, South Africa'),
    death_place = coalesce(death_place, 'Strand, Western Cape, South Africa'),
    narrative_summary = 'Born 3 February 1930 and baptised 6 April 1930 in the Piketberg register. The inspected entry names Theunis Daniel Kotze and Janetta Vercuil as her parents. Married Petrus Lafras Meyer on 6 December 1952 and died at Strand on 8 June 2011. The parent links are documented; Janetta''s middle names remain unresolved.',
    source_status = 'documented',
    updated_at = now()
where slug = 'sannie';

update public.people
set narrative_summary = 'Working identity born in 1885 and died 14 July 1959. The inspected baptism of Susanna Johanna Kotze directly names him as her father. Exact birth day and month and his own parents remain open; the original 1922 marriage and death notice are the next best records.',
    updated_at = now()
where slug = 'theunis';

update public.people
set narrative_summary = 'Born 5 January 1902 and died 9 May 1957. The inspected baptism of Susanna Johanna Kotze directly names Janetta Vercuil as her mother. Family sources use Janetta Maria; public marriage and archive metadata use Jeanetta Christina. Her own parents remain unproved.',
    updated_at = now()
where slug = 'janetta';

update public.people
set birth_date = '1860-11-25',
    death_date = '1938-02-23',
    birth_place = coalesce(birth_place, 'Winburg, Orange Free State, South Africa'),
    narrative_summary = 'Compiled Wessels profiles identify him as a son of Petrus Lafras Wessels and Maria Johanna Margaretha van Brakel, and as the father of Adriaan Johannes Lafras Wessels born in 1895. This is a probable working bridge pending an original parent-naming record.',
    source_status = 'probable',
    updated_at = now()
where slug = 'aderjan1860';

update public.people
set birth_date = '1826-09-14',
    death_date = '1865-06-14',
    birth_place = coalesce(birth_place, 'Swellendam, Cape Colony, South Africa'),
    death_place = coalesce(death_place, 'Thaba Bosigo, Lesotho'),
    narrative_summary = 'Compiled historical profiles identify him as a son of Johannes Albertus Wessels and Maria Magdalena Moolman, husband of Maria Johanna Margaretha van Brakel, and father of Adriaan Johannes Lafras Wessels born in 1860. Original images remain desirable.',
    source_status = 'probable',
    updated_at = now()
where slug = 'plw1826';

update public.people
set birth_date = '1869-03-03',
    death_date = '1910-07-08',
    birth_place = coalesce(birth_place, 'Kroonstad district, Orange Free State, South Africa'),
    narrative_summary = 'Compiled profiles identify her as the wife of Adriaan Johannes Lafras Wessels and mother of Adriaan Johannes Lafras Wessels born in 1895. The working dates are 3 March 1869 to 8 July 1910; original parent-naming evidence remains outstanding.',
    source_status = 'probable',
    updated_at = now()
where slug = 'human1869';

update public.people
set birth_place = coalesce(birth_place, 'Bultfontein, Orange Free State, South Africa'),
    narrative_summary = 'Born 1 April 1900 at Bultfontein, married Matthys Hendrik Meyer at Winburg on 5 January 1926, and died in October 1980. Her parents have not been identified reliably. The priority records are her Bultfontein baptism and 1980 death notice or estate file; no parent link has been invented.',
    updated_at = now()
where slug = 'cornelia_botha';

-- Historical Wessels and Van Brakel fan expansion.
insert into public.people
  (id, slug, given_names, surname, gender, birth_date, death_date, life_status, birth_place, death_place, narrative_summary, source_status, privacy_level, preferred_name_status)
values
  (uuid_generate_v5(uuid_ns_url(), 'genealogy:person:maria_van_brakel_1829'), 'maria_van_brakel_1829', 'Maria Johanna Margaretha', 'van Brakel', 'female', '1829-06-15', '1871-08-15', 'deceased', 'Bontbokskuil, Caledon, Cape Colony', 'Welgelegen, Orange Free State', 'Compiled profiles identify her as the wife of Petrus Lafras Wessels and mother of Adriaan Johannes Lafras Wessels born in 1860. She later appears with the surname Maree. Treat as probable until an original family record is inspected.', 'probable', 'family', 'unresolved'),
  (uuid_generate_v5(uuid_ns_url(), 'genealogy:person:adriaan_van_brakel_1787'), 'adriaan_van_brakel_1787', 'Adriaan Johannes', 'van Brakel', 'male', null, '1858-05-29', 'deceased', 'Cape Colony', 'Caledon, Cape Colony', 'Compiled Families of the Overberg profile identifies him as the father of Maria Johanna Margaretha van Brakel and records a christening on 5 August 1787. Original image not inspected.', 'hypothesis', 'family', 'unresolved'),
  (uuid_generate_v5(uuid_ns_url(), 'genealogy:person:judith_engela_wessels_1801'), 'judith_engela_wessels_1801', 'Judith Engela', 'Wessels', 'female', null, null, 'unknown', 'Cape Colony', null, 'Compiled Families of the Overberg profile identifies her as the mother of Maria Johanna Margaretha van Brakel and records a christening on 18 January 1801. Original image not inspected.', 'hypothesis', 'family', 'unresolved')
on conflict (slug) where slug is not null do update
set given_names = excluded.given_names,
    surname = excluded.surname,
    gender = excluded.gender,
    birth_date = excluded.birth_date,
    death_date = excluded.death_date,
    life_status = excluded.life_status,
    birth_place = excluded.birth_place,
    death_place = excluded.death_place,
    narrative_summary = excluded.narrative_summary,
    source_status = excluded.source_status,
    updated_at = now();

-- Coetzee candidate cluster. Every edge remains hypothesis because the
-- candidate daughter's 11 June 1895 birth conflicts with the project's
-- Anna Maria Coetzee birth date of 18 August 1895.
insert into public.people
  (id, slug, given_names, surname, gender, birth_date, death_date, life_status, birth_place, death_place, narrative_summary, source_status, privacy_level, preferred_name_status)
values
  (uuid_generate_v5(uuid_ns_url(), 'genealogy:person:petrus_jacobus_coetzee_1869'), 'petrus_jacobus_coetzee_1869', 'Petrus Jacobus', 'Coetzee', 'male', '1869-12-15', '1932-06-10', 'deceased', 'Burgersdorp district, Cape Colony', 'Brits, Transvaal, South Africa', 'Candidate father of Anna Maria Coetzee. A compiled family group gives a daughter Anna Maria Elizabeth born 11 June 1895 and baptised 11 August 1895 at Steynsburg. That conflicts with the project birth date 18 August 1895, so this identity is not established.', 'hypothesis', 'family', 'unresolved'),
  (uuid_generate_v5(uuid_ns_url(), 'genealogy:person:hester_johanna_venter_1872'), 'hester_johanna_venter_1872', 'Hester Johanna Maria', 'Venter', 'female', null, '1906-09-21', 'deceased', 'Colesberg district, Cape Colony', 'Johannesburg, Transvaal, South Africa', 'Candidate mother of Anna Maria Coetzee, paired with Petrus Jacobus Coetzee in a compiled family group. Her birth is reported only as about 1872. The candidate daughter has a conflicting birth date, so this link remains a hypothesis.', 'hypothesis', 'family', 'unresolved'),
  (uuid_generate_v5(uuid_ns_url(), 'genealogy:person:gert_abraham_coetzee_1823'), 'gert_abraham_coetzee_1823', 'Gert Abraham', 'Coetzee', 'male', '1823-07-20', '1881-12-03', 'deceased', 'Colesberg, Cape Colony', 'Steynsburg, Cape Colony', 'Compiled family group identifies him as the father of candidate Petrus Jacobus Coetzee born in 1869. This deeper line is retained only as part of the unresolved candidate cluster.', 'hypothesis', 'family', 'unresolved'),
  (uuid_generate_v5(uuid_ns_url(), 'genealogy:person:anna_maria_vanderwalt_1838'), 'anna_maria_vanderwalt_1838', 'Anna Maria Elizabeth', 'van der Walt', 'female', null, null, 'unknown', 'Burgersdorp district, Cape Colony', null, 'Compiled family group identifies her as the mother of candidate Petrus Jacobus Coetzee born in 1869. Her birth is reported only as about September 1838. This deeper line is retained only as part of the unresolved candidate cluster.', 'hypothesis', 'family', 'unresolved')
on conflict (slug) where slug is not null do update
set given_names = excluded.given_names,
    surname = excluded.surname,
    gender = excluded.gender,
    birth_date = excluded.birth_date,
    death_date = excluded.death_date,
    life_status = excluded.life_status,
    birth_place = excluded.birth_place,
    death_place = excluded.death_place,
    narrative_summary = excluded.narrative_summary,
    source_status = excluded.source_status,
    updated_at = now();

-- Upgrade the compiled Wessels bridge, but keep it below documented status.
update public.relationships r
set source_status = 'probable',
    notes = 'Compiled WikiTree profile Wessels-907 identifies the 1895 Adriaan as child of Aderjan Wessels and Johanna Christina Maria Human. Original parent-naming evidence is still required.',
    updated_at = now()
where r.relationship_type = 'parent'
  and r.person1_id in ((select id from public.people where slug = 'aderjan1860'), (select id from public.people where slug = 'human1869'))
  and r.person2_id = (select id from public.people where slug = 'adriaan_wessels');

-- Idempotent relationships. For a parent edge, person1 is the parent.
insert into public.relationships
  (id, person1_id, person2_id, relationship_type, relationship_status, notes, source_status)
select uuid_generate_v5(uuid_ns_url(), 'genealogy:relationship:parent:maria_van_brakel_1829:aderjan1860'), p.id, c.id, 'parent', 'current', 'Ancestors family F25599 and WikiTree Wessels-883 identify this parent-child link; original image not inspected.', 'probable'
from public.people p cross join public.people c
where p.slug = 'maria_van_brakel_1829' and c.slug = 'aderjan1860'
on conflict (id) do update set notes = excluded.notes, source_status = excluded.source_status, updated_at = now();

insert into public.relationships
  (id, person1_id, person2_id, relationship_type, relationship_status, notes, source_status)
select uuid_generate_v5(uuid_ns_url(), 'genealogy:relationship:spouse:plw1826:maria_van_brakel_1829'), p.id, s.id, 'spouse', 'historical', 'Compiled historical marriage pairing; original image not inspected.', 'probable'
from public.people p cross join public.people s
where p.slug = 'plw1826' and s.slug = 'maria_van_brakel_1829'
on conflict (id) do update set notes = excluded.notes, source_status = excluded.source_status, updated_at = now();

insert into public.relationships
  (id, person1_id, person2_id, relationship_type, relationship_status, notes, source_status)
select uuid_generate_v5(uuid_ns_url(), 'genealogy:relationship:parent:adriaan_van_brakel_1787:maria_van_brakel_1829'), p.id, c.id, 'parent', 'current', 'Compiled Families of the Overberg profile I954; original image not inspected.', 'hypothesis'
from public.people p cross join public.people c
where p.slug = 'adriaan_van_brakel_1787' and c.slug = 'maria_van_brakel_1829'
on conflict (id) do update set notes = excluded.notes, source_status = excluded.source_status, updated_at = now();

insert into public.relationships
  (id, person1_id, person2_id, relationship_type, relationship_status, notes, source_status)
select uuid_generate_v5(uuid_ns_url(), 'genealogy:relationship:parent:judith_engela_wessels_1801:maria_van_brakel_1829'), p.id, c.id, 'parent', 'current', 'Compiled Families of the Overberg profile I954; original image not inspected.', 'hypothesis'
from public.people p cross join public.people c
where p.slug = 'judith_engela_wessels_1801' and c.slug = 'maria_van_brakel_1829'
on conflict (id) do update set notes = excluded.notes, source_status = excluded.source_status, updated_at = now();

insert into public.relationships
  (id, person1_id, person2_id, relationship_type, relationship_status, notes, source_status)
select uuid_generate_v5(uuid_ns_url(), 'genealogy:relationship:parent:petrus_jacobus_coetzee_1869:anna_coetzee'), p.id, c.id, 'parent', 'current', 'Candidate only. Compiled daughter born 11 June 1895 conflicts with project Anna Maria Coetzee born 18 August 1895.', 'hypothesis'
from public.people p cross join public.people c
where p.slug = 'petrus_jacobus_coetzee_1869' and c.slug = 'anna_coetzee'
on conflict (id) do update set notes = excluded.notes, source_status = excluded.source_status, updated_at = now();

insert into public.relationships
  (id, person1_id, person2_id, relationship_type, relationship_status, notes, source_status)
select uuid_generate_v5(uuid_ns_url(), 'genealogy:relationship:parent:hester_johanna_venter_1872:anna_coetzee'), p.id, c.id, 'parent', 'current', 'Candidate only. Compiled daughter born 11 June 1895 conflicts with project Anna Maria Coetzee born 18 August 1895.', 'hypothesis'
from public.people p cross join public.people c
where p.slug = 'hester_johanna_venter_1872' and c.slug = 'anna_coetzee'
on conflict (id) do update set notes = excluded.notes, source_status = excluded.source_status, updated_at = now();

insert into public.relationships
  (id, person1_id, person2_id, relationship_type, relationship_status, notes, source_status)
select uuid_generate_v5(uuid_ns_url(), 'genealogy:relationship:spouse:petrus_jacobus_coetzee_1869:hester_johanna_venter_1872'), p.id, s.id, 'spouse', 'historical', 'Compiled marriage 24 October 1887 at Steynsburg. This couple is part of the unresolved candidate cluster.', 'hypothesis'
from public.people p cross join public.people s
where p.slug = 'petrus_jacobus_coetzee_1869' and s.slug = 'hester_johanna_venter_1872'
on conflict (id) do update set notes = excluded.notes, source_status = excluded.source_status, updated_at = now();

insert into public.relationships
  (id, person1_id, person2_id, relationship_type, relationship_status, notes, source_status)
select uuid_generate_v5(uuid_ns_url(), 'genealogy:relationship:parent:gert_abraham_coetzee_1823:petrus_jacobus_coetzee_1869'), p.id, c.id, 'parent', 'current', 'Compiled candidate ancestry. Valid only if the disputed Anna Maria bridge is later proved.', 'hypothesis'
from public.people p cross join public.people c
where p.slug = 'gert_abraham_coetzee_1823' and c.slug = 'petrus_jacobus_coetzee_1869'
on conflict (id) do update set notes = excluded.notes, source_status = excluded.source_status, updated_at = now();

insert into public.relationships
  (id, person1_id, person2_id, relationship_type, relationship_status, notes, source_status)
select uuid_generate_v5(uuid_ns_url(), 'genealogy:relationship:parent:anna_maria_vanderwalt_1838:petrus_jacobus_coetzee_1869'), p.id, c.id, 'parent', 'current', 'Compiled candidate ancestry. Valid only if the disputed Anna Maria bridge is later proved.', 'hypothesis'
from public.people p cross join public.people c
where p.slug = 'anna_maria_vanderwalt_1838' and c.slug = 'petrus_jacobus_coetzee_1869'
on conflict (id) do update set notes = excluded.notes, source_status = excluded.source_status, updated_at = now();

update public.people
set narrative_summary = 'Family-identified mother of Sarie Wessels, born 18 August 1895 and died 8 November 1963. A compiled Steynsburg family contains an Anna Maria Elizabeth Coetzee born 11 June 1895 to Petrus Jacobus Coetzee and Hester Johanna Maria Venter. The date and name conflict means those parents are displayed only as a hypothesis until an original record bridges them.',
    updated_at = now()
where slug = 'anna_coetzee';

commit;
