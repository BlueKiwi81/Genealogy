import { supabase } from './supabase-client-v1.js';

const appArea = document.getElementById('appArea');
const centreSelect = document.getElementById('centreSelect');
const DESKTOP = window.matchMedia('(min-width: 900px)');
const history = [];
let busy = false;
let pendingQuestion = '';
let currentTargetId = null;
let currentResearchQuestion = '';

function af(){return (window.GenealogyI18n?.language||document.documentElement.lang||'en')==='af';}
function t(en,afr){return af()?afr:en;}
function visibleApp(){return Boolean(appArea && !appArea.classList.contains('hidden') && DESKTOP.matches);}
function selectedLabel(){return centreSelect?.selectedOptions?.[0]?.textContent?.trim()||'';}
function wait(ms){return new Promise(resolve=>window.setTimeout(resolve,ms));}
async function waitFor(selector,attempts=30){for(let i=0;i<attempts;i+=1){const node=document.querySelector(selector);if(node)return node;await wait(80);}return null;}

function installStyles(){
  if(document.getElementById('familyBotV1Styles'))return;
  const style=document.createElement('style');
  style.id='familyBotV1Styles';
  style.textContent=`
    .family-bot-shell{position:fixed;left:20px;bottom:20px;z-index:1200;font-family:Arial,sans-serif;display:none}.family-bot-shell.ready{display:block}
    .family-bot-launcher{width:62px;height:62px;border-radius:50%;border:1px solid #8c7967;background:#4a3b2f;color:#fff;box-shadow:0 12px 28px rgba(47,37,29,.22);display:grid;place-items:center;cursor:pointer;padding:0;transition:transform .16s ease,box-shadow .16s ease}.family-bot-launcher:hover{transform:translateY(-2px);box-shadow:0 15px 32px rgba(47,37,29,.28)}.family-bot-launcher:focus-visible{outline:3px solid #d7b28f;outline-offset:3px}
    .k3-droid{position:relative;width:34px;height:38px}.k3-head{position:absolute;left:5px;top:2px;width:24px;height:15px;border:2px solid #fff;border-radius:9px 9px 5px 5px}.k3-head:before,.k3-head:after{content:"";position:absolute;top:5px;width:4px;height:4px;border-radius:50%;background:#fff}.k3-head:before{left:5px}.k3-head:after{right:5px}.k3-neck{position:absolute;left:15px;top:18px;width:4px;height:4px;background:#fff}.k3-body{position:absolute;left:7px;top:22px;width:20px;height:12px;border:2px solid #fff;border-radius:5px}.k3-body:after{content:"K3";position:absolute;inset:0;display:grid;place-items:center;font:800 6px/1 Arial,sans-serif;letter-spacing:.04em}.k3-foot{position:absolute;left:11px;top:35px;width:12px;border-top:2px solid #fff}
    .family-bot-panel{position:absolute;left:0;bottom:76px;width:min(410px,calc(100vw - 40px));height:min(590px,calc(100vh - 120px));display:none;grid-template-rows:auto auto 1fr auto;background:#fffaf3;border:1px solid #cdbdac;border-radius:18px;box-shadow:0 22px 55px rgba(46,36,28,.26);overflow:hidden}.family-bot-panel.open{display:grid}
    .family-bot-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;background:#4a3b2f;color:#fff}.family-bot-title{display:flex;align-items:center;gap:10px}.family-bot-mini{width:31px;height:31px;border:1px solid rgba(255,255,255,.65);border-radius:50%;display:grid;place-items:center;font:800 10px Arial,sans-serif}.family-bot-head strong{display:block;font-size:15px}.family-bot-head small{display:block;margin-top:2px;color:#e8ddd1;font-size:10px}.family-bot-close{border:0;background:transparent;color:#fff;font:700 20px/1 Arial,sans-serif;cursor:pointer;padding:6px;border-radius:8px}.family-bot-close:hover{background:rgba(255,255,255,.1)}
    .family-bot-context{display:flex;align-items:center;gap:7px;padding:9px 13px;border-bottom:1px solid #e5dbcf;background:#f8f1e8;color:#67594d;font:700 10px/1.3 Arial,sans-serif}.family-bot-context span{font-weight:500}.family-bot-dot{width:7px;height:7px;border-radius:50%;background:#6f8c62;flex:none}
    .family-bot-messages{overflow:auto;padding:14px;display:flex;flex-direction:column;gap:11px;overscroll-behavior:contain}.family-bot-message{max-width:90%;border-radius:14px;padding:10px 11px;font:12px/1.5 Arial,sans-serif;white-space:pre-wrap}.family-bot-message.user{align-self:flex-end;background:#4a3b2f;color:#fff;border-bottom-right-radius:4px}.family-bot-message.bot{align-self:flex-start;background:#f3ece3;color:#40362e;border-bottom-left-radius:4px}.family-bot-message.system{align-self:center;max-width:100%;background:#fff5df;color:#6c5737;border:1px solid #ead6ad;text-align:center;font-size:11px}.family-bot-message.loading{color:#796a5d;font-style:italic}
    .family-bot-answer-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:7px}.family-bot-target{font-weight:800;color:#392f28}.family-bot-confidence{padding:3px 6px;border-radius:999px;background:#e2d6c8;color:#625447;font:800 8px/1 Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em}.family-bot-answer-text{white-space:pre-wrap}.family-bot-basis{margin-top:9px;border-top:1px solid #ddd0c2;padding-top:7px}.family-bot-basis summary{cursor:pointer;font-weight:800;font-size:10px;color:#635448}.family-bot-basis ul{margin:7px 0 0;padding-left:17px}.family-bot-basis li{margin:5px 0;font-size:10px;line-height:1.4}.family-bot-basis-status{font-weight:800;text-transform:uppercase;font-size:8px;color:#79685a}.family-bot-followup{margin-top:8px;font-size:10px;color:#685a4e}
    .family-bot-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.family-bot-action,.family-bot-candidate,.family-bot-starter{border:1px solid #bda994;background:#fffaf3;color:#4b3c31;border-radius:999px;padding:7px 9px;font:800 9px/1.2 Arial,sans-serif;cursor:pointer}.family-bot-action.primary{background:#6f8c62;color:#fff;border-color:#6f8c62}.family-bot-action:hover,.family-bot-candidate:hover,.family-bot-starter:hover{filter:brightness(.97)}
    .family-bot-starters{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.family-bot-starter{font-weight:700;background:#fff}
    .family-bot-form{border-top:1px solid #e3d8cc;padding:10px;background:#fff;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.family-bot-input{resize:none;min-height:42px;max-height:112px;border:1px solid #cfc0b0;border-radius:12px;padding:9px 10px;font:12px/1.4 Arial,sans-serif;color:#3d342d;background:#fff}.family-bot-send{height:42px;min-width:56px;border:0;border-radius:12px;background:#4a3b2f;color:#fff;font:800 10px Arial,sans-serif;cursor:pointer}.family-bot-send:disabled{opacity:.5;cursor:default}
    @media(max-width:899px){.family-bot-shell{display:none!important}}
    @media(prefers-reduced-motion:reduce){.family-bot-launcher{transition:none}}
  `;
  document.head.appendChild(style);
}

