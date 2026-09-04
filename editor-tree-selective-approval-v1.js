import { supabase } from './supabase-client-v1.js';

const PROTECTED = new Set(['documented','strong']);
const FIELDS = ['given_names','surname','birth_surname','current_surname','preferred_name','gender','birth_date','death_date','life_status','birth_place','death_place','residence_summary','final_rest_type','final_rest_place','occupation_summary','military_service_summary','historical_context','narrative_summary'];
const LABELS = {given_names:'Given name(s)',surname:'Display surname',birth_surname:'Birth / maiden surname',current_surname:'Married / current surname',preferred_name:'Known as',gender:'Gender',birth_date:'Birth date',death_date:'Death date',life_status:'Life status',birth_place:'Birth place',death_place:'Death place',residence_summary:'Where they lived',final_rest_type:'Final rest type',final_rest_place:'Final resting place',occupation_summary:'Occupation',military_service_summary:'Military service',historical_context:'Historical context',narrative_summary:'Family note'};
const inFlight = new Set();
let scanTimer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const valueText = (value) => value == null || value === '' ? 'Not recorded' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const personName = (person) => [person?.given_names,person?.birth_surname || person?.surname || person?.current_surname].filter(Boolean).join(' ') || 'Unnamed person';

function setMessage(text='',type='') {
  const node=document.getElementById('treeChangeReviewMessage');
  if(!node) return;
  node.textContent=text;
  node.className=`message${type?` ${type}`:''}`;
}

function installStyles(){
  if(document.getElementById('treeSelectiveApprovalStyles')) return;
  const style=document.createElement('style');
  style.id='treeSelectiveApprovalStyles';
  style.textContent=`.tree-selective-review{margin:10px 0;padding:11px;border:1px solid rgba(91,72,55,.24);border-radius:11px;background:#fffdf8}.tree-selective-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.tree-selective-head strong{font-size:11px;color:#3f3329}.tree-selective-head span{font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:#75685d}.tree-selective-review>p{font-size:9.8px;line-height:1.45;color:#5e5146}.tree-selective-list{display:grid;gap:6px}.tree-selective-field,.tree-selective-relationship{display:grid!important;grid-template-columns:auto 1fr!important;gap:8px!important;align-items:start;padding:8px;border:1px solid rgba(91,72,55,.16);border-radius:9px;background:#fff}.tree-selective-field input,.tree-selective-relationship input{width:auto!important;margin-top:2px}.tree-selective-field span,.tree-selective-relationship span{display:grid;gap:2px}.tree-selective-field strong,.tree-selective-relationship strong{font-size:8.8px;text-transform:uppercase;color:#645548}.tree-selective-field small{font-size:9px;color:#75685d}.tree-selective-field b,.tree-selective-relationship b{font-size:9.6px;font-weight:650;color:#44392f}.tree-selective-field em,.tree-selective-relationship em{font-size:8.7px;color:#75685d}.tree-selective-field.same{opacity:.58}.tree-selective-existing,.tree-selective-note{display:grid!important;gap:4px!important;margin:8px 0;font-size:9.5px!important;font-weight:700}.tree-selective-existing select,.tree-selective-note textarea{width:100%;box-sizing:border-box;border:1px solid rgba(91,72,55,.2);border-radius:8px;padding:7px;background:#fff}.tree-selective-relationship{margin-top:7px;background:#f4f9f1;border-color:rgba(72,112,76,.25)}.tree-selective-relationship.conflict{background:#fff3f0;border-color:rgba(140,65,65,.32)}.tree-selective-relationship.already{background:#f4f3f0}.tree-selective-apply{margin-top:8px}.tree-selective-status{font-size:9px!important;margin:6px 0 0!important}.tree-selective-status.error{color:#8a3e36}.tree-selective-status.success{color:#466648}`;
  document.head.appendChild(style);
}

async function contextFor(changeSetId){
  const {data:change,error}=await supabase.from('tree_change_sets').select('id,target_person_id,change_type,payload,before_snapshot,status').eq('id',changeSetId).maybeSingle();
  if(error) throw error;
  if(!change || change.status!=='pending') return null;
  if(!['edit_person','add_relative'].includes(change.change_type)) return null;
  const [targetRes,peopleRes,relRes,reviewRes]=await Promise.all([
    supabase.from('people').select('*').eq('id',change.target_person_id).maybeSingle(),
    supabase.from('people').select('*').eq('is_active',true).order('surname').order('given_names'),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,source_status,is_active').eq('is_active',true),
    supabase.from('tree_change_ai_reviews').select('id,status,decision').eq('change_set_id',changeSetId).maybeSingle(),
  ]);
  if(targetRes.error) throw targetRes.error;
  if(peopleRes.error) throw peopleRes.error;
  if(relRes.error) throw relRes.error;
  if(reviewRes.error) throw reviewRes.error;
  if(!reviewRes.data) return null;
  return {change,target:targetRes.data,people:peopleRes.data||[],relationships:relRes.data||[]};
}

