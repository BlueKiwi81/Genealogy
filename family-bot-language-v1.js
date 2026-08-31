import { supabase } from './supabase-client-v1.js';

function isAfrikaansUi(){return (window.GenealogyI18n?.language||document.documentElement.lang||'en')==='af';}
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

// Keep the language behaviour at the request boundary only. Do not observe or
// rewrite K-3's DOM: doing so can create a self-triggering MutationObserver loop
// and starve the browser's main thread.
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
