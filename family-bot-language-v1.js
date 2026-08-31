import { supabase } from './supabase-client-v1.js';

function isAfrikaansUi(){return (window.GenealogyI18n?.language||document.documentElement.lang||'en')==='af';}
function t(en,af){return isAfrikaansUi()?af:en;}
function questionLanguage(text){
  const value=String(text||'').toLowerCase();
  const afHits=(value.match(/\b(wat|wie|waar|wanneer|waarom|hoekom|gebore|oorlede|ouers|vader|moeder|bewys|bewyse|bewysmateriaal|navors|onseker|waarskynlik|familie)\b/g)||[]).length;
  const enHits=(value.match(/\b(what|who|where|when|why|born|died|parents|father|mother|evidence|research|uncertain|probably|family)\b/g)||[]).length;
  if(afHits>=2&&afHits>enHits)return 'af';
  if(enHits>=2&&enHits>afHits)return 'en';
  return isAfrikaansUi()?'af':'en';
}

function languageNote(lang){
  return lang==='af'
    ? '\n\n[Taalvoorkeur: Antwoord asseblief volledig en natuurlik in Afrikaans. Hierdie taalnota is nie genealogiese bewysmateriaal nie en moet nie in die bewysbasis of navorsingsvraag herhaal word nie.]'
    : '\n\n[Language preference: Please answer fully and naturally in English. This language note is not genealogical evidence and must not be repeated in the evidence basis or research question.]';
}

function localisePayload(data,lang){
  if(!data||lang!=='af')return data;
  if(data.status==='ambiguous_person')data.message='Ek het meer as een waarskynlike persoon gevind. Watter een bedoel jy?';
  if(data.status==='needs_person')data.message='Ek kan nog nie met genoeg sekerheid bepaal oor wie die vraag gaan nie. Kies n persoon in Vind en fokus, of noem die persoon in jou vraag.';
  if(data.status==='privacy_limited')data.message='K-3 stuur nie n lewende familielid se persoonlike profiel na die argief-KI nie. Jy kan steeds na daardie persoon navigeer, maar besonderhede oor lewende persone bly in die gewone familieprofiel.';
  return data;
}

if(!window.__genealogyFamilyBotLanguageBridge){
  window.__genealogyFamilyBotLanguageBridge=true;
  const nativeInvoke=supabase.functions.invoke.bind(supabase.functions);
  supabase.functions.invoke=async(functionName,options={})=>{
    if(functionName!=='genealogy-family-bot')return nativeInvoke(functionName,options);
    const originalQuestion=String(options?.body?.question||'').trim();
    const lang=questionLanguage(originalQuestion);
    const body={...(options?.body||{}),language:lang};
    if(originalQuestion)body.question=`${originalQuestion}${languageNote(lang)}`;
    const result=await nativeInvoke(functionName,{...options,body});
    if(result?.data)localisePayload(result.data,lang);
    return result;
  };
}

const confidence={
  en:{documented:'documented',strong:'strong',probable:'probable',hypothesis:'hypothesis',unresolved:'unresolved',mixed:'mixed'},
  af:{documented:'gedokumenteer',strong:'sterk',probable:'waarskynlik',hypothesis:'hipotese',unresolved:'onopgelos',mixed:'gemeng'},
};

function canonicalConfidence(text){
  const value=String(text||'').trim().toLowerCase();
  for(const key of Object.keys(confidence.en))if(value===confidence.en[key]||value===confidence.af[key])return key;
  return '';
}

function localiseUi(){
  const shell=document.getElementById('familyBotShell');
  if(!shell)return;
  const panel=document.getElementById('familyBotPanel');
  panel?.setAttribute('aria-label',t('K-3 family archive assistant','K-3 familieargief-assistent'));
  const title=shell.querySelector('.family-bot-title strong');if(title)title.textContent=t('K-3 Family Droid','K-3 Familiedroid');
  const subtitle=shell.querySelector('.family-bot-title small');if(subtitle)subtitle.textContent=t('Ask what the archive knows','Vra wat die argief weet');
  const close=document.getElementById('familyBotClose');close?.setAttribute('aria-label',t('Close K-3','Maak K-3 toe'));
  const focus=shell.querySelector('#familyBotContext strong');if(focus)focus.textContent=t('Current focus:','Huidige fokus:');
  const input=document.getElementById('familyBotInput');if(input)input.placeholder=t('Ask about someone in the family archive...','Vra oor iemand in die familie-argief...');
  const send=document.getElementById('familyBotSend');if(send&&!send.disabled)send.textContent=t('Send','Stuur');
  document.getElementById('familyBotLauncher')?.setAttribute('aria-label',t('Ask K-3 about the family archive','Vra K-3 oor die familie-argief'));

  const intro=shell.querySelector('#familyBotMessages > .family-bot-message.bot:first-child');
  if(intro?.firstChild?.nodeType===Node.TEXT_NODE)intro.firstChild.nodeValue=t(
    'I answer from the family archive: people, claims, evidence and our current research frontier. I do not search the web unless you choose to hand a question to the research assistant.',
    'Ek antwoord uit die familie-argief: persone, bewerings, bewysmateriaal en ons huidige navorsingsgrens. Ek deursoek nie die web tensy jy kies om die vraag aan die navorsingsassistent oor te dra.'
  );
  const starters=[...shell.querySelectorAll('.family-bot-starter')];
  if(starters[0])starters[0].textContent=t('What do we know about this person?','Wat weet ons van hierdie persoon?');
  if(starters[1])starters[1].textContent=t('What is uncertain here?','Wat is hier onseker?');
  if(starters[2])starters[2].textContent=t('Which evidence supports this?','Watter bewyse ondersteun dit?');

  shell.querySelectorAll('.family-bot-action.primary').forEach(button=>{button.textContent=t('Research this question','Navors hierdie vraag');});
  shell.querySelectorAll('.family-bot-basis summary').forEach(node=>{node.textContent=t('Why K-3 says this','Waarom K-3 dit se');});
  shell.querySelectorAll('.family-bot-confidence').forEach(node=>{const key=canonicalConfidence(node.textContent);if(key)node.textContent=isAfrikaansUi()?confidence.af[key]:confidence.en[key];});
  const context=shell.querySelector('#familyBotContext span');
  if(context&&!context.textContent?.trim())context.textContent=t('No person selected - name someone in your question','Geen persoon gekies nie - noem iemand in jou vraag');
}

let observed=null;
function observe(){
  const host=document.getElementById('familyBotMessages');
  if(!host||host===observed)return;
  observed=host;
  new MutationObserver(()=>localiseUi()).observe(host,{childList:true,subtree:true});
}
function settle(){window.setTimeout(()=>{localiseUi();observe();},30);}

document.addEventListener('genealogy:archive-ready',settle);
document.addEventListener('genealogy:language-changed',settle);
window.addEventListener('load',settle);
new MutationObserver(settle).observe(document.body,{childList:true,subtree:false});
settle();