function score(relative,person){
  let points=0;
  const rg=norm(relative?.given_names),pg=norm(person?.given_names);
  if(rg&&rg===pg) points+=6; else if(rg.split(' ')[0]&&rg.split(' ')[0]===pg.split(' ')[0]) points+=3;
  const rs=[relative?.birth_surname,relative?.surname,relative?.current_surname].map(norm).filter(Boolean);
  const ps=[person?.birth_surname,person?.surname,person?.current_surname].map(norm).filter(Boolean);
  if(rs.some((s)=>ps.includes(s))) points+=4;
  if(relative?.birth_date&&person?.birth_date&&String(relative.birth_date).slice(0,10)===String(person.birth_date).slice(0,10)) points+=7;
  if(relative?.death_date&&person?.death_date&&String(relative.death_date).slice(0,10)===String(person.death_date).slice(0,10)) points+=3;
  return points;
}

function rows(proposed,current,editMode){
  return FIELDS.filter((key)=>Object.prototype.hasOwnProperty.call(proposed||{},key)).map((key)=>({key,proposed:proposed[key],current:current?.[key]??null,identical:same(proposed[key],current?.[key]??null),supplied:proposed[key]!==null&&proposed[key]!==''&&!(typeof proposed[key]==='object'&&Object.keys(proposed[key]||{}).length===0)})).filter((row)=>editMode?!row.identical:row.supplied);
}

function fieldsHtml(items){
  if(!items.length) return '<p>No person fields need changing.</p>';
  return `<div class="tree-selective-list">${items.map((row)=>{const checked=!row.identical&&(row.current==null||row.current===''||row.current==='unknown');return `<label class="tree-selective-field${row.identical?' same':''}"><input type="checkbox" data-tree-select-field="${esc(row.key)}" ${checked?'checked':''} ${row.identical?'disabled':''}><span><strong>${esc(LABELS[row.key]||row.key)}</strong><small>Current: ${esc(valueText(row.current))}</small><b>Proposed: ${esc(valueText(row.proposed))}</b>${row.identical?'<em>Already matches the tree</em>':''}</span></label>`;}).join('')}</div>`;
}

function effectiveRole(rel,targetId,otherId){
  if(rel.relationship_type==='parent'){
    if(rel.person1_id===otherId&&rel.person2_id===targetId) return 'parent';
    if(rel.person1_id===targetId&&rel.person2_id===otherId) return 'child';
  }
  return rel.relationship_type;
}

function relationshipState(context,existingId){
  const proposed=String(context.change.payload?.role||'');
  const pair=context.relationships.filter((rel)=>PROTECTED.has(rel.source_status)&&((rel.person1_id===context.target.id&&rel.person2_id===existingId)||(rel.person1_id===existingId&&rel.person2_id===context.target.id)));
  const roles=[...new Set(pair.map((rel)=>effectiveRole(rel,context.target.id,existingId)))];
  if(roles.includes(proposed)) return {kind:'already',message:`The proposed ${proposed} relationship already exists with protected evidence.`};
  if(roles.length) return {kind:'conflict',message:`Relationship blocked here: these people are already recorded as ${roles.join(' / ')} with documented or strong evidence.`};
  return {kind:'available',message:`Proposed relationship: ${proposed} of ${personName(context.target)}.`};
}

function options(context,selectedId){
  return context.people.filter((p)=>p.id!==context.target.id).map((p)=>`<option value="${esc(p.id)}"${p.id===selectedId?' selected':''}>${esc(personName(p))}${p.birth_date?` - ${esc(String(p.birth_date).slice(0,10))}`:''}</option>`).join('');
}

function panelHost(card){
  card.querySelector('.tree-selective-review')?.remove();
  const panel=document.createElement('section');
  panel.className='tree-selective-review';
  const review=card.querySelector('.tree-ai-review');
  review?.insertAdjacentElement('afterend',panel);
  return panel;
}

