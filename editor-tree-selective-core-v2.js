import { supabase } from './supabase-client-v1.js';

const FIELDS = ['given_names','surname','birth_surname','current_surname','preferred_name','gender','birth_date','death_date','life_status','birth_place','death_place','residence_summary','final_rest_type','final_rest_place','occupation_summary','military_service_summary','historical_context','narrative_summary'];
const LABELS = {given_names:'Given name(s)',surname:'Surname',birth_surname:'Birth / maiden surname',current_surname:'Current surname',preferred_name:'Known as',gender:'Gender',birth_date:'Birth date',death_date:'Death date',life_status:'Life status',birth_place:'Birth place',death_place:'Death place',residence_summary:'Where they lived',final_rest_type:'Final rest type',final_rest_place:'Final resting place',occupation_summary:'Occupation',military_service_summary:'Military service',historical_context:'Historical context',narrative_summary:'Family note'};
const PROTECTED = new Set(['documented','strong']);
const processed = new WeakSet();

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = (v) => v == null || v === '' ? 'Not recorded' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const personName = (p) => [p?.given_names, p?.birth_surname || p?.surname || p?.current_surname].filter(Boolean).join(' ') || 'Unnamed person';

function installStyles(){
  if(document.getElementById('selectiveCoreV2Styles')) return;
  const s=document.createElement('style');
  s.id='selectiveCoreV2Styles';
  s.textContent=`
    .selective-core-v2{margin:12px 0;padding:12px;border:2px solid rgba(91,72,55,.22);border-radius:12px;background:#fffdf8}
    .selective-core-v2 h4{margin:0 0 4px;font-size:13px}.selective-core-v2 p{margin:4px 0 9px;font-size:10px;line-height:1.45}
    .selective-core-v2-badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#eef3ea;color:#4d704f;font-size:9px;font-weight:700;margin-bottom:7px}
    .selective-core-v2-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:9px;margin:7px 0;border:1px solid rgba(91,72,55,.16);border-radius:9px;background:#fff}
    .selective-core-v2-row.blocked{background:#fff3f0;border-color:rgba(140,65,65,.34)}
    .selective-core-v2-copy{display:grid;gap:2px;min-width:0}.selective-core-v2-copy strong{font-size:9px;text-transform:uppercase;color:#645548}.selective-core-v2-copy small,.selective-core-v2-copy b{font-size:9.5px;white-space:pre-wrap}
    .selective-core-v2-controls{display:flex;gap:5px}.selective-core-v2-controls label{display:inline-flex!important;align-items:center!important;gap:4px!important;padding:5px 7px;border:1px solid rgba(91,72,55,.2);border-radius:999px;font-size:9px!important;font-weight:700!important}.selective-core-v2-controls input{width:auto!important;margin:0!important}
    .selective-core-v2 select,.selective-core-v2 textarea{width:100%;box-sizing:border-box;border:1px solid rgba(91,72,55,.2);border-radius:8px;padding:7px;background:#fff}.selective-core-v2 label.selective-block{display:grid!important;gap:4px!important;margin:8px 0;font-size:9.5px!important;font-weight:700}
    .selective-core-v2-status{font-size:9.5px!important}.selective-core-v2-status.error{color:#8a3e36}.selective-core-v2-status.success{color:#466648}
  `;
  document.head.appendChild(s);
}

function mount(card){
  let box=card.querySelector('.selective-core-v2');
  if(box) return box;
  box=document.createElement('section');
  box.className='selective-core-v2';
  box.innerHTML='<span class="selective-core-v2-badge">Field review loading…</span><p>Checking the saved Intelligent Review and canonical record.</p>';
  const note=card.querySelector('.tree-change-note');
  if(note) note.insertAdjacentElement('beforebegin',box); else card.appendChild(box);
  const approve=card.querySelector('[data-approve-tree-change]');
  if(approve){ approve.disabled=true; approve.textContent='Use field decisions below'; }
  return box;
}

function score(relative,p){
  let n=0;
  const rg=norm(relative?.given_names), pg=norm(p?.given_names);
  if(rg&&rg===pg)n+=8; else if(rg&&pg&&rg.split(' ')[0]===pg.split(' ')[0])n+=3;
  const rs=[relative?.birth_surname,relative?.surname,relative?.current_surname].map(norm).filter(Boolean);
  const ps=[p?.birth_surname,p?.surname,p?.current_surname].map(norm).filter(Boolean);
  if(rs.some(x=>ps.includes(x)))n+=5;
  if(relative?.birth_date&&p?.birth_date&&String(relative.birth_date).slice(0,10)===String(p.birth_date).slice(0,10))n+=8;
  return n;
}

