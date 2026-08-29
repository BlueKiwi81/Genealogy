import { supabase } from './supabase-client-v1.js';

const MAX_FILES = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(['pdf','jpg','jpeg','png','webp','heic','heif','tif','tiff']);
const state = { people:[], relationships:[], peopleById:new Map(), parentsByChild:new Map(), partnersByPerson:new Map(), loaded:false, current:null };
let decorateFrame = null;

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
function nameOf(person){return [person?.given_names?.trim(),person?.surname?.trim()].filter(Boolean).join(' ')||'this relative';}
function extOf(name){const p=String(name||'').toLowerCase().split('.');return p.length>1?p.pop():'';}
function safeName(name){return String(name||'record').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(-120)||'record';}
function add(map,key,value){const list=map.get(key)||[];list.push(value);map.set(key,list);}
function sourceClass(type){if(['birth_certificate','civil_register'].includes(type))return'official_record';if(['baptism_record','marriage_record','church_register'].includes(type))return'church_record';if(['death_notice','estate_record'].includes(type))return'estate_or_probate';if(['family_bible','family_document'].includes(type))return'family_document';if(type==='researcher_report')return'researcher_material';return'other';}

function rebuild(){
  state.peopleById=new Map(state.people.map(p=>[p.id,p]));
  state.parentsByChild=new Map(); state.partnersByPerson=new Map();
  for(const r of state.relationships){
    if(r.is_active===false)continue;
    if(r.relationship_type==='parent') add(state.parentsByChild,r.person2_id,r);
    if(['spouse','partner'].includes(r.relationship_type)){
      add(state.partnersByPerson,r.person1_id,r); add(state.partnersByPerson,r.person2_id,r);
    }
  }
}
function parentPair(id){
  const entries=(state.parentsByChild.get(id)||[]).map(r=>({relationship:r,person:state.peopleById.get(r.person1_id)})).filter(x=>x.person);
  const pair=[null,null],used=new Set();
  const father=entries.findIndex(x=>x.person.gender==='male'),mother=entries.findIndex(x=>x.person.gender==='female');
  if(father>=0){pair[0]=entries[father];used.add(father);} if(mother>=0){pair[1]=entries[mother];used.add(mother);}
  entries.forEach((x,i)=>{if(used.has(i))return;const open=pair.findIndex(v=>v===null);if(open>=0)pair[open]=x;});
  return pair;
}
function partnerOf(id){
  const list=(state.partnersByPerson.get(id)||[]).filter(r=>!['former','ended','divorced'].includes(String(r.relationship_status||'').toLowerCase()));
  const r=list.find(x=>String(x.relationship_status||'').toLowerCase()==='current')||list[0];
  if(!r)return null;
  return state.peopleById.get(r.person1_id===id?r.person2_id:r.person1_id)||null;
}
function buildLevels(centre,partner,maxLevel){
  const levels=[];
  let current=partner?[...parentPair(centre.id),...parentPair(partner.id)]:parentPair(centre.id);
  levels.push(current);
  for(let level=1;level<=maxLevel;level+=1){
    const next=[];
    current.forEach(entry=>{if(!entry?.person){next.push(null,null);}else next.push(...parentPair(entry.person.id));});
    levels.push(next); current=next;
  }
  return levels;
}
function contextFor(level,slot,centre,partner,levels){
  const parentSlot=slot%2===0?'father':'mother';
  if(level===0){
    const anchor=partner&&slot>=2?partner:centre;
    return anchor?{anchor,parentSlot}:null;
  }
  const previous=levels[level-1]?.[Math.floor(slot/2)]?.person||null;
  return previous?{anchor:previous,parentSlot}:null;
}

