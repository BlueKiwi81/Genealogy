import { supabase } from './supabase-client-v1.js';

const personPanel = document.getElementById('personPanel');
const personName = document.getElementById('personName');
const personDetails = document.getElementById('personDetails');
const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const RANK = { documented:6, strong:5, family_supplied:4, probable:3, hypothesis:2, unresolved:1 };
const state = { people:new Map(), relationships:[], parent:null, partner:null, child:null, parentLink:null, siblings:[], selected:null, loaded:false };

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
function name(p){return [p?.given_names?.trim(),p?.surname?.trim()].filter(Boolean).join(' ')||'Unknown';}
function statusLabel(s){return String(s||'unresolved').replaceAll('_',' ');}
function af(){return (window.GenealogyI18n?.language||document.documentElement.lang||'en')==='af';}
function t(en,afr){return af()?afr:en;}
function parentRole(){return state.parent?.gender==='female'?t('mother','moeder'):state.parent?.gender==='male'?t('father','vader'):t('parent','ouer');}

function closeDialog(){document.getElementById('lineageEvidenceBackdrop')?.remove();}
function showDialog(){
  if(!state.parent||!state.child)return;
  closeDialog();
  const parentName=esc(name(state.parent));
  const childName=esc(name(state.child));
  const partnerName=state.partner?esc(name(state.partner)):'';
  const status=statusLabel(state.parentLink?.source_status||'unresolved');
  const spouseSentence=state.partner
    ? t(` The spouse relationship to ${partnerName} is documented in the archive.`,` Die eggenootverhouding met ${partnerName} is in die argief gedokumenteer.`)
    : '';
  const backdrop=document.createElement('div');backdrop.id='lineageEvidenceBackdrop';backdrop.className='lineage-evidence-backdrop';
  backdrop.innerHTML=`<section class="lineage-evidence-dialog" role="dialog" aria-modal="true"><header><div><p>${t('Evidence boundary','Bewysgrens')}</p><h3>${t('Why is there a question mark here?','Waarom is hier ’n vraagteken?')}</h3></div><button type="button" aria-label="Close">×</button></header><div class="lineage-evidence-body"><p>${t(`${parentName} is a documented historical person.`,` ${parentName} is ’n gedokumenteerde historiese persoon.`)}${spouseSentence} ${t(`The question mark belongs to the proposed parent-child link to ${childName}, not to the existence of the people shown.`,`Die vraagteken behoort aan die voorgestelde ouer-kind-skakel met ${childName}, nie aan die bestaan van die persone wat gewys word nie.`)}</p><div><strong>${t('Working link','Werkende skakel')}</strong><span>${t(`Possible ${parentRole()} of ${childName}`,`Moontlike ${parentRole()} van ${childName}`)}</span></div><div><strong>${t('Status','Status')}</strong><span>${esc(status)} — ${t('not yet proved by a parent-naming original record','nog nie deur ’n oorspronklike rekord wat die ouer noem bewys nie')}</span></div><div><strong>${t('What would settle it?','Wat sou dit beslis?')}</strong><span>${t('A birth or baptism record, estate/death notice, or another comparably direct original record naming the parent-child relationship.','’n Geboorte- of dooprekord, boedel-/sterfkennisgewing, of ’n vergelykbaar direkte oorspronklike rekord wat die ouer-kind-verhouding benoem.')}</span></div>${state.parent.narrative_summary?`<p class="foot">${esc(state.parent.narrative_summary)}</p>`:''}</div></section>`;
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeDialog();});backdrop.querySelector('button').addEventListener('click',closeDialog);document.body.appendChild(backdrop);
}

function selectedIdFromName(){
  const shown=personName?.textContent?.trim();
  if(!shown)return null;
  for(const p of state.people.values())if(name(p)===shown)return p.id;
  return null;
}

function siblingText(){
  return state.siblings.map(({person,status})=>`${name(person)}${['probable','hypothesis','unresolved'].includes(status)?` (${statusLabel(status)})`:''}`).join(', ');
}

