update public.relationships r
set source_status = 'probable',
    notes = 'Ancestors family F25599 and WikiTree Wessels-883 identify Petrus Lafras Wessels as the father of Aderjan Wessels; original image not inspected.',
    updated_at = now()
where r.relationship_type = 'parent'
  and r.person1_id = (select id from public.people where slug = 'plw1826')
  and r.person2_id = (select id from public.people where slug = 'aderjan1860');