function buildUi(){
  if(document.getElementById('familyBotShell'))return;
  installStyles();
  const shell=document.createElement('div');
  shell.id='familyBotShell';
  shell.className='family-bot-shell';
  shell.innerHTML=`
    <section id="familyBotPanel" class="family-bot-panel" role="dialog" aria-label="K-3 family archive assistant" aria-hidden="true">
      <header class="family-bot-head"><div class="family-bot-title"><span class="family-bot-mini">K-3</span><div><strong>K-3 Family Droid</strong><small>${t('Ask what the archive knows','Vra wat die argief weet')}</small></div></div><button id="familyBotClose" class="family-bot-close" type="button" aria-label="${t('Close K-3','Maak K-3 toe')}">x</button></header>
      <div id="familyBotContext" class="family-bot-context"><i class="family-bot-dot"></i><strong>${t('Current focus:','Huidige fokus:')}</strong> <span></span></div>
      <div id="familyBotMessages" class="family-bot-messages" aria-live="polite"></div>
      <form id="familyBotForm" class="family-bot-form"><textarea id="familyBotInput" class="family-bot-input" rows="2" maxlength="2500" placeholder="${t('Ask about someone in the family archive...','Vra oor iemand in die familie-argief...')}"></textarea><button id="familyBotSend" class="family-bot-send" type="submit">${t('Send','Stuur')}</button></form>
    </section>
    <button id="familyBotLauncher" class="family-bot-launcher" type="button" aria-label="${t('Ask K-3 about the family archive','Vra K-3 oor die familie-argief')}" aria-expanded="false"><span class="k3-droid" aria-hidden="true"><i class="k3-head"></i><i class="k3-neck"></i><i class="k3-body"></i><i class="k3-foot"></i></span></button>`;
  document.body.appendChild(shell);

  const messages=document.getElementById('familyBotMessages');
  const intro=document.createElement('div');
  intro.className='family-bot-message bot';
  intro.append(document.createTextNode(t('I answer from the family archive: people, claims, evidence and our current research frontier. I do not search the web unless you choose to hand a question to the research assistant.','Ek antwoord uit die familie-argief: persone, bewerings, bewysmateriaal en ons huidige navorsingsgrens. Ek deursoek nie die web tensy jy kies om die vraag aan die navorsingsassistent oor te dra.')));
  const starters=document.createElement('div');starters.className='family-bot-starters';
  [[t('What do we know about this person?','Wat weet ons van hierdie persoon?'),t('What do we know about this person?','Wat weet ons van hierdie persoon?')],[t('What is uncertain here?','Wat is hier onseker?'),t('What is uncertain about this person in the archive?','Wat is onseker oor hierdie persoon in die argief?')],[t('Which evidence supports this?','Watter bewyse ondersteun dit?'),t('What is the strongest evidence we have for this person and their main relationships?','Wat is die sterkste bewysmateriaal wat ons vir hierdie persoon en hul hoofverhoudings het?')]].forEach(([label,question])=>{const b=document.createElement('button');b.type='button';b.className='family-bot-starter';b.textContent=label;b.addEventListener('click',()=>ask(question));starters.appendChild(b);});
  intro.appendChild(starters);messages.appendChild(intro);

  document.getElementById('familyBotLauncher')?.addEventListener('click',togglePanel);
  document.getElementById('familyBotClose')?.addEventListener('click',()=>setOpen(false));
  document.getElementById('familyBotForm')?.addEventListener('submit',event=>{event.preventDefault();const input=document.getElementById('familyBotInput');const question=input?.value.trim();if(!question)return;if(input)input.value='';ask(question);});
  document.getElementById('familyBotInput')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();document.getElementById('familyBotForm')?.requestSubmit();}});
  centreSelect?.addEventListener('change',updateContext);
  updateVisibility();updateContext();
}

