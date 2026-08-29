import { supabase } from './supabase-client-v1.js';

const queue=document.getElementById('contributionQueue');
const editorMessage=document.getElementById('editorMessage');
let syncing=false;
let pending=new Map();
let people=[];
let peopleById=new Map();
let relationships=[];

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
function nameOf(p){return [p?.given_names?.trim(),p?.surname?.trim()].filter(Boolean).join(' ')||'Unknown';}
function refs(payload){const raw=Array.isArray(payload?.evidence_items)?payload.evidence_items:[];return raw.map(x=>typeof x==='string'?{id:x}:x).filter(x=>x?.id);}
function setMessage(text,type=''){if(!editorMessage)return;editorMessage.textContent=text;editorMessage.className=`message${type?` ${type}`:''}`;}
function usableReview(r){return r&&['reviewed','accepted','manual_required'].includes(r.review_status)&&r.identity_match!=='mismatch';}
function evidenceStatusLabel(v){return String(v||'not started').replaceAll('_',' ');}
function sourceStatusOptions(){return `<option value="documented">Documented — direct reviewed record</option><option value="family_documented">Family documented — retained family record</option><option value="strong">Strong — compelling but not direct enough for documented</option>`;}

function installStyles(){if(document.getElementById('unknownParentEditorStyles'))return;const style=document.createElement('style');style.id='unknownParentEditorStyles';style.textContent=`
  .unknown-parent-review-box{margin:10px 0 12px;padding:13px;border:1px solid #bfcbb8;border-radius:12px;background:#f6f8f2;font:.8rem/1.45 Arial,sans-serif;color:#51483f}.unknown-parent-review-box h4{margin:0 0 4px;font-size:.9rem}.unknown-parent-review-box>p{margin:0 0 10px}.unknown-parent-evidence-list{display:grid;gap:8px;margin:9px 0}.unknown-parent-evidence-item{padding:9px 10px;border:1px solid rgba(90,105,82,.18);border-radius:9px;background:white}.unknown-parent-evidence-head{display:flex;justify-content:space-between;gap:8px}.unknown-parent-evidence-head strong{font-size:.76rem;overflow-wrap:anywhere}.unknown-parent-evidence-head span{font-size:.64rem;text-transform:uppercase;color:#756b62}.unknown-parent-evidence-item p{margin:5px 0 0;font-size:.72rem}.unknown-parent-evidence-item details{margin-top:6px}.unknown-parent-evidence-item pre{white-space:pre-wrap;max-height:210px;overflow:auto;padding:8px;background:#f7f4ef;border-radius:7px;font:.68rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}.unknown-parent-evidence-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.unknown-parent-confirm{margin-top:12px;padding-top:11px;border-top:1px solid #d7ded2;display:grid;gap:10px}.unknown-parent-confirm-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.unknown-parent-confirm label{display:grid;gap:4px}.unknown-parent-confirm small{color:#766c63}.unknown-parent-ready{padding:8px 10px;border-radius:8px;background:#edf5e9;color:#35593b}.unknown-parent-not-ready{padding:8px 10px;border-radius:8px;background:#fff3e3;color:#76552e}.unknown-parent-confirm .check-row{display:flex;align-items:flex-start}.unknown-parent-confirm .button{justify-self:start}
  @media(max-width:700px){.unknown-parent-confirm-grid{grid-template-columns:1fr}.unknown-parent-confirm .button{width:100%}.unknown-parent-evidence-head{display:grid}}
`;document.head.appendChild(style);}

async function loadData(){
  const [c,p,r]=await Promise.all([
    supabase.from('contributions').select('id,submitted_by,target_person_id,contribution_type,narrative_text,payload,status,created_at').eq('status','pending').eq('contribution_type','research').order('created_at'),
    supabase.from('people').select('id,given_names,surname,gender,is_active').eq('is_active',true),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,source_status,is_active').eq('is_active',true)
  ]);
  if(c.error||p.error||r.error)throw c.error||p.error||r.error;
  pending=new Map((c.data||[]).filter(x=>['father','mother'].includes(x.payload?.unknown_parent_slot)).map(x=>[x.id,x]));
  people=p.data||[];peopleById=new Map(people.map(x=>[x.id,x]));relationships=r.data||[];
}
function peopleOptions(){return [...people].sort((a,b)=>nameOf(a).localeCompare(nameOf(b))).map(p=>`<option value="${esc(p.id)}">${esc(nameOf(p))}</option>`).join('');}

