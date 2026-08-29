function af(){return (window.GenealogyI18n?.language||document.documentElement.lang||'en')==='af';}
function t(en,afr){return af()?afr:en;}

let progressTimers=[];

function clearProgressTimers(){
  progressTimers.forEach((timer)=>window.clearTimeout(timer));
  progressTimers=[];
}

function installProgressStyles(){
  if(document.getElementById('researchAssistantProgressStyles'))return;
  const style=document.createElement('style');
  style.id='researchAssistantProgressStyles';
  style.textContent=`
    .research-assistant-status.working{display:flex;align-items:center;gap:9px;min-height:20px;padding:9px 11px;border:1px solid #c8d8bd;border-radius:10px;background:#f3f7ef;color:#315f38}
    .research-assistant-spinner{width:16px;height:16px;box-sizing:border-box;border:2px solid #c8d8bd;border-top-color:#315f38;border-radius:50%;flex:0 0 16px;animation:research-assistant-spin .8s linear infinite}
    @keyframes research-assistant-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.research-assistant-spinner{animation-duration:1.6s}}
  `;
  document.head.appendChild(style);
}

function showWorking(message){
  const status=document.getElementById('researchAssistantStatus');
  if(!status)return;
  status.className='research-assistant-status working';
  status.innerHTML='<span class="research-assistant-spinner" aria-hidden="true"></span><span></span>';
  const text=status.lastElementChild;
  if(text)text.textContent=message;
}

function startProgress(button){
  clearProgressTimers();
  const panel=document.getElementById('researchAssistantPanel');
  button.setAttribute('aria-busy','true');
  panel?.setAttribute('aria-busy','true');
  showWorking(t(
    'Searching online genealogy and archive sources. This can take a little while.',
    "Soek aanlyn genealogie- en argiefbronne. Dit kan 'n rukkie neem."
  ));
  progressTimers.push(window.setTimeout(()=>showWorking(t(
    'Research is still running. Some record searches take a little longer.',
    "Die navorsing loop nog. Sommige rekordsoektogte neem 'n bietjie langer."
  )),15000));
  progressTimers.push(window.setTimeout(()=>showWorking(t(
    'Still working. The search is continuing.',
    'Nog besig. Die soektog gaan voort.'
  )),45000));
  progressTimers.push(window.setTimeout(()=>showWorking(t(
    'Still working. Please keep this page open while the research completes.',
    'Nog besig. Hou asseblief hierdie bladsy oop terwyl die navorsing voltooi word.'
  )),85000));
}

function stopProgress(button){
  clearProgressTimers();
  button.setAttribute('aria-busy','false');
  document.getElementById('researchAssistantPanel')?.setAttribute('aria-busy','false');
  document.getElementById('researchAssistantStatus')?.classList.remove('working');
}

function bindProgress(){
  installProgressStyles();
  const button=document.getElementById('researchAssistantRun');
  if(!button||button.dataset.progressBound==='1')return;
  button.dataset.progressBound='1';
  let running=button.disabled;
  if(running)startProgress(button);
  const sync=()=>{
    const next=button.disabled;
    if(next===running)return;
    running=next;
    if(running)startProgress(button);
    else stopProgress(button);
  };
  new MutationObserver(sync).observe(button,{attributes:true,attributeFilter:['disabled']});
}

new MutationObserver(()=>window.requestAnimationFrame(bindProgress)).observe(document.body,{childList:true,subtree:true});
document.addEventListener('genealogy:archive-ready',bindProgress);
document.addEventListener('genealogy:language-changed',()=>window.setTimeout(bindProgress,20));
window.addEventListener('load',bindProgress);
bindProgress();