function installStyles(){
  if(document.getElementById('unknownParentEvidenceStyles'))return;
  const style=document.createElement('style'); style.id='unknownParentEvidenceStyles'; style.textContent=`
    .unknown-parent-node>path{fill:#fffdfa!important;fill-opacity:.10!important;stroke:#cfc8bf!important;stroke-opacity:.42!important;stroke-dasharray:3 7!important}
    .unknown-parent-node .fan-label{opacity:.24!important;fill:#81776e!important}.unknown-parent-node .fan-date{opacity:.18!important}
    .unknown-parent-node.is-actionable{cursor:pointer}.unknown-parent-node.is-actionable>path{fill-opacity:.16!important;stroke-opacity:.58!important}
    .unknown-parent-node.is-actionable:hover>path,.unknown-parent-node.is-actionable:focus>path{fill:#eee5d8!important;fill-opacity:.45!important;stroke:#8c7967!important;stroke-opacity:.85!important;stroke-width:1.5!important}
    .unknown-parent-node.is-actionable:hover .fan-label,.unknown-parent-node.is-actionable:focus .fan-label{opacity:.7!important}
    .unknown-parent-overlay{position:fixed;inset:0;z-index:10040;background:rgba(38,31,25,.48);display:grid;place-items:center;padding:18px}.unknown-parent-overlay.hidden{display:none}
    .unknown-parent-dialog{width:min(680px,100%);max-height:min(88vh,850px);overflow:auto;background:#fffdf8;border:1px solid #d8cec1;border-radius:18px;box-shadow:0 24px 70px rgba(30,24,19,.24)}
    .unknown-parent-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:20px 22px 14px;border-bottom:1px solid #e2d8cc}.unknown-parent-head h2{margin:0}.unknown-parent-body{display:grid;gap:13px;padding:18px 22px 22px}.unknown-parent-explain{padding:11px 12px;border-radius:10px;background:#f8f1e6;font:.82rem/1.45 Arial,sans-serif;color:#5b5047}
    .unknown-parent-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.unknown-parent-body label{display:grid;gap:5px}.unknown-parent-body textarea{min-height:110px}.unknown-parent-file-list{font:.76rem/1.4 Arial,sans-serif;color:#6e645b}.unknown-parent-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap}.unknown-parent-status{min-height:1.2em;margin:0;font:.8rem/1.45 Arial,sans-serif;color:#6b6158}.unknown-parent-status.error{color:#8a2828}.unknown-parent-status.success{color:#315f38}
    @media(max-width:620px){.unknown-parent-grid{grid-template-columns:1fr}.unknown-parent-actions .button{width:100%}}
  `; document.head.appendChild(style);
}
function ensureModal(){
  let overlay=document.getElementById('unknownParentOverlay'); if(overlay)return overlay;
  overlay=document.createElement('div'); overlay.id='unknownParentOverlay'; overlay.className='unknown-parent-overlay hidden';
  overlay.innerHTML=`<div class="unknown-parent-dialog" role="dialog" aria-modal="true" aria-labelledby="unknownParentTitle">
    <div class="unknown-parent-head"><div><p class="eyebrow">Help resolve an unknown ancestor</p><h2 id="unknownParentTitle">Do you know this parent?</h2></div><button class="button ghost" type="button" data-close-unknown>Close</button></div>
    <form id="unknownParentForm" class="unknown-parent-body">
      <p id="unknownParentContext" class="unknown-parent-explain"></p>
      <label>What does the evidence suggest?<textarea id="unknownParentNote" required placeholder="For example: this baptism entry appears to name Annie's mother as ..."></textarea></label>
      <div class="unknown-parent-grid">
        <label>Research strength<select id="unknownParentStrength"><option value="hypothesis">Hypothesis</option><option value="probable">Probable</option><option value="strong">Strong lead</option><option value="unresolved">Unresolved</option></select></label>
        <label>Type of parent-naming source<select id="unknownParentEvidenceType"><option value="baptism_record">Baptism / christening record</option><option value="birth_certificate">Birth / civil record</option><option value="marriage_record">Marriage record</option><option value="death_notice">Death notice</option><option value="estate_record">Estate / probate record</option><option value="church_register">Church register</option><option value="family_bible">Family Bible</option><option value="family_document">Family document / notes</option><option value="researcher_report">Researcher report</option><option value="other">Other source</option></select></label>
      </div>
      <label>Upload the original parent-naming record<input id="unknownParentFiles" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,application/pdf,image/*" /></label>
      <div id="unknownParentFileList" class="unknown-parent-file-list"></div>
      <label class="check-row"><input id="unknownParentLivingData" type="checkbox" /><span>This source contains private or identifying information about a living person.</span></label>
      <label class="check-row"><input id="unknownParentPolicy" type="checkbox" required /><span>I understand this is submitted as evidence for review. Uploading it does not by itself confirm the parent or change the family tree.</span></label>
      <p id="unknownParentStatus" class="unknown-parent-status" aria-live="polite"></p>
      <div class="unknown-parent-actions"><button class="button ghost" type="button" data-close-unknown>Cancel</button><button id="unknownParentSubmit" class="button primary" type="submit">Submit evidence for review</button></div>
    </form></div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close-unknown]').forEach(b=>b.addEventListener('click',()=>closeModal()));
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal();});
  document.getElementById('unknownParentFiles')?.addEventListener('change',showFiles);
  document.getElementById('unknownParentForm')?.addEventListener('submit',submit);
  return overlay;
}
function status(text,type=''){const el=document.getElementById('unknownParentStatus');if(!el)return;el.textContent=text;el.className=`unknown-parent-status${type?` ${type}`:''}`;}
function showFiles(){const files=[...(document.getElementById('unknownParentFiles')?.files||[])];const el=document.getElementById('unknownParentFileList');if(el)el.innerHTML=files.map(f=>`<div>${esc(f.name)} · ${Math.max(1,Math.round(f.size/1024))} KB</div>`).join('');}
function openModal(context){state.current=context;const overlay=ensureModal();const role=context.parentSlot==='father'?'father':'mother';document.getElementById('unknownParentTitle').textContent=`Do you know ${nameOf(context.anchor)}'s ${role}?`;document.getElementById('unknownParentContext').innerHTML=`This is the currently unknown <strong>${role}</strong> of <strong>${esc(nameOf(context.anchor))}</strong>. You can share a lead and, ideally, upload the original record that names the parent. The submission remains provisional until evidence review and editor confirmation.`;document.getElementById('unknownParentForm')?.reset();showFiles();status('');overlay.classList.remove('hidden');document.body.style.overflow='hidden';}
function closeModal(){document.getElementById('unknownParentOverlay')?.classList.add('hidden');document.body.style.removeProperty('overflow');state.current=null;}

async function analyzeEvidence(evidenceIds,contributionId){
  let done=0,manual=0,failed=0;
  for(const id of evidenceIds){
    try{const {data,error}=await supabase.functions.invoke('evidence-document-review',{body:{action:'analyze',evidence_id:id,contribution_id:contributionId}});if(error||data?.error)throw error||new Error(data.error);if(data?.review?.review_status==='manual_required')manual+=1;else done+=1;}catch{failed+=1;}
  }
  return {done,manual,failed};
}
async function submit(event){
  event.preventDefault(); const context=state.current;if(!context)return;
  const note=document.getElementById('unknownParentNote')?.value.trim()||''; const files=[...(document.getElementById('unknownParentFiles')?.files||[])];
  if(!note)return status('Tell us what the evidence appears to show.','error');
  if(!document.getElementById('unknownParentPolicy')?.checked)return status('Please confirm the evidence-review note first.','error');
  if(files.length>MAX_FILES)return status(`Please attach no more than ${MAX_FILES} files.`, 'error');
  for(const file of files){if(!ALLOWED.has(extOf(file.name)))return status(`${file.name} is not a supported PDF or image.`, 'error');if(file.size>MAX_BYTES)return status(`${file.name} is larger than 15 MB.`, 'error');}
  const button=document.getElementById('unknownParentSubmit'); if(button){button.disabled=true;button.textContent='Saving evidence...';}
  try{
    const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Please sign in again before submitting evidence.');
    const {data:profile,error:profileError}=await supabase.from('app_users').select('status').eq('user_id',session.user.id).maybeSingle();if(profileError||profile?.status!=='approved')throw new Error('Approved family access is required to submit evidence.');
    const evidenceType=document.getElementById('unknownParentEvidenceType')?.value||'other';const living=Boolean(document.getElementById('unknownParentLivingData')?.checked);const evidence=[];
    for(const file of files){
      const path=`${session.user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
      const {error:uploadError}=await supabase.storage.from('family-evidence').upload(path,file,{contentType:file.type||undefined,upsert:false});if(uploadError)throw uploadError;
      const {data:item,error:itemError}=await supabase.from('evidence_items').insert({submitted_by:session.user.id,evidence_type:evidenceType,source_class:sourceClass(evidenceType),title:`Possible ${context.parentSlot} of ${nameOf(context.anchor)}`.slice(0,180),storage_path:path,original_filename:file.name,notes:note,contains_living_person_data:living,privacy_review_status:living?'restricted':'pending',visibility:'restricted',review_status:'pending'}).select('id,storage_path,original_filename,title,evidence_type,source_class,privacy_review_status').single();if(itemError)throw itemError;evidence.push(item);
    }
    const strength=['strong','probable','hypothesis','unresolved'].includes(document.getElementById('unknownParentStrength')?.value)?document.getElementById('unknownParentStrength').value:'hypothesis';
    const payload={submitted_by:session.user.id,target_person_id:context.anchor.id,contribution_type:'research',original_language:document.documentElement.lang||'en',narrative_text:note,payload:{categories:['research','relationship',...(evidence.length?['source']:[])],research_frontier:true,frontier_status:strength,frontier_title:`Possible ${context.parentSlot} of ${nameOf(context.anchor)}`,unknown_parent_slot:context.parentSlot,relationship_role:'parent',anchor_person_id:context.anchor.id,attached_to_name:nameOf(context.anchor),evidence_items:evidence,attachment_count:evidence.length,contains_living_person_data:living}};
    const {data:contribution,error:contributionError}=await supabase.from('contributions').insert(payload).select('id').single();if(contributionError)throw contributionError;
    if(evidence.length){status(`Evidence saved privately. Reading ${evidence.length===1?'the record':'the records'} now...`);const result=await analyzeEvidence(evidence.map(x=>x.id),contribution.id);const parts=[];if(result.done)parts.push(`${result.done} read`);if(result.manual)parts.push(`${result.manual} flagged for closer reading`);if(result.failed)parts.push(`${result.failed} available for editor retry`);status(`Submitted as provisional parent research. Intelligent review: ${parts.join(', ')}. The family tree has not changed.`, 'success');}
    else status('Research lead submitted. It remains provisional until supporting evidence is added and an editor reviews it.', 'success');
    document.dispatchEvent(new CustomEvent('genealogy:provenance-updated'));
    window.setTimeout(closeModal,2200);
  }catch(error){status(error?.message||'The evidence could not be submitted.','error');}
  finally{if(button){button.disabled=false;button.textContent='Submit evidence for review';}}
}

async function load(){
  const [p,r]=await Promise.all([supabase.from('people').select('id,given_names,surname,gender,is_active').eq('is_active',true),supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,relationship_status,is_active').eq('is_active',true)]);
  if(p.error||r.error)return;state.people=p.data||[];state.relationships=r.data||[];rebuild();state.loaded=true;scheduleDecorate();
}
function decorate(){
  decorateFrame=null;if(!state.loaded)return;installStyles();const canvas=document.getElementById('treeCanvas');const centreId=document.getElementById('centreSelect')?.value;const centre=state.peopleById.get(centreId);if(!canvas||!centre)return;
  const familyWanted=document.getElementById('treeViewMode')?.value==='family';const partner=familyWanted?partnerOf(centre.id):null;
  const groups=[...canvas.querySelectorAll('g[data-fan-level][data-fan-slot]')];const max=Math.max(0,...groups.map(g=>Number(g.dataset.fanLevel)||0));const levels=buildLevels(centre,partner,max);
  groups.forEach(group=>{
    if(group.classList.contains('person-node')||group.classList.contains('research-frontier-node'))return;
    group.classList.add('unknown-parent-node');const level=Number(group.dataset.fanLevel)||0,slot=Number(group.dataset.fanSlot)||0;const context=contextFor(level,slot,centre,partner,levels);
    group.classList.toggle('is-actionable',Boolean(context));
    if(!context||group.dataset.unknownBound==='1')return;
    group.dataset.unknownBound='1';group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('aria-label',`Unknown ${context.parentSlot} of ${nameOf(context.anchor)}. Add research or evidence.`);
    const activate=e=>{e?.preventDefault?.();e?.stopPropagation?.();openModal(context);};group.addEventListener('click',activate);group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(e);}});
  });
}
function scheduleDecorate(){if(decorateFrame!==null)return;decorateFrame=requestAnimationFrame(decorate);}
ensureModal();installStyles();
new MutationObserver(scheduleDecorate).observe(document.getElementById('treeCanvas')||document.body,{childList:true,subtree:true});
document.getElementById('centreSelect')?.addEventListener('change',scheduleDecorate);document.addEventListener('genealogy:archive-ready',()=>void load());window.addEventListener('load',scheduleDecorate);
supabase.auth.onAuthStateChange((_event,session)=>{if(session)void load();});
const {data:{session}}=await supabase.auth.getSession();if(session)await load();