async function evidenceData(item){
  const itemRefs=refs(item.payload);const ids=itemRefs.map(x=>x.id);if(!ids.length)return {items:[],reviews:new Map()};
  const [e,r]=await Promise.all([
    supabase.from('evidence_items').select('id,title,original_filename,storage_path,evidence_type,source_class,review_status').in('id',ids),
    supabase.from('evidence_ai_reviews').select('evidence_id,review_status,identity_match,confidence,document_summary,transcription,warnings,error_text').in('evidence_id',ids)
  ]);
  if(e.error||r.error)throw e.error||r.error;
  return {items:e.data||[],reviews:new Map((r.data||[]).map(x=>[x.evidence_id,x]))};
}
function evidenceHtml(item,review){
  const status=review?.review_status||'not_started';return `<article class="unknown-parent-evidence-item" data-evidence-id="${esc(item.id)}" data-storage-path="${esc(item.storage_path||'')}">
    <div class="unknown-parent-evidence-head"><strong>${esc(item.original_filename||item.title||'Parent-naming record')}</strong><span>${esc(evidenceStatusLabel(status))}${review?.identity_match?` · ${esc(evidenceStatusLabel(review.identity_match))}`:''}</span></div>
    ${review?.document_summary?`<p>${esc(review.document_summary)}</p>`:''}
    ${review?.error_text?`<p>${esc(review.error_text)}</p>`:''}
    ${review?.transcription?`<details><summary>Read intelligent transcription</summary><pre>${esc(review.transcription)}</pre></details>`:''}
    <div class="unknown-parent-evidence-actions"><button type="button" class="button ghost" data-open-parent-record>Open original record</button>${!review||status==='failed'?`<button type="button" class="button secondary" data-read-parent-record>${status==='failed'?'Retry intelligent reading':'Run intelligent reading'}</button>`:`<button type="button" class="button ghost" data-read-parent-record data-refresh="true">Re-read document</button>`}</div>
  </article>`;}

async function decorateCard(card,item){
  if(card.dataset.unknownParentEnhanced==='1')return;const evidence=await evidenceData(item);const child=peopleById.get(item.target_person_id);const slot=item.payload.unknown_parent_slot;const role=slot==='father'?'father':'mother';const itemRefs=refs(item.payload);const reviewList=evidence.items.map(e=>evidence.reviews.get(e.id)||null);const ready=evidence.items.length>0&&reviewList.length===evidence.items.length&&reviewList.every(usableReview);
  const box=document.createElement('section');box.className='unknown-parent-review-box';box.innerHTML=`<h4>Unknown ${esc(role)} evidence</h4><p>This submission is trying to resolve the currently empty ${esc(role)} slot of <strong>${esc(nameOf(child))}</strong>. The upload and AI reading are evidence aids only; confirming the relationship below is an editor decision.</p>
    <div class="unknown-parent-evidence-list">${evidence.items.length?evidence.items.map(e=>evidenceHtml(e,evidence.reviews.get(e.id))).join(''):'<p>No source file is attached yet. Keep this as research-frontier material until evidence is supplied.</p>'}</div>
    <div class="${ready?'unknown-parent-ready':'unknown-parent-not-ready'}">${ready?'The attached source has a usable intelligent reading. Review the original and transcription before confirming the parent.':'Parent confirmation remains unavailable until at least one attached source has a usable intelligent reading with no identity mismatch.'}</div>
    <div class="unknown-parent-confirm">
      <strong>Confirm this parent only if the evidence supports it</strong>
      <label>Link to an existing person (optional)<select data-existing-parent><option value="">Create a new parent record instead</option>${peopleOptions()}</select></label>
      <div class="unknown-parent-confirm-grid"><label>Given names<input data-parent-given placeholder="As supported by the record" /></label><label>Surname<input data-parent-surname placeholder="Surname" /></label></div>
      <label>Evidence status<select data-parent-status>${sourceStatusOptions()}</select></label>
      <label class="check-row"><input type="checkbox" data-parent-confirm-check /><span>I have reviewed the original parent-naming evidence and am satisfied that it identifies this ${esc(role)} of ${esc(nameOf(child))}.</span></label>
      <small>Choosing “documented” means the reviewed record directly supports this specific parent relationship. An AI match alone is not enough.</small>
      <button type="button" class="button primary" data-confirm-parent ${ready?'':'disabled'}>Confirm ${esc(role)} and update tree</button>
    </div>`;
  const actions=card.querySelector('.queue-actions');card.insertBefore(box,actions||null);card.dataset.unknownParentEnhanced='1';
}