function radioRow(key,current,proposed,accept=false){
  const name=`sc2-${key}-${Math.random().toString(36).slice(2)}`;
  return `<div class="selective-core-v2-row" data-sc2-field="${esc(key)}"><div class="selective-core-v2-copy"><strong>${esc(LABELS[key]||key)}</strong><small>Current: ${esc(text(current))}</small><b>Proposed: ${esc(text(proposed))}</b></div><div class="selective-core-v2-controls"><label><input type="radio" name="${name}" value="accept" ${accept?'checked':''}>Accept</label><label><input type="radio" name="${name}" value="reject" ${accept?'':'checked'}>Reject</label></div></div>`;
}

function effectiveRole(rel,targetId,otherId){
  if(rel.relationship_type==='parent'){
    if(rel.person1_id===otherId&&rel.person2_id===targetId)return 'parent';
    if(rel.person1_id===targetId&&rel.person2_id===otherId)return 'child';
  }
  return rel.relationship_type;
}

function relationshipInfo(change,target,existing,rels){
  const proposed=String(change.payload?.role||'relative');
  const pair=rels.filter(r=>PROTECTED.has(r.source_status)&&((r.person1_id===target.id&&r.person2_id===existing.id)||(r.person1_id===existing.id&&r.person2_id===target.id)));
  const roles=[...new Set(pair.map(r=>effectiveRole(r,target.id,existing.id)))];
  if(roles.includes(proposed)) return {blocked:true,msg:`The ${proposed} relationship already exists with protected evidence.`};
  if(roles.length) return {blocked:true,msg:`Blocked: these people are already recorded as ${roles.join(' / ')} with documented or strong evidence.`};
  return {blocked:false,msg:`Proposed relationship: ${proposed} of ${personName(target)}.`};
}

async function loadContext(id){
  const {data:change,error:e1}=await supabase.from('tree_change_sets').select('id,target_person_id,change_type,payload,before_snapshot,status').eq('id',id).maybeSingle();
  if(e1) throw e1;
  if(!change||change.status!=='pending'||!['edit_person','add_relative'].includes(change.change_type)) return null;
  const {data:reviews,error:e2}=await supabase.from('tree_change_ai_reviews').select('decision,confidence,summary,rationale,warnings,created_at').eq('change_set_id',id).order('created_at',{ascending:false}).limit(1);
  if(e2) throw e2;
  const [targetR,peopleR,relsR]=await Promise.all([
    supabase.from('people').select('*').eq('id',change.target_person_id).maybeSingle(),
    supabase.from('people').select('*').eq('is_active',true),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,source_status,is_active').eq('is_active',true)
  ]);
  if(targetR.error)throw targetR.error;
  if(peopleR.error)throw peopleR.error;
  if(relsR.error)throw relsR.error;
  return {change,review:reviews?.[0]||null,target:targetR.data,people:peopleR.data||[],rels:relsR.data||[]};
}

function bindApply(box,ctx){
  box.querySelector('[data-sc2-apply]')?.addEventListener('click',async(e)=>{
    const btn=e.currentTarget, status=box.querySelector('.selective-core-v2-status');
    const fields=[...box.querySelectorAll('[data-sc2-field]')].filter(r=>r.querySelector('input[value="accept"]')?.checked).map(r=>r.dataset.sc2Field);
    const rel=Boolean(box.querySelector('[data-sc2-rel] input[value="accept"]:checked'));
    const existing=box.querySelector('[data-sc2-existing]')?.value||null;
    if(ctx.change.change_type==='add_relative'&&!existing){status.textContent='Choose the existing person first.';status.className='selective-core-v2-status error';return;}
    if(!fields.length&&!rel){status.textContent='Nothing is marked Accept. Use “Reject and restore” to reject the whole proposal.';status.className='selective-core-v2-status error';return;}
    btn.disabled=true; btn.textContent='Applying…';
    try{
      const {data,error}=await supabase.rpc('approve_tree_change_selection',{p_change_set_id:ctx.change.id,p_selected_fields:fields,p_existing_person_id:existing,p_apply_relationship:rel,p_note:box.querySelector('[data-sc2-note]')?.value.trim()||null});
      if(error) throw error;
      status.textContent=`Applied ${data?.selected_fields?.length??fields.length} accepted field(s). Rejected items were left unchanged.`;
      status.className='selective-core-v2-status success';
      document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
    }catch(error){
      status.textContent=error?.message||'Unable to apply decisions.';
      status.className='selective-core-v2-status error';
      btn.disabled=false; btn.textContent='Apply accepted / rejected decisions';
    }
  });
}

function renderEdit(box,ctx){
  const proposed=ctx.change.payload?.after||{};
  const current=ctx.target||ctx.change.before_snapshot?.person||{};
  const rows=FIELDS.filter(k=>Object.prototype.hasOwnProperty.call(proposed,k)&&!same(proposed[k],current[k]??null));
  box.innerHTML=`<span class="selective-core-v2-badge">Field-by-field review ready</span><h4>Accept or reject each proposed change</h4><p>Saved Intelligent Review: ${esc(String(ctx.review?.decision||'not run').replaceAll('_',' '))}${Number(ctx.review?.confidence)?` (${Math.round(Number(ctx.review.confidence)*100)}%)`:''}</p>${ctx.review?rows.map(k=>radioRow(k,current[k]??null,proposed[k],current[k]==null||current[k]==='')).join(''):'<p>Run Intelligent Review for this proposal first.</p>'}${ctx.review?`<label class="selective-block">Editor note<textarea rows="2" data-sc2-note></textarea></label><button type="button" class="button primary" data-sc2-apply>Apply accepted / rejected decisions</button>`:''}<p class="selective-core-v2-status"></p>`;
  if(ctx.review) bindApply(box,ctx);
}

