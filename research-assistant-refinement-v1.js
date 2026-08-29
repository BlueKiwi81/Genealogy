const tabs = () => document.getElementById('contributionModeTabs');
const form = document.getElementById('contributionForm');
const typeSelect = document.getElementById('contributionType');
const contributionText = document.getElementById('contributionText');

function af(){return (window.GenealogyI18n?.language||document.documentElement.lang||'en')==='af';}
function t(en,afr){return af()?afr:en;}

function activateShareUpload(card){
  const share = tabs()?.querySelector('[data-mode="share"]');
  const assistant = document.getElementById('researchAssistantPanel');
  const researchHelp = document.getElementById('researchHelpPanel');
  const link = card?.querySelector('a[href^="https://"]');
  const title = card?.querySelector('h4')?.textContent?.trim() || t('Research assistant source','Navorsingsassistent-bron');
  const url = link?.href || '';

  tabs()?.querySelectorAll('[data-mode]').forEach((button)=>{
    const active = button === share;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  });
  assistant?.classList.add('hidden');
  researchHelp?.classList.add('hidden');
  form?.classList.remove('hidden');
  document.getElementById('contributionMessage')?.classList.remove('hidden');

  if(typeSelect){
    typeSelect.value='source';
    typeSelect.dispatchEvent(new Event('change',{bubbles:true}));
  }
  if(contributionText){
    const carried = af()
      ? `Navorsingsassistent-bron: ${title}${url?`\nBron: ${url}`:''}\n\nEk het die oorspronklike rekord nagegaan/afgelaai en heg dit hieronder aan vir bewys-hersiening.`
      : `Research assistant source: ${title}${url?`\nSource: ${url}`:''}\n\nI inspected/downloaded the original record and am attaching it below for evidence review.`;
    contributionText.value = carried;
    contributionText.dispatchEvent(new Event('input',{bubbles:true}));
  }
  window.setTimeout(()=>{
    document.getElementById('sourceUploadArea')?.scrollIntoView({behavior:'smooth',block:'center'});
    document.getElementById('sourceFiles')?.focus();
  },60);
}

function enhanceFinding(card){
  if(!(card instanceof Element)||card.dataset.sourceHandoff==='1')return;
  card.dataset.sourceHandoff='1';
  const sourceLink=card.querySelector('a[href^="https://"]');
  if(sourceLink){
    // External genealogy databases must never replace the family archive tab.
    sourceLink.setAttribute('target','_blank');
    sourceLink.setAttribute('rel','noopener noreferrer');
    sourceLink.setAttribute('aria-label',`${sourceLink.textContent?.trim()||t('Open source','Maak bron oop')} — ${t('opens in a new tab','maak in ’n nuwe oortjie oop')}`);
  }
  const actions=document.createElement('div');
  actions.className='research-finding-actions';
  if(sourceLink)actions.appendChild(sourceLink);
  const handoff=document.createElement('button');
  handoff.type='button';
  handoff.className='button ghost research-source-handoff';
  handoff.textContent=t('I found / downloaded this record','Ek het hierdie rekord gevind / afgelaai');
  handoff.addEventListener('click',()=>activateShareUpload(card));
  actions.appendChild(handoff);
  card.appendChild(actions);
}

function enhanceAssistant(){
  const panel=document.getElementById('researchAssistantPanel');
  if(!panel)return;
  if(!document.getElementById('researchAssistantWorkflowNote')){
    const note=document.createElement('div');
    note.id='researchAssistantWorkflowNote';
    note.className='research-assistant-workflow-note';
    note.innerHTML=af()
      ? `<strong>Wanneer ’n bron gevind word</strong><p>Maak die eksterne bron in ’n nuwe oortjie oop. Meld daar aan indien die bron dit vereis, ondersoek die rekord en laai die oorspronklike beeld of dokument af waar dit toegelaat word. Keer dan hierheen terug en gebruik <em>Ek het hierdie rekord gevind / afgelaai</em> om dit deur die gewone private bewys-hersieningsproses op te laai. Jy kan ook die vraag hierbo verfyn en weer soek.</p>`
      : `<strong>When a source is found</strong><p>Open the external source in a new tab. Sign in there if the provider requires it, inspect the record and download the original image or document where permitted. Then return here and use <em>I found / downloaded this record</em> to send it through the normal private evidence-review workflow. You can also refine the question above and search again.</p>`;
    panel.querySelector('.research-assistant-intro')?.insertAdjacentElement('afterend',note);
  }
  panel.querySelectorAll('.research-finding').forEach(enhanceFinding);
}

function enforceShareForSource(){
  if(typeSelect?.value!=='source')return;
  const panel=document.getElementById('researchAssistantPanel');
  if(panel&&!panel.classList.contains('hidden'))return;
  tabs()?.querySelectorAll('[data-mode]').forEach((button)=>{
    const active=button.dataset.mode==='share';
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  });
}

function installStyles(){
  if(document.getElementById('researchAssistantRefinementStyles'))return;
  const style=document.createElement('style');
  style.id='researchAssistantRefinementStyles';
  style.textContent=`
    .research-finding-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.research-finding-actions .button{margin-top:0}
    .research-assistant-workflow-note{padding:11px 13px;border-radius:11px;background:#eef4e9;border:1px solid #c8d8bd;color:#51483f;font:.78rem/1.48 Arial,sans-serif}.research-assistant-workflow-note strong{display:block;margin-bottom:3px;color:#315f38}.research-assistant-workflow-note p{margin:0}
    @media(max-width:620px){.research-finding-actions .button{width:100%;justify-content:center}}
  `;
  document.head.appendChild(style);
}

installStyles();
new MutationObserver(()=>window.requestAnimationFrame(enhanceAssistant)).observe(document.body,{childList:true,subtree:true});
typeSelect?.addEventListener('change',()=>window.setTimeout(enforceShareForSource,0));
document.addEventListener('genealogy:archive-ready',enhanceAssistant);
document.addEventListener('genealogy:language-changed',()=>{
  document.getElementById('researchAssistantWorkflowNote')?.remove();
  document.querySelectorAll('.research-finding').forEach((card)=>{delete card.dataset.sourceHandoff;card.querySelector('.research-finding-actions')?.remove();});
  window.setTimeout(enhanceAssistant,20);
});
window.addEventListener('load',enhanceAssistant);
enhanceAssistant();