function setOpen(open){
  const panel=document.getElementById('familyBotPanel');const launcher=document.getElementById('familyBotLauncher');
  panel?.classList.toggle('open',open);panel?.setAttribute('aria-hidden',String(!open));launcher?.setAttribute('aria-expanded',String(open));
  if(open){updateContext();window.setTimeout(()=>document.getElementById('familyBotInput')?.focus(),30);}
}
function togglePanel(){setOpen(!document.getElementById('familyBotPanel')?.classList.contains('open'));}
function updateVisibility(){document.getElementById('familyBotShell')?.classList.toggle('ready',visibleApp());if(!visibleApp())setOpen(false);}
function updateContext(){const span=document.querySelector('#familyBotContext span');if(span)span.textContent=selectedLabel()||t('No person selected - name someone in your question','Geen persoon gekies nie - noem iemand in jou vraag');}
function scrollMessages(){const host=document.getElementById('familyBotMessages');if(host)host.scrollTop=host.scrollHeight;}
function addMessage(kind,text){const host=document.getElementById('familyBotMessages');if(!host)return null;const node=document.createElement('div');node.className=`family-bot-message ${kind}`;node.textContent=text;host.appendChild(node);scrollMessages();return node;}
function setBusy(value){busy=value;const send=document.getElementById('familyBotSend');const input=document.getElementById('familyBotInput');if(send)send.disabled=value;if(input)input.disabled=value;}

function renderAmbiguity(data,question){
  const host=document.getElementById('familyBotMessages');if(!host)return;
  const card=document.createElement('div');card.className='family-bot-message bot';card.append(document.createTextNode(data.message||t('Which person did you mean?','Watter persoon bedoel jy?')));
  const actions=document.createElement('div');actions.className='family-bot-actions';
  (data.candidates||[]).forEach(candidate=>{const button=document.createElement('button');button.type='button';button.className='family-bot-candidate';button.textContent=[candidate.name,candidate.years].filter(Boolean).join(' - ');button.addEventListener('click',()=>ask(question,candidate.id,true));actions.appendChild(button);});
  card.appendChild(actions);host.appendChild(card);scrollMessages();
}