function decorateDetails(){
  if(!state.loaded||!personDetails)return;
  document.getElementById('lineageSiblingContext')?.remove();
  personPanel?.querySelector('.lineage-evidence-panel-question')?.remove();
  const selected=state.selected||selectedIdFromName();
  if(!selected)return;
  const relevant=selected===state.parent?.id||selected===state.partner?.id;
  if(!relevant)return;
  if(state.siblings.length){
    const row=document.createElement('div');row.id='lineageSiblingContext';row.className='detail-line lineage-sibling-context';
    row.innerHTML=`<strong>${t(`${esc(name(state.child))}'s sibling group`,`${esc(name(state.child))} se sibbegroep`)}</strong>${esc(siblingText())}<small>${t('These sibling links are evidence about the child’s family group. They do not, by themselves, prove the proposed parent relationship for every sibling.','Hierdie sibbe-skakels is bewys oor die kind se familiegroep. Op sigself bewys dit nie die voorgestelde ouerverhouding vir elke sib nie.')}</small>`;
    personDetails.appendChild(row);
  }
  if(selected===state.parent?.id&&personPanel){
    const button=document.createElement('button');button.type='button';button.className='lineage-evidence-panel-question';button.textContent='?';button.setAttribute('aria-label',t('Explain the uncertain parent link','Verduidelik die onseker ouerskakel'));button.addEventListener('click',showDialog);personPanel.appendChild(button);
  }
}

function decorateCentre(){
  if(!state.loaded||!treeCanvas||!state.parent)return;
  treeCanvas.querySelectorAll(`.family-centre-person[data-person-id="${CSS.escape(state.parent.id)}"]`).forEach(group=>{
    if(group.querySelector('.lineage-centre-question'))return;
    const label=group.querySelector('.family-centre-name');if(!label)return;
    const x=Number(label.getAttribute('x')||0),y=Number(label.getAttribute('y')||0);
    const ns='http://www.w3.org/2000/svg';const marker=document.createElementNS(ns,'g');marker.classList.add('lineage-centre-question');marker.setAttribute('role','button');marker.setAttribute('tabindex','0');marker.setAttribute('aria-label',t('Explain uncertain parent link','Verduidelik onseker ouerskakel'));
    const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',String(x+63));circle.setAttribute('cy',String(y-22));circle.setAttribute('r','10');
    const text=document.createElementNS(ns,'text');text.setAttribute('x',String(x+63));text.setAttribute('y',String(y-18));text.setAttribute('text-anchor','middle');text.textContent='?';marker.append(circle,text);
    const activate=e=>{e?.preventDefault?.();e?.stopPropagation?.();showDialog();};marker.addEventListener('click',activate);marker.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')activate(e);});group.appendChild(marker);
  });
}

function installStyles(){if(document.getElementById('lineageEvidenceStyles'))return;const style=document.createElement('style');style.id='lineageEvidenceStyles';style.textContent=`
  #personPanel{position:relative}.lineage-evidence-panel-question{position:absolute;top:17px;right:17px;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;border:1px dashed #5f5146;background:#7b6d60;color:#fff;font:800 15px Arial,sans-serif;cursor:pointer}.lineage-sibling-context small{display:block;margin-top:6px;color:#807369;font-size:.74rem;line-height:1.4;text-transform:none;letter-spacing:0}.lineage-centre-question{cursor:pointer}.lineage-centre-question circle{fill:#7b6d60;stroke:#50463c;stroke-width:1.4;stroke-dasharray:3 2}.lineage-centre-question text{fill:#fff;font:800 12px Arial,sans-serif;pointer-events:none}
  .lineage-evidence-backdrop{position:fixed;inset:0;z-index:10040;display:grid;place-items:center;padding:20px;background:rgba(44,36,30,.4);backdrop-filter:blur(2px)}.lineage-evidence-dialog{width:min(650px,calc(100vw - 30px));max-height:82vh;overflow:auto;border:1px solid #d7c8b9;border-radius:18px;background:#fffdf9;box-shadow:0 24px 65px rgba(43,31,23,.25)}.lineage-evidence-dialog header{display:flex;justify-content:space-between;gap:15px;padding:18px 20px 12px;border-bottom:1px solid #eadfd4}.lineage-evidence-dialog header p{margin:0 0 4px;color:#7c6e62;font:800 9px Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase}.lineage-evidence-dialog h3{margin:0}.lineage-evidence-dialog header button{width:32px;height:32px;border:0;border-radius:50%;background:#f0e6da;cursor:pointer}.lineage-evidence-body{display:grid;gap:10px;padding:16px 20px 20px;font:13px/1.48 Arial,sans-serif}.lineage-evidence-body>p{margin:0;padding:10px 11px;border-radius:10px;background:#f3eee8}.lineage-evidence-body>div{display:grid;grid-template-columns:125px 1fr;gap:10px}.lineage-evidence-body .foot{font-size:11px;color:#75695f;background:transparent;padding:0}
`;document.head.appendChild(style);}

