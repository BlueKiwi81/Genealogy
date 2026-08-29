import { supabase } from './supabase-client-v1.js';

const form = document.getElementById('contributionForm');
const typeSelect = document.getElementById('contributionType');
const personName = document.getElementById('personName');
const centreSelect = document.getElementById('centreSelect');
let selectedPersonId = centreSelect?.value || null;
let peopleCache = null;
const CLIENT_TIMEOUT_MS = 105000;

function af(){return (window.GenealogyI18n?.language||document.documentElement.lang||'en')==='af';}
function t(en,afr){return af()?afr:en;}
function esc(value){return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);}
function safeUrl(value){const text=String(value||'').trim();return /^https:\/\//i.test(text)?text:null;}
function displayName(person){return [person?.given_names?.trim(),person?.birth_surname?.trim()||person?.surname?.trim()||person?.current_surname?.trim()].filter(Boolean).join(' ');}
function personLabels(person){return [...new Set([
  displayName(person),
  [person?.preferred_name?.trim(),person?.birth_surname?.trim()||person?.surname?.trim()].filter(Boolean).join(' '),
  [person?.given_names?.trim(),person?.current_surname?.trim()].filter(Boolean).join(' '),
  [person?.preferred_name?.trim(),person?.current_surname?.trim()].filter(Boolean).join(' '),
].filter(Boolean))];}
function possiblyLiving(person){const status=String(person?.life_status||'').toLowerCase();if(['alive','living'].includes(status))return true;if(['dead','deceased'].includes(status)||person?.death_date)return false;const birthYear=Number(String(person?.birth_date||'').slice(0,4));return !Number.isFinite(birthYear)||birthYear>=new Date().getFullYear()-110;}

function installStyles(){
  if(document.getElementById('researchAssistantStyles'))return;
  const style=document.createElement('style');
  style.id='researchAssistantStyles';
  style.textContent=`
    .research-assistant-panel{display:grid;gap:14px;padding:4px 0 0}.research-assistant-panel.hidden{display:none}
    .research-assistant-intro{padding:14px 15px;border:1px solid #d9c9b7;border-radius:12px;background:#fbf5eb}.research-assistant-intro h3{margin:0 0 7px}.research-assistant-intro p{margin:0;color:#5d534a;font:.84rem/1.5 Arial,sans-serif}
    .research-assistant-target{padding:10px 12px;border-radius:10px;background:#eef4e9;border:1px solid #c8d8bd;font:.82rem/1.45 Arial,sans-serif;color:#51483f}.research-assistant-target strong{color:#315f38}.research-assistant-target.needs-selection{background:#fff1e8;border-color:#e4c2a7}.research-assistant-target.needs-selection strong{color:#8a4b28}
    .research-assistant-form{display:grid;gap:10px}.research-assistant-form textarea{min-height:92px}.research-assistant-note{margin:0;color:#6d6358;font:.76rem/1.45 Arial,sans-serif}.research-assistant-status{min-height:1.2em;margin:0;font:.8rem/1.45 Arial,sans-serif;color:#6b6158}.research-assistant-status.error{color:#8a2828}.research-assistant-status.success{color:#315f38}
    .research-assistant-results{display:grid;gap:12px}.research-assistant-summary{padding:12px 14px;border:1px solid #d8cec1;border-radius:11px;background:#fffaf3;font:.84rem/1.5 Arial,sans-serif}.research-assistant-summary p{margin:0}
    .research-finding{padding:13px 14px;border:1px solid #ded3c6;border-radius:12px;background:#fff}.research-finding h4{margin:0 0 5px}.research-finding-meta{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 8px}.research-finding-meta span{padding:3px 7px;border-radius:999px;background:#f0e8dc;color:#65594e;font:700 .68rem Arial,sans-serif}.research-finding p{margin:6px 0;font:.8rem/1.48 Arial,sans-serif;color:#51483f}.research-finding a{display:inline-flex;margin-top:5px}
    .research-assistant-search-notes,.research-assistant-history{padding:11px 13px;border-radius:11px;background:#f7f3ed;border:1px solid #e1d7cb}.research-assistant-search-notes h4,.research-assistant-history h4{margin:0 0 7px}.research-assistant-search-notes ul{margin:0;padding-left:18px;color:#655c53;font:.76rem/1.45 Arial,sans-serif}.research-history-item{padding:8px 0;border-top:1px solid #e1d7cb;font:.76rem/1.45 Arial,sans-serif}.research-history-item:first-of-type{border-top:0}
  `;
  document.head.appendChild(style);
}

async function people(){
  if(peopleCache)return peopleCache;
  const {data,error}=await supabase.from('people').select('id,given_names,preferred_name,surname,birth_surname,current_surname,birth_date,death_date,life_status');
  if(error)return [];
  peopleCache=data||[];
  return peopleCache;
}

async function resolveSelectedPersonId(){
  const shown=personName?.textContent?.trim()||'';
  if(shown&&shown!==t('Choose a person','Kies ’n persoon')){
    const all=await people();
    const matches=all.filter((p)=>personLabels(p).includes(shown));
    if(matches.length===1){selectedPersonId=matches[0].id;return selectedPersonId;}
  }
  selectedPersonId=centreSelect?.value||selectedPersonId||null;
  return selectedPersonId;
}

function selectedPersonLabel(){
  const shown=personName?.textContent?.trim();
  if(shown&&shown!==t('Choose a person','Kies ’n persoon'))return shown;
  return centreSelect?.selectedOptions?.[0]?.textContent?.trim()||'';
}

function setStatus(text,type=''){
  const node=document.getElementById('researchAssistantStatus');
  if(!node)return;
  node.textContent=text;
  node.className=`research-assistant-status${type?` ${type}`:''}`;
}

function renderTarget(){
  const node=document.getElementById('researchAssistantTarget');
  if(!node)return;
  const name=selectedPersonLabel();
  if(name){node.classList.remove('needs-selection');node.innerHTML=`<strong>${t('Researching:','Doen navorsing oor:')}</strong> ${esc(name)}<span>${t(' The search uses the genealogy already recorded for this person to look for matching online sources.',' Die soektog gebruik die genealogiese inligting wat reeds vir hierdie persoon aangeteken is om na ooreenstemmende aanlyn bronne te soek.')}</span>`;}
  else{node.classList.add('needs-selection');node.innerHTML=`<strong>${t('No person selected.','Geen persoon gekies nie.')}</strong><span>${t(' Click a person in the fan first.',' Klik eers op ’n persoon in die waaier.')}</span>`;}
}

function findingLabel(value){
  const labels={direct_record:[t('Direct record','Direkte rekord')],index_or_catalogue:[t('Index / catalogue','Indeks / katalogus')],supporting_context:[t('Supporting context','Ondersteunende konteks')],research_lead:[t('Research lead','Navorsingsleidraad')]};
  return labels[value]?.[0]||String(value||'').replaceAll('_',' ');
}
function renderRun(run,searchNotes=[]){
  const host=document.getElementById('researchAssistantResults');
  if(!host)return;
  const findings=Array.isArray(run?.findings)?run.findings:[];
  host.innerHTML=`
    <div class="research-assistant-summary"><p><strong>${t('Research summary','Navorsingsopsomming')}</strong><br>${esc(run?.summary||t('No summary returned.','Geen opsomming teruggestuur nie.'))}</p></div>
    ${findings.length?findings.map((item)=>{
      const url=safeUrl(item.source_url);
      return `<article class="research-finding"><h4>${esc(item.title||item.source_name||t('Research finding','Navorsingsbevinding'))}</h4><div class="research-finding-meta"><span>${esc(findingLabel(item.evidence_value))}</span><span>${Math.round(Number(item.confidence||0)*100)}% ${t('match confidence','ooreenstemmingsvertroue')}</span>${item.record_type?`<span>${esc(item.record_type)}</span>`:''}</div>${item.what_it_may_show?`<p><strong>${t('What it may show:','Wat dit moontlik wys:')}</strong> ${esc(item.what_it_may_show)}</p>`:''}${item.why_it_matches?`<p><strong>${t('Why it may match:','Waarom dit moontlik pas:')}</strong> ${esc(item.why_it_matches)}</p>`:''}${item.next_action?`<p><strong>${t('Next step:','Volgende stap:')}</strong> ${esc(item.next_action)}</p>`:''}${url?`<a class="button secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${t('Open source','Maak bron oop')}</a>`:''}</article>`;
    }).join(''):`<div class="research-assistant-summary"><p>${t('No sufficiently useful source matches were returned in this run. The search notes below may still help narrow the next attempt.','Geen voldoende nuttige bronooreenkomste is in hierdie soektog teruggestuur nie. Die soeknotas hieronder kan steeds help om die volgende poging te verfyn.')}</p></div>`}
    ${searchNotes.length?`<section class="research-assistant-search-notes"><h4>${t('Search notes','Soeknotas')}</h4><ul>${searchNotes.map((x)=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}`;
}

async function loadHistory(){
  const host=document.getElementById('researchAssistantHistory');
  if(!host)return;
  const personId=await resolveSelectedPersonId();
  if(!personId){host.innerHTML='';return;}
  const {data,error}=await supabase.from('research_assistant_runs').select('id,status,summary,created_at,completed_at').eq('target_person_id',personId).order('created_at',{ascending:false}).limit(4);
  if(error||!(data||[]).length){host.innerHTML='';return;}
  host.innerHTML=`<h4>${t('Recent research runs','Onlangse navorsingslopies')}</h4>${data.map((run)=>{const stale=run.status==='processing'&&(Date.now()-new Date(run.created_at).getTime()>3*60*1000);const status=stale?t('interrupted - safe to retry','onderbreek - veilig om weer te probeer'):run.status;return `<div class="research-history-item"><strong>${new Date(run.created_at).toLocaleString()}</strong> - ${esc(status)}${run.summary?`<br>${esc(String(run.summary).slice(0,260))}${String(run.summary).length>260?'...':''}`:''}</div>`;}).join('')}`;
}

async function invokeResearch(body){
  let timer;
  try{
    return await Promise.race([
      supabase.functions.invoke('genealogy-research-assistant',{body}),
      new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(new Error(t('The search took too long and was stopped safely. Please retry with a narrower question.','Die soektog het te lank geneem en is veilig gestop. Probeer weer met n smaller vraag.'))),CLIENT_TIMEOUT_MS);}),
    ]);
  }finally{window.clearTimeout(timer);}
}

async function runResearch(event){
  event.preventDefault();
  const personId=await resolveSelectedPersonId();
  if(!personId)return setStatus(t('Select a person in the family fan first.','Kies eers ’n persoon in die familiewaaier.'),'error');
  const target=(await people()).find(person=>person.id===personId);
  const targetName=target?displayName(target):selectedPersonLabel();
  if(possiblyLiving(target))return setStatus(t('The AI research assistant is disabled when a person is living or the record does not establish that they are deceased. You can still add family-supplied information through the ordinary contribution form.','Die KI-navorsingsassistent is afgeskakel wanneer iemand leef of die rekord nie aantoon dat die persoon oorlede is nie. Jy kan steeds familie-inligting deur die gewone bydraevorm byvoeg.'),'error');
  if(!window.confirm(t(`Start paid archive research for ${targetName}? Results will remain research leads until reviewed.`,`Begin betaalde argiefnavorsing vir ${targetName}? Resultate bly navorsingsleidrade totdat dit hersien is.`)))return;
  const question=document.getElementById('researchAssistantQuestion')?.value.trim()||'';
  const button=document.getElementById('researchAssistantRun');
  if(button){button.disabled=true;button.textContent=t('Searching records…','Soek rekords…');}
  setStatus(t('Searching online genealogy and archive sources. Results are research leads, not proof.','Soek aanlyn genealogie- en argiefbronne. Resultate is navorsingsleidrade en nie bewys nie.'));
  try{
    const {data,error}=await invokeResearch({person_id:personId,expected_person_name:targetName,question});
    if(error)throw error;
    if(data?.error)throw new Error(data.error);
    renderRun(data.run,data.search_notes||[]);
    setStatus(t('Research run saved. Review the sources before adding anything to the family record.','Navorsingslopie gestoor. Hersien die bronne voordat enigiets by die familierekord gevoeg word.'),'success');
    await loadHistory();
  }catch(error){
    let message=error?.message||t('The research search could not be completed.','Die navorsingsoektog kon nie voltooi word nie.');
    if(error?.context){try{const payload=await error.context.json();if(payload?.error)message=payload.error;}catch{/* no-op */}}
    setStatus(message,'error');
  }finally{
    if(button&&button.isConnected){button.disabled=false;button.textContent=t('Find records for this person','Vind rekords vir hierdie persoon');}
  }
}

function install(){
  const tabs=document.getElementById('contributionModeTabs');
  if(!tabs||!form||!typeSelect)return;
  installStyles();
  const oldUpload=tabs.querySelector('[data-mode="upload"]');
  if(oldUpload){oldUpload.dataset.mode='assist';oldUpload.textContent=t('Find records','Vind rekords');oldUpload.setAttribute('aria-label',t('Find online records for the selected person','Vind aanlyn rekords vir die gekose persoon'));}
  const sourceOption=[...typeSelect.options].find((option)=>option.value==='source');
  if(sourceOption)sourceOption.textContent=t('Photo, document or source (upload a record)','Foto, dokument of bron (laai ’n rekord op)');

  let panel=document.getElementById('researchAssistantPanel');
  if(!panel){
    panel=document.createElement('section');panel.id='researchAssistantPanel';panel.className='research-assistant-panel hidden';
    panel.innerHTML=`<div class="research-assistant-intro"><h3>${t('Let the archive help research this person','Laat die argief help om hierdie persoon na te vors')}</h3><p>${t('This searches the web using the selected person’s recorded names, dates, places and family connections. It looks for records, indexes, catalogues and useful archival leads. Results stay in the research layer until a person reviews and submits the supporting evidence.','Dit deursoek die web met die gekose persoon se aangetekende name, datums, plekke en familieverbintenisse. Dit soek rekords, indekse, katalogusse en nuttige argiefleidrade. Resultate bly in die navorsingslaag totdat ’n persoon dit hersien en die ondersteunende bewysmateriaal indien.')}</p></div><div id="researchAssistantTarget" class="research-assistant-target"></div><form id="researchAssistantForm" class="research-assistant-form"><label>${t('What would you especially like to find? (optional)','Wat wil jy veral vind? (opsioneel)')}<textarea id="researchAssistantQuestion" placeholder="${t('For example: look for baptism, parentage, estate, wartime or church records.','Byvoorbeeld: soek doop-, ouerskap-, boedel-, oorlogs- of kerkrekords.')}"></textarea></label><p class="research-assistant-note">${t('This uses paid API/web-search capacity belonging to the archive. It does not charge the family member using the page, and it never makes a source canonical automatically.','Dit gebruik die argief se betaalde API-/websoekkapasiteit. Dit hef nie die familielid wat die bladsy gebruik nie, en maak nooit ’n bron outomaties kanoniek nie.')}</p><button id="researchAssistantRun" class="button primary" type="submit">${t('Find records for this person','Vind rekords vir hierdie persoon')}</button><p id="researchAssistantStatus" class="research-assistant-status" aria-live="polite"></p></form><div id="researchAssistantResults" class="research-assistant-results"></div><section id="researchAssistantHistory" class="research-assistant-history"></section>`;
    form.insertAdjacentElement('afterend',panel);
    panel.querySelector('#researchAssistantForm')?.addEventListener('submit',runResearch);
  }

  tabs.addEventListener('click',(event)=>{
    const button=event.target.closest('[data-mode]');if(!button)return;
    const mode=button.dataset.mode;
    const researchHelp=document.getElementById('researchHelpPanel');
    if(mode==='assist'){
      form.classList.add('hidden');
      document.getElementById('contributionMessage')?.classList.add('hidden');
      researchHelp?.classList.add('hidden');
      panel.classList.remove('hidden');
      renderTarget();
      void loadHistory();
    }else{
      panel.classList.add('hidden');
      if(mode==='share'){form.classList.remove('hidden');document.getElementById('contributionMessage')?.classList.remove('hidden');}
    }
  });
  renderTarget();
}

function captureSelection(event){
  const node=event.target.closest?.('[data-person-id]');
  if(node?.dataset?.personId){selectedPersonId=node.dataset.personId;window.setTimeout(()=>{renderTarget();void loadHistory();},30);}
}
document.addEventListener('click',captureSelection,true);
centreSelect?.addEventListener('change',()=>{selectedPersonId=centreSelect.value||null;window.setTimeout(()=>{renderTarget();void loadHistory();},30);});
if(personName)new MutationObserver(()=>{if(!selectedPersonId)void resolveSelectedPersonId().then(()=>renderTarget());}).observe(personName,{childList:true,subtree:true,characterData:true});
document.addEventListener('genealogy:language-changed',()=>{const panel=document.getElementById('researchAssistantPanel');if(panel)panel.remove();const tab=document.getElementById('contributionModeTabs')?.querySelector('[data-mode="assist"]');if(tab)tab.dataset.mode='upload';window.setTimeout(install,10);});
document.addEventListener('genealogy:archive-ready',()=>window.setTimeout(install,20));
window.addEventListener('load',()=>window.setTimeout(install,20));
window.setTimeout(install,20);
