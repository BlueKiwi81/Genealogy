create or replace function private.evidence_status_rank(status text)
returns integer language sql immutable set search_path = '' as $$
  select case status when 'unresolved' then 0 when 'hypothesis' then 1 when 'family_supplied' then 2 when 'probable' then 3 when 'strong' then 4 when 'documented' then 5 else 0 end;
$$;

create or replace function private.recommended_status_for_evidence(p_evidence_type text, p_strength text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_strength = 'direct' and p_evidence_type in ('birth_certificate','baptism_record','marriage_record','death_notice','estate_record','identity_document','church_register','civil_register') then return 'documented';
  elsif p_strength = 'direct' then return 'strong';
  elsif p_strength = 'strong' then return 'strong';
  elsif p_strength = 'indirect' then return 'probable';
  else return 'family_supplied';
  end if;
end;
$$;

create or replace function private.queue_claim_review_suggestion(p_claim_id uuid, p_evidence_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_claim public.genealogy_claims%rowtype;
  v_evidence public.evidence_items%rowtype;
  v_link public.claim_evidence%rowtype;
  v_suggested text;
  v_rationale text;
begin
  select * into v_claim from public.genealogy_claims where id = p_claim_id;
  select * into v_evidence from public.evidence_items where id = p_evidence_id;
  select * into v_link from public.claim_evidence where claim_id = p_claim_id and evidence_id = p_evidence_id;
  if v_claim.id is null or v_evidence.id is null or v_link.claim_id is null then return; end if;
  if v_evidence.review_status <> 'approved' or v_link.support_type <> 'supports' then return; end if;
  v_suggested := private.recommended_status_for_evidence(v_evidence.evidence_type, v_link.evidence_strength);
  if private.evidence_status_rank(v_suggested) <= private.evidence_status_rank(v_claim.evidence_status) then return; end if;
  v_rationale := format('Approved %s evidence linked as %s support may justify upgrading "%s" from %s to %s. Review the document and the exact claim before accepting.', replace(v_evidence.evidence_type, '_', ' '), v_link.evidence_strength, v_claim.claim_label, v_claim.evidence_status, v_suggested);
  if not exists (select 1 from public.claim_review_suggestions where claim_id = p_claim_id and evidence_id = p_evidence_id and status = 'pending' and suggested_status = v_suggested) then
    insert into public.claim_review_suggestions (claim_id, evidence_id, current_status, suggested_status, rationale)
    values (p_claim_id, p_evidence_id, v_claim.evidence_status, v_suggested, v_rationale);
  end if;
end;
$$;

create or replace function private.on_claim_evidence_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.queue_claim_review_suggestion(new.claim_id, new.evidence_id);
  return new;
end;
$$;

drop trigger if exists trg_claim_evidence_recommendation on public.claim_evidence;
create trigger trg_claim_evidence_recommendation after insert or update of support_type, evidence_strength on public.claim_evidence for each row execute function private.on_claim_evidence_change();

create or replace function private.on_evidence_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.review_status = 'approved' and old.review_status is distinct from 'approved' then
    for r in select claim_id from public.claim_evidence where evidence_id = new.id loop
      perform private.queue_claim_review_suggestion(r.claim_id, new.id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evidence_approval_recommendation on public.evidence_items;
create trigger trg_evidence_approval_recommendation after update of review_status on public.evidence_items for each row execute function private.on_evidence_approval();