async function load(){
  const [peopleRes,relRes]=await Promise.all([supabase.from('people').select('id,slug,given_names,surname,gender,narrative_summary,is_active'),supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,source_status,is_active')]);
  if(peopleRes.error||relRes.error)return;
  state.people=new Map((peopleRes.data||[]).filter(p=>p.is_active!==false).map(p=>[p.id,p]));
  state.relationships=(relRes.data||[]).filter(r=>r.is_active!==false);
  state.child=[...state.people.values()].find(p=>p.slug==='fw')||null;
  if(state.child){
    const candidates=state.relationships.filter(r=>r.relationship_type==='parent'&&r.person2_id===state.child.id&&['hypothesis','probable','unresolved'].includes(r.source_status||'unresolved')).sort((a,b)=>(RANK[b.source_status]||0)-(RANK[a.source_status]||0));
    state.parentLink=candidates[0]||null;
    state.parent=state.parentLink?state.people.get(state.parentLink.person1_id)||null:null;
  }
  if(state.parent){const spouse=state.relationships.find(r=>r.relationship_type==='spouse'&&(r.person1_id===state.parent.id||r.person2_id===state.parent.id));state.partner=spouse?state.people.get(spouse.person1_id===state.parent.id?spouse.person2_id:spouse.person1_id):null;}
  if(state.child){state.siblings=state.relationships.filter(r=>r.relationship_type==='sibling'&&(r.person1_id===state.child.id||r.person2_id===state.child.id)).map(r=>({person:state.people.get(r.person1_id===state.child.id?r.person2_id:r.person1_id),status:r.source_status||'unresolved'})).filter(x=>x.person).sort((a,b)=>(RANK[b.status]||0)-(RANK[a.status]||0)||name(a.person).localeCompare(name(b.person)));}
  state.loaded=true;installStyles();state.selected=state.selected||centreSelect?.value||null;setTimeout(()=>{decorateDetails();decorateCentre();},20);
}

document.addEventListener('click',e=>{const node=e.target instanceof Element?e.target.closest('[data-person-id],[data-snapshot-person]'):null;const id=node?.dataset?.personId||node?.dataset?.snapshotPerson;if(id){state.selected=id;setTimeout(decorateDetails,25);}},true);
centreSelect?.addEventListener('change',()=>{state.selected=centreSelect.value||null;setTimeout(()=>{decorateDetails();decorateCentre();},80);});
if(personName)new MutationObserver(()=>setTimeout(decorateDetails,25)).observe(personName,{childList:true,subtree:true,characterData:true});
if(treeCanvas)new MutationObserver(()=>setTimeout(decorateCentre,10)).observe(treeCanvas,{childList:true,subtree:true});
document.addEventListener('genealogy:language-changed',()=>setTimeout(()=>{decorateDetails();decorateCentre();},30));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDialog();});
supabase.auth.onAuthStateChange((_e,s)=>{if(s)setTimeout(load,0);});
const {data:{session}}=await supabase.auth.getSession();if(session)await load();