async function openOriginal(button){const article=button.closest('[data-evidence-id]');const path=article?.dataset.storagePath;if(!path)return;button.disabled=true;try{const {data,error}=await supabase.storage.from('family-evidence').createSignedUrl(path,600);if(error)throw error;if(data?.signedUrl)window.open(data.signedUrl,'_blank','noopener,noreferrer');}catch(e){setMessage(e?.message||'Could not open the original record.','error');}finally{button.disabled=false;}}
async function runReading(button){const card=button.closest('[data-contribution-id]');const evidence=button.closest('[data-evidence-id]');if(!card||!evidence)return;button.disabled=true;setMessage('Reading the parent-naming record...');try{const {data,error}=await supabase.functions.invoke('evidence-document-review',{body:{action:'analyze',evidence_id:evidence.dataset.evidenceId,contribution_id:card.dataset.contributionId,refresh:button.dataset.refresh==='true'}});if(error||data?.error)throw error||new Error(data.error);setMessage('Intelligent reading complete. Review it before confirming the relationship.','success');card.dataset.unknownParentEnhanced='';card.querySelector('.unknown-parent-review-box')?.remove();await sync();}catch(e){setMessage(e?.message||'The record could not be analysed.','error');button.disabled=false;}}

function sameSlotParent(childId,slot){const expected=slot==='father'?'male':'female';return relationships.filter(r=>r.relationship_type==='parent'&&r.person2_id===childId).map(r=>peopleById.get(r.person1_id)).find(p=>p&&(p.gender===expected||!p.gender));}
async function confirmParent(button){
  const card=button.closest('[data-contribution-id]');const item=pending.get(card?.dataset.contributionId);if(!card||!item)return;const slot=item.payload.unknown_parent_slot;const role=slot==='father'?'father':'mother';const child=peopleById.get(item.target_person_id);const box=button.closest('.unknown-parent-review-box');
  if(!box.querySelector('[data-parent-confirm-check]')?.checked)return setMessage('Confirm that you reviewed the original parent-naming evidence first.','error');
  const existing=sameSlotParent(item.target_person_id,slot);if(existing)return setMessage(`${nameOf(child)} already has a ${role} relationship to ${nameOf(existing)}. Review the existing relationship instead of creating another.`, 'error');
  const evidence=await evidenceData(item);if(!evidence.items.length||!evidence.items.every(e=>usableReview(evidence.reviews.get(e.id))))return setMessage('The source still needs a usable intelligent reading before this confirmation route is enabled.','error');
  const status=box.querySelector('[data-parent-status]')?.value||'strong';const existingId=box.querySelector('[data-existing-parent]')?.value||'';let parentId=existingId;let createdId=null;
  if(existingId){const p=peopleById.get(existingId);const expected=slot==='father'?'male':'female';if(p?.gender&&p.gender!==expected)return setMessage(`The selected existing person is recorded as ${p.gender}, which does not match the ${role} slot.`, 'error');}
  else{const given=box.querySelector('[data-parent-given]')?.value.trim()||'';const surname=box.querySelector('[data-parent-surname]')?.value.trim()||null;if(!given)return setMessage('Enter the parent’s given name(s), or select an existing person.','error');const {data:newPerson,error}=await supabase.from('people').insert({given_names:given,surname,gender:slot==='father'?'male':'female',life_status:'unknown',source_status:status,privacy_level:'family',preferred_name_status:'unresolved'}).select('id').single();if(error)return setMessage(error.message,'error');parentId=newPerson.id;createdId=newPerson.id;}
  button.disabled=true;button.textContent=`Confirming ${role}...`;
  try{
    const {data:relationship,error:relError}=await supabase.from('relationships').insert({person1_id:parentId,person2_id:item.target_person_id,relationship_type:'parent',relationship_status:'current',source_status:status,notes:`Confirmed from reviewed parent-naming evidence in contribution ${item.id}.`}).select('id').single();if(relError)throw relError;
    const parent=peopleById.get(parentId);const parentLabel=parent?nameOf(parent):[box.querySelector('[data-parent-given]')?.value.trim(),box.querySelector('[data-parent-surname]')?.value.trim()].filter(Boolean).join(' ');
    const {data:claim,error:claimError}=await supabase.from('genealogy_claims').insert({relationship_id:relationship.id,claim_type:'parent_relationship',claim_label:`${role[0].toUpperCase()+role.slice(1)} of ${nameOf(child)}`,claim_value:{parent_id:parentId,child_id:item.target_person_id,parent_name:parentLabel,parent_slot:slot},evidence_status:status,canonical:true,include_in_dossier:true,dossier_note:'Relationship confirmed from reviewed parent-naming evidence.'}).select('id').single();if(claimError)throw claimError;
    for(const ev of evidence.items){const {error:linkError}=await supabase.from('claim_evidence').upsert({claim_id:claim.id,evidence_id:ev.id,support_type:'supports',evidence_strength:status==='documented'?'direct':'strong',note:'Parent-naming evidence reviewed by family editor.'},{onConflict:'claim_id,evidence_id'});if(linkError)throw linkError;}
    const {data:{session}}=await supabase.auth.getSession();const {error:updateError}=await supabase.from('contributions').update({status:'approved',review_note:`Confirmed ${role} relationship from reviewed evidence (${status}).`,reviewed_by:session?.user?.id||null,reviewed_at:new Date().toISOString()}).eq('id',item.id);if(updateError)throw updateError;
    await supabase.from('research_frontier_entries').update({is_active:false,updated_at:new Date().toISOString()}).eq('source_contribution_id',item.id);
    setMessage(`${parentLabel} has been confirmed as ${nameOf(child)}'s ${role}. The tree will reload so the question mark is replaced by the confirmed parent.`, 'success');
    window.setTimeout(()=>window.location.reload(),900);
  }catch(e){if(createdId)await supabase.from('people').delete().eq('id',createdId);setMessage(e?.message||`Could not confirm this ${role}.`,'error');button.disabled=false;button.textContent=`Confirm ${role} and update tree`;}
}

async function sync(){if(syncing||!queue)return;syncing=true;try{installStyles();await loadData();const cards=[...queue.querySelectorAll('[data-contribution-id]')];for(const card of cards){const item=pending.get(card.dataset.contributionId);if(item)await decorateCard(card,item);}}catch(e){setMessage(e?.message||'Could not load unknown-parent review tools.','error');}finally{syncing=false;}}
if(queue){queue.addEventListener('click',e=>{const open=e.target.closest('[data-open-parent-record]');const read=e.target.closest('[data-read-parent-record]');const confirm=e.target.closest('[data-confirm-parent]');if(open){e.preventDefault();e.stopPropagation();void openOriginal(open);}else if(read){e.preventDefault();e.stopPropagation();void runReading(read);}else if(confirm){e.preventDefault();e.stopPropagation();void confirmParent(confirm);}},true);new MutationObserver(()=>window.setTimeout(sync,40)).observe(queue,{childList:true,subtree:false});}
document.getElementById('refreshEditor')?.addEventListener('click',()=>window.setTimeout(sync,120));document.addEventListener('genealogy:archive-ready',sync);window.addEventListener('load',()=>window.setTimeout(sync,500));supabase.auth.onAuthStateChange(()=>window.setTimeout(sync,100));void sync();
