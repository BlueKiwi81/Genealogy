import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const PROTECTED = new Set(['documented','strong']);
const ALLOWED = ['given_names','surname','birth_surname','current_surname','preferred_name','gender','birth_date','death_date','life_status','birth_place','death_place','residence_summary','final_rest_type','final_rest_place','occupation_summary','military_service_summary','historical_context','narrative_summary'];
const LABELS = {
  given_names:'Given name(s)', surname:'Display surname', birth_surname:'Birth / maiden surname', current_surname:'Married / current surname', preferred_name:'Known as', gender:'Gender', birth_date:'Birth date', death_date:'Death date', life_status:'Life status', birth_place:'Birth place', death_place:'Death place', residence_summary:'Where they lived', final_rest_type:'Final rest type', final_rest_place:'Final resting place', occupation_summary:'Occupation', military_service_summary:'Military service', historical_context:'Historical context', narrative_summary:'Family note'
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const textValue = (value) => value == null || value === '' ? 'Not recorded' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const personName = (p) => [p?.given_names,p?.birth_surname || p?.surname || p?.current_surname].filter(Boolean).join(' ') || 'Unnamed person';

function matchScore(relative, person) {
  let score = 0;
  const given = norm(relative?.given_names);
  const pgiven = norm(person?.given_names);
  if (given && pgiven === given) score += 6;
  else if (given.split(' ')[0] && given.split(' ')[0] === pgiven.split(' ')[0]) score += 3;
  const rs = [relative?.birth_surname,relative?.surname,relative?.current_surname].map(norm).filter(Boolean);
  const ps = [person?.birth_surname,person?.surname,person?.current_surname].map(norm).filter(Boolean);
  if (rs.some((s)=>ps.includes(s))) score += 4;
  if (relative?.birth_date && person?.birth_date && String(relative.birth_date).slice(0,10) === String(person.birth_date).slice(0,10)) score += 7;
  if (relative?.death_date && person?.death_date && String(relative.death_date).slice(0,10) === String(person.death_date).slice(0,10)) score += 3;
  return score;
}

function actualRole(rel,targetId,existingId) {
  if (rel.relationship_type === 'parent') {
    if (rel.person1_id === existingId && rel.person2_id === targetId) return 'parent';
    if (rel.person1_id === targetId && rel.person2_id === existingId) return 'child';
  }
  return rel.relationship_type;
}

async function loadContext(changeSetId) {
  const { data: change, error } = await supabase.from('tree_change_sets').select('id,target_person_id,change_type,payload,before_snapshot,base_updated_at,status').eq('id',changeSetId).maybeSingle();
  if (error) throw error;
  if (!change || change.status !== 'pending') throw new Error('This tree change is no longer pending.');
  const [targetRes,peopleRes,relRes] = await Promise.all([
    supabase.from('people').select('*').eq('id',change.target_person_id).maybeSingle(),
    supabase.from('people').select('*').eq('is_active',true).order('surname').order('given_names'),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,relationship_status,source_status,notes,is_active').eq('is_active',true),
  ]);
  if (targetRes.error) throw targetRes.error;
  if (peopleRes.error) throw peopleRes.error;
  if (relRes.error) throw relRes.error;
  return { change, target:targetRes.data, people:peopleRes.data||[], relationships:relRes.data||[] };
}

function fieldRows(proposed,current,mode='edit') {
  return ALLOWED.filter((key)=>Object.prototype.hasOwnProperty.call(proposed||{},key)).map((key)=>({
    key,
    proposed: proposed[key],
    current: current?.[key] ?? null,
    identical: same(proposed[key],current?.[key] ?? null),
    supplied: proposed[key] !== null && proposed[key] !== '' && !(typeof proposed[key] === 'object' && Object.keys(proposed[key]||{}).length===0),
  })).filter((row)=> mode === 'edit' ? !row.identical : row.supplied);
}

function renderFields(rows) {
  if (!rows.length) return '<p class="selective-empty">No person fields require changing.</p>';
  return `<div class="selective-field-list">${rows.map((row)=>{
    const defaultChecked = !row.identical && (row.current == null || row.current === '' || row.current === 'unknown');
    return `<label class="selective-field${row.identical?' same':''}"><input type="checkbox" data-selective-field="${esc(row.key)}" ${defaultChecked?'checked':''} ${row.identical?'disabled':''}/><span><strong>${esc(LABELS[row.key]||row.key)}</strong><small>Current: ${esc(textValue(row.current))}</small><b>Proposed: ${esc(textValue(row.proposed))}</b>${row.identical?'<em>Already matches the tree</em>':''}</span></label>`;
  }).join('')}</div>`;
}

function relationshipState(context,existingId) {
  const role = String(context.change.payload?.role || '');
  const pair = context.relationships.filter((rel)=>PROTECTED.has(rel.source_status) && ((rel.person1_id===context.target.id&&rel.person2_id===existingId)||(rel.person1_id===existingId&&rel.person2_id===context.target.id)));
  const roles = [...new Set(pair.map((rel)=>actualRole(rel,context.target.id,existingId)))];
  if (roles.includes(role)) return { kind:'already', roles, message:`The proposed ${role} relationship already exists with documented or strong support.` };
  if (roles.length) return { kind:'conflict', roles, message:`Do not apply this relationship here. The same two people are already recorded as ${roles.join(' / ')} with documented or strong evidence.` };
  return { kind:'available', roles:[], message:`Proposed relationship: ${role} of ${personName(context.target)}.` };
}

function existingOptions(context,selectedId) {
  return context.people.filter((p)=>p.id!==context.target.id).map((p)=>`<option value="${esc(p.id)}"${p.id===selectedId?' selected':''}>${esc(personName(p))}${p.birth_date?` - ${esc(String(p.birth_date).slice(0,10))}`:''}</option>`).join('');
}

async function renderSelective(changeSetId,review) {
  const body = document.getElementById('detailBody');
  body?.querySelector('.selective-review')?.remove();
  const box = body?.querySelector('.mobile-intelligent-review');
  if (!box) return;
  const context = await loadContext(changeSetId);
  if (!['edit_person','add_relative'].includes(context.change.change_type)) return;

  const panel = document.createElement('section');
  panel.className = 'selective-review';
  box.insertAdjacentElement('afterend',panel);

  if (context.change.change_type === 'edit_person') {
    const proposed = context.change.payload?.after || {};
    const current = context.target || context.change.before_snapshot?.person || {};
    const rows = fieldRows(proposed,current,'edit');
    panel.innerHTML = `<div class="selective-head"><strong>Choose what to keep</strong><span>Field-by-field approval</span></div><p>Tick only the proposed changes you want to accept. Unticked fields remain exactly as they are in the family tree.</p>${renderFields(rows)}<label class="selective-note">Editor note (optional)<textarea rows="2" data-selective-note placeholder="Why are you keeping only part of this submission?"></textarea></label><button type="button" class="button primary selective-apply">Apply selected changes</button><p class="selective-message" aria-live="polite"></p>`;
  } else {
    const proposed = context.change.payload?.relative || {};
    const ranked = context.people.filter((p)=>p.id!==context.target.id).map((p)=>({p,score:matchScore(proposed,p)})).sort((a,b)=>b.score-a.score);
    const likely = ranked[0]?.score >= 8 ? ranked[0].p : null;
    panel.innerHTML = `<div class="selective-head"><strong>Keep useful details without creating a duplicate</strong><span>Existing-person merge</span></div><p>Choose the existing person this submission describes. You can approve their useful details separately from the proposed relationship.</p><label class="selective-existing">Existing person<select data-selective-existing><option value="">Choose existing person...</option>${existingOptions(context,likely?.id||'')}</select></label><div data-selective-existing-details></div><label class="selective-note">Editor note (optional)<textarea rows="2" data-selective-note placeholder="For example: Keep Elza's biographical information; reject the mistaken parent relationship."></textarea></label><button type="button" class="button primary selective-apply">Apply selected changes</button><p class="selective-message" aria-live="polite"></p>`;

    const select = panel.querySelector('[data-selective-existing]');
    const details = panel.querySelector('[data-selective-existing-details]');
    const refreshExisting = () => {
      const existing = context.people.find((p)=>p.id===select.value);
      if (!existing) { details.innerHTML='<p class="selective-empty">Choose the existing person first.</p>'; return; }
      const rows = fieldRows(proposed,existing,'relative');
      const relState = relationshipState(context,existing.id);
      const disabled = relState.kind !== 'available';
      details.innerHTML = `${renderFields(rows)}<label class="selective-relationship ${relState.kind}"><input type="checkbox" data-selective-relationship ${disabled?'disabled':''}/><span><strong>Relationship</strong><b>${esc(relState.message)}</b>${relState.kind==='conflict'?'<em>This conflicts with protected evidence and cannot be approved as part of this merge.</em>':relState.kind==='already'?'<em>No new relationship is needed.</em>':''}</span></label>`;
    };
    select.addEventListener('change',refreshExisting);
    refreshExisting();
  }

  panel.querySelector('.selective-apply').addEventListener('click',async()=>{
    const button = panel.querySelector('.selective-apply');
    const message = panel.querySelector('.selective-message');
    const selectedFields = [...panel.querySelectorAll('[data-selective-field]:checked')].map((input)=>input.dataset.selectiveField);
    const existingId = panel.querySelector('[data-selective-existing]')?.value || null;
    const applyRelationship = Boolean(panel.querySelector('[data-selective-relationship]:checked'));
    if (!selectedFields.length && !applyRelationship) { message.textContent='Tick at least one change to keep, or reject the whole submission.'; message.className='selective-message error'; return; }
    if (context.change.change_type==='add_relative' && !existingId) { message.textContent='Choose the existing person before applying selected details.'; message.className='selective-message error'; return; }
    button.disabled=true; button.textContent='Applying selected changes...'; message.textContent='';
    try {
      const { data,error } = await supabase.rpc('approve_tree_change_selection',{
        p_change_set_id:changeSetId,
        p_selected_fields:selectedFields,
        p_existing_person_id:existingId,
        p_apply_relationship:applyRelationship,
        p_note:panel.querySelector('[data-selective-note]')?.value.trim() || null,
      });
      if (error) throw error;
      message.textContent=`Applied ${data?.selected_fields?.length||selectedFields.length} selected field(s). Unselected proposal elements were not changed.`;
      message.className='selective-message success';
      window.setTimeout(()=>{ document.getElementById('closeDetail')?.click(); document.getElementById('refreshButton')?.click(); },500);
    } catch (error) {
      message.textContent=error?.message || 'Unable to apply the selected changes.';
      message.className='selective-message error';
      button.disabled=false; button.textContent='Apply selected changes';
    }
  });
}

function installStyles(){
  if(document.getElementById('selectiveTreeApprovalStyles')) return;
  const style=document.createElement('style');
  style.id='selectiveTreeApprovalStyles';
  style.textContent=`.selective-review{margin:12px 0;padding:13px;border:1px solid #c9b79f;border-radius:13px;background:#fffdf8;font:.82rem/1.42 system-ui,sans-serif}.selective-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.selective-head span{font-size:.67rem;text-transform:uppercase;color:#7a6c5f}.selective-review>p{margin:7px 0 10px}.selective-field-list{display:grid;gap:7px}.selective-field{display:grid!important;grid-template-columns:auto 1fr!important;gap:9px!important;align-items:start;padding:8px;border:1px solid #e0d5c5;border-radius:9px;background:white}.selective-field input,.selective-relationship input{width:auto!important;margin-top:3px}.selective-field span,.selective-relationship span{display:grid;gap:2px}.selective-field strong,.selective-relationship strong{font-size:.68rem;text-transform:uppercase}.selective-field small{color:#76695d}.selective-field b,.selective-relationship b{font-weight:650}.selective-field em,.selective-relationship em{font-size:.72rem;color:#76695d}.selective-field.same{opacity:.65}.selective-existing,.selective-note{display:grid!important;gap:5px!important;margin:8px 0;font-weight:700}.selective-existing select,.selective-note textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #d7c9b6;border-radius:8px;background:white}.selective-relationship{display:grid!important;grid-template-columns:auto 1fr!important;gap:9px!important;margin-top:9px;padding:9px;border-radius:9px;background:#f3f8ef;border:1px solid #bed0b5}.selective-relationship.conflict{background:#fff0ee;border-color:#d9a7a0}.selective-relationship.already{background:#f3f3f1;border-color:#ccc}.selective-empty{font-size:.76rem;color:#76695d}.selective-apply{width:100%;margin-top:9px}.selective-message{font-size:.76rem;margin:7px 0 0}.selective-message.error{color:#9a453e}.selective-message.success{color:#3f6c4b}`;
  document.head.appendChild(style);
}

installStyles();
document.addEventListener('genealogy:tree-intelligent-review-rendered',(event)=>{
  const detail=event.detail||{};
  if(!detail.changeSetId) return;
  window.setTimeout(()=>renderSelective(detail.changeSetId,detail.review).catch((error)=>{
    const body=document.getElementById('detailBody');
    body?.querySelector('.selective-review')?.remove();
    const box=body?.querySelector('.mobile-intelligent-review');
    if(box) box.insertAdjacentHTML('afterend',`<section class="selective-review"><strong>Selective review could not load</strong><p>${esc(error?.message||'Unknown error')}</p></section>`);
  }),0);
});