function renderRelative(box,ctx){
  const proposed=ctx.change.payload?.relative||{};
  const ranked=ctx.people.filter(p=>p.id!==ctx.target.id).map(p=>({p,s:score(proposed,p)})).sort((a,b)=>b.s-a.s);
  const likely=ranked[0]?.s>=8?ranked[0].p:null;
  const opts=ctx.people.filter(p=>p.id!==ctx.target.id).map(p=>`<option value="${esc(p.id)}" ${p.id===likely?.id?'selected':''}>${esc(personName(p))}${p.birth_date?` — ${esc(String(p.birth_date).slice(0,10))}`:''}</option>`).join('');
  box.innerHTML=`<span class="selective-core-v2-badge">Field-by-field review ready</span><h4>Accept or reject each proposed change</h4><p>Saved Intelligent Review: ${esc(String(ctx.review?.decision||'not run').replaceAll('_',' '))}${Number(ctx.review?.confidence)?` (${Math.round(Number(ctx.review.confidence)*100)}%)`:''}</p>${ctx.review?`<label class="selective-block">Existing person<select data-sc2-existing><option value="">Choose existing person…</option>${opts}</select></label><div data-sc2-rows></div><label class="selective-block">Editor note<textarea rows="2" data-sc2-note></textarea></label><button type="button" class="button primary" data-sc2-apply>Apply accepted / rejected decisions</button>`:'<p>Run Intelligent Review for this proposal first.</p>'}<p class="selective-core-v2-status"></p>`;
  if(!ctx.review) return;
  const select=box.querySelector('[data-sc2-existing]'), host=box.querySelector('[data-sc2-rows]');
  const refresh=()=>{
    const existing=ctx.people.find(p=>p.id===select.value);
    if(!existing){host.innerHTML='<p>Choose the existing person first.</p>';return;}
    const keys=FIELDS.filter(k=>Object.prototype.hasOwnProperty.call(proposed,k)&&proposed[k]!==null&&proposed[k]!==''&&!same(proposed[k],existing[k]??null));
    const ri=relationshipInfo(ctx.change,ctx.target,existing,ctx.rels);
    const name=`sc2-rel-${Math.random().toString(36).slice(2)}`;
    host.innerHTML=`${keys.map(k=>radioRow(k,existing[k]??null,proposed[k],existing[k]==null||existing[k]==='')).join('')||'<p>No differing person fields remain.</p>'}<div class="selective-core-v2-row ${ri.blocked?'blocked':''}" data-sc2-rel><div class="selective-core-v2-copy"><strong>Relationship</strong><b>${esc(ri.msg)}</b></div><div class="selective-core-v2-controls"><label><input type="radio" name="${name}" value="accept" ${ri.blocked?'disabled':''}>Accept</label><label><input type="radio" name="${name}" value="reject" checked>Reject</label></div></div>`;
  };
  select.addEventListener('change',refresh);
  refresh();
  bindApply(box,ctx);
}

async function ensure(card){
  if(!card||processed.has(card)) return;
  processed.add(card);
  const id=card.dataset.treeChangeId;
  if(!id) return;
  try{
    const ctx=await loadContext(id);
    if(!ctx) return;
    const box=mount(card);
    if(ctx.change.change_type==='edit_person') renderEdit(box,ctx); else renderRelative(box,ctx);
  }catch(error){
    const box=mount(card);
    box.innerHTML=`<span class="selective-core-v2-badge">Field review error</span><p class="selective-core-v2-status error">${esc(error?.message||String(error))}</p>`;
  }
}

export function scanSelectiveReview(){
  document.querySelectorAll('[data-tree-change-id]').forEach(card=>void ensure(card));
}

installStyles();
scanSelectiveReview();
let startupTicks=0;
const startupPoll=setInterval(()=>{
  scanSelectiveReview();
  startupTicks+=1;
  if(startupTicks>=40) clearInterval(startupPoll);
},250);
setInterval(scanSelectiveReview,3000);
document.addEventListener('genealogy:tree-suggestions-updated',()=>{
  scanSelectiveReview();
  setTimeout(scanSelectiveReview,250);
  setTimeout(scanSelectiveReview,900);
});
document.getElementById('refreshEditor')?.addEventListener('click',()=>{
  setTimeout(scanSelectiveReview,300);
  setTimeout(scanSelectiveReview,1000);
});