function bindApply(panel,context){
  panel.querySelector('[data-tree-select-apply]')?.addEventListener('click',async(event)=>{
    const button=event.currentTarget;
    const status=panel.querySelector('.tree-selective-status');
    const selectedFields=[...panel.querySelectorAll('[data-tree-select-field]:checked')].map((input)=>input.dataset.treeSelectField);
    const existingId=panel.querySelector('[data-tree-select-existing]')?.value||null;
    const relationship=Boolean(panel.querySelector('[data-tree-select-relationship]:checked'));
    if(!selectedFields.length&&!relationship){status.textContent='Tick at least one change to keep, or reject the whole proposal.';status.className='tree-selective-status error';return;}
    if(context.change.change_type==='add_relative'&&!existingId){status.textContent='Choose the existing person first.';status.className='tree-selective-status error';return;}
    button.disabled=true;button.textContent='Applying selected changes...';
    try{
      const {data,error}=await supabase.rpc('approve_tree_change_selection',{p_change_set_id:context.change.id,p_selected_fields:selectedFields,p_existing_person_id:existingId,p_apply_relationship:relationship,p_note:panel.querySelector('[data-tree-select-note]')?.value.trim()||null});
      if(error) throw error;
      status.textContent=`Applied ${data?.selected_fields?.length||selectedFields.length} selected field(s). Unticked proposal elements were not changed.`;status.className='tree-selective-status success';
      document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
      document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
    }catch(error){status.textContent=error?.message||'Unable to apply selected changes.';status.className='tree-selective-status error';button.disabled=false;button.textContent='Apply selected changes';}
  });
}

function renderPanel(card,context){
  const panel=panelHost(card);
  if(context.change.change_type==='edit_person'){
    const proposed=context.change.payload?.after||{};
    panel.innerHTML=`<div class="tree-selective-head"><strong>Choose what to keep</strong><span>Field-by-field approval</span></div><p>Tick only the proposed fields you want to accept. Unticked fields remain unchanged.</p>${fieldsHtml(rows(proposed,context.target||context.change.before_snapshot?.person||{},true))}<label class="tree-selective-note">Editor note (optional)<textarea rows="2" data-tree-select-note></textarea></label><button type="button" class="button primary tree-selective-apply" data-tree-select-apply>Apply selected changes</button><p class="tree-selective-status"></p>`;
  }else{
    const proposed=context.change.payload?.relative||{};
    const ranked=context.people.filter((p)=>p.id!==context.target.id).map((p)=>({p,score:score(proposed,p)})).sort((a,b)=>b.score-a.score);
    const likely=ranked[0]?.score>=8?ranked[0].p:null;
    panel.innerHTML=`<div class="tree-selective-head"><strong>Keep useful details without creating a duplicate</strong><span>Existing-person merge</span></div><p>Choose the existing person, then tick the submitted details worth keeping. The relationship is reviewed separately.</p><label class="tree-selective-existing">Existing person<select data-tree-select-existing><option value="">Choose existing person...</option>${options(context,likely?.id||'')}</select></label><div data-tree-select-existing-details></div><label class="tree-selective-note">Editor note (optional)<textarea rows="2" data-tree-select-note></textarea></label><button type="button" class="button primary tree-selective-apply" data-tree-select-apply>Apply selected changes</button><p class="tree-selective-status"></p>`;
    const select=panel.querySelector('[data-tree-select-existing]');
    const details=panel.querySelector('[data-tree-select-existing-details]');
    const refresh=()=>{const existing=context.people.find((p)=>p.id===select.value);if(!existing){details.innerHTML='<p>Choose an existing person first.</p>';return;}const rel=relationshipState(context,existing.id);details.innerHTML=`${fieldsHtml(rows(proposed,existing,false))}<label class="tree-selective-relationship ${rel.kind}"><input type="checkbox" data-tree-select-relationship ${rel.kind!=='available'?'disabled':''}><span><strong>Relationship</strong><b>${esc(rel.message)}</b>${rel.kind==='conflict'?'<em>This relationship conflicts with protected evidence and cannot be approved in this merge.</em>':rel.kind==='already'?'<em>No new relationship is needed.</em>':''}</span></label>`;};
    select.addEventListener('change',refresh);refresh();
  }
  card.querySelector('.tree-ai-resolution-assistant')?.remove();
  bindApply(panel,context);
}

async function scanCard(card){
  const id=card?.dataset?.treeChangeId;
  const review=card?.querySelector('.tree-ai-review[class*="review-"]');
  if(!id||!review||inFlight.has(id)||card.querySelector('.tree-selective-review')) return;
  inFlight.add(id);
  try{const context=await contextFor(id);if(context) renderPanel(card,context);}finally{inFlight.delete(id);}
}

function scanAll(){document.querySelectorAll('[data-tree-change-id]').forEach((card)=>void scanCard(card));document.querySelectorAll('[data-tree-change-id] .tree-selective-review').forEach((panel)=>panel.closest('[data-tree-change-id]')?.querySelector('.tree-ai-resolution-assistant')?.remove());}
function schedule(){if(scanTimer!==null) clearTimeout(scanTimer);scanTimer=setTimeout(()=>{scanTimer=null;scanAll();},80);}

installStyles();
scanAll();
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
document.addEventListener('genealogy:tree-suggestions-updated',schedule);