function renderAnswer(data){
  const host=document.getElementById('familyBotMessages');if(!host)return;
  currentTargetId=data.target?.id||null;currentResearchQuestion=data.answer?.research_question||'';
  const card=document.createElement('div');card.className='family-bot-message bot';
  const head=document.createElement('div');head.className='family-bot-answer-head';
  const target=document.createElement('span');target.className='family-bot-target';target.textContent=data.target?.name||'K-3';head.appendChild(target);
  if(data.answer?.confidence){const badge=document.createElement('span');badge.className='family-bot-confidence';badge.textContent=data.answer.confidence.replaceAll('_',' ');head.appendChild(badge);}
  card.appendChild(head);
  const text=document.createElement('div');text.className='family-bot-answer-text';text.textContent=data.answer?.answer||'';card.appendChild(text);
  const basis=Array.isArray(data.answer?.basis)?data.answer.basis:[];
  if(basis.length){const details=document.createElement('details');details.className='family-bot-basis';const summary=document.createElement('summary');summary.textContent=t('Why K-3 says this','Waarom K-3 dit se');details.appendChild(summary);const list=document.createElement('ul');basis.forEach(item=>{const li=document.createElement('li');const status=document.createElement('span');status.className='family-bot-basis-status';status.textContent=`${item.status||'archive'}: `;li.append(status,document.createTextNode(`${item.label||''}${item.detail?` - ${item.detail}`:''}`));list.appendChild(li);});details.appendChild(list);card.appendChild(details);}
  if(data.answer?.follow_up){const follow=document.createElement('div');follow.className='family-bot-followup';follow.textContent=data.answer.follow_up;card.appendChild(follow);}
  if(data.answer?.offer_research&&currentResearchQuestion){const actions=document.createElement('div');actions.className='family-bot-actions';const button=document.createElement('button');button.type='button';button.className='family-bot-action primary';button.textContent=t('Research this question','Research this question');button.addEventListener('click',handoffToResearch);actions.appendChild(button);card.appendChild(actions);}
  host.appendChild(card);scrollMessages();
}

async function ask(question,personId='',silentUser=false){
  if(busy||!question)return;
  setOpen(true);pendingQuestion=question;
  if(!silentUser){addMessage('user',question);history.push({role:'user',text:question});}
  setBusy(true);const loading=addMessage('bot loading',t('K-3 is checking the archive...','K-3 kyk deur die argief...'));
  try{
    const {data,error}=await supabase.functions.invoke('genealogy-family-bot',{body:{question,person_id:personId||undefined,selected_person_id:centreSelect?.value||undefined,conversation:history.slice(-6)}});
    loading?.remove();
    if(error){let message=error.message||t('K-3 could not reach the archive.','K-3 kon nie die argief bereik nie.');if(error.context){try{const payload=await error.context.json();if(payload?.error)message=payload.error;}catch{/* no-op */}}throw new Error(message);}
    if(data?.error)throw new Error(data.error);
    if(data?.status==='ambiguous_person'){renderAmbiguity(data,question);return;}
    if(data?.status==='needs_person'||data?.status==='privacy_limited'){addMessage('bot',data.message||t('I need a little more context.','Ek het nog n bietjie konteks nodig.'));return;}
    if(data?.status==='answered'){
      renderAnswer(data);history.push({role:'assistant',text:data.answer?.answer||''});
      return;
    }
    addMessage('bot',t('I could not turn that into an archive answer yet. Try naming the person more specifically.','Ek kon dit nog nie in n argiefantwoord omskep nie. Noem die persoon meer spesifiek.'));
  }catch(error){loading?.remove();addMessage('system',error?.message||t('K-3 could not answer right now.','K-3 kon nie nou antwoord nie.'));}
  finally{setBusy(false);}
}

async function handoffToResearch(){
  if(!currentTargetId||!currentResearchQuestion)return;
  const targetId=currentTargetId;const question=currentResearchQuestion;
  if(centreSelect&&[...centreSelect.options].some(option=>option.value===targetId)){centreSelect.value=targetId;centreSelect.dispatchEvent(new Event('change',{bubbles:true}));}
  const workbench=await waitFor('#contributionWorkbench');if(workbench&&'open' in workbench)workbench.open=true;
  const assistTab=await waitFor('#contributionModeTabs [data-mode="assist"]');assistTab?.click();
  const textarea=await waitFor('#researchAssistantQuestion');
  if(!textarea){addMessage('system',t('I could not open the research assistant automatically. The research question is still in this conversation.','Ek kon nie die navorsingsassistent outomaties oopmaak nie. Die navorsingsvraag is steeds in hierdie gesprek.'));return;}
  textarea.value=question;textarea.dispatchEvent(new Event('input',{bubbles:true}));textarea.dispatchEvent(new Event('change',{bubbles:true}));
  setOpen(false);workbench?.scrollIntoView({behavior:'smooth',block:'start'});window.setTimeout(()=>textarea.focus(),500);
}

if(appArea){new MutationObserver(updateVisibility).observe(appArea,{attributes:true,attributeFilter:['class']});}
DESKTOP.addEventListener?.('change',updateVisibility);
document.addEventListener('genealogy:archive-ready',()=>{buildUi();updateVisibility();updateContext();});
document.addEventListener('genealogy:language-changed',()=>{updateContext();});
buildUi();
