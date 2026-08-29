import { supabase } from './supabase-client-v1.js';

const form = document.getElementById('contributionForm');
const oldType = document.getElementById('contributionType');
const oldLanguage = document.getElementById('language');
const textArea = document.getElementById('contributionText');
const message = document.getElementById('contributionMessage');
const centreSelect = document.getElementById('centreSelect');
const personName = document.getElementById('personName');
const personDetails = document.getElementById('personDetails');

const MAX_FILES = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_VOICE_SECONDS = 5 * 60;
const ALLOWED_EXTENSIONS = new Set(['pdf','jpg','jpeg','png','webp','heic','heif','tif','tiff']);
const CATEGORIES = [
  ['story','Story or recollection','Storie of herinnering'],
  ['nickname','Nickname / known as','Bynaam / bekend as'],
  ['correction','Correction','Regstelling'],
  ['date','Date','Datum'],
  ['place','Place','Plek'],
  ['relationship','Relationship','Verwantskap'],
  ['new_person','New person','Nuwe persoon'],
  ['source','Photo, document or source','Foto, dokument of bron'],
  ['other','Other','Ander'],
];

let currentTargetId = null;
let pendingRows = [];
let sessionUserId = null;
let renderTimer = null;
let recordedVoice = null;
let voiceRecorder = null;
let voiceStream = null;
let voiceTimer = null;
let voiceStartedAt = 0;

function af() { return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af'; }
function t(en, afText) { return af() ? afText : en; }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function setMessage(text='', type='') { if (!message) return; message.textContent=text; message.className=`message${type?` ${type}`:''}`; }
function extensionOf(name) { const parts=String(name||'').toLowerCase().split('.'); return parts.length>1?parts.pop():''; }
function safeName(name) { return String(name||'record').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(-120)||'record'; }
function titleFrom(description, filename) { return (String(description||'').split(/\r?\n/).map(v=>v.trim()).find(Boolean)||filename||'Family source').slice(0,180); }
function ancestrySurname(person) { return person?.birth_surname?.trim()||person?.surname?.trim()||person?.current_surname?.trim()||''; }
function canonicalName(person) { return [person?.given_names?.trim(),ancestrySurname(person)].filter(Boolean).join(' '); }
function displayName(person) { return [person?.preferred_name?.trim()||person?.given_names?.trim(),ancestrySurname(person)].filter(Boolean).join(' '); }
function selectedPersonName() { const value=personName?.textContent?.trim()||''; return value&&value!==t('Choose a person','Kies ’n persoon')?value:''; }

async function selectedPersonId() {
  if (currentTargetId) return currentTargetId;
  const displayed = selectedPersonName();
  if (displayed) {
    const { data, error } = await supabase.from('people').select('id,given_names,preferred_name,surname,birth_surname,current_surname');
    if (!error) {
      const matches=(data||[]).filter(p=>canonicalName(p)===displayed||displayName(p)===displayed);
      if (matches.length===1) return matches[0].id;
    }
  }
  return centreSelect?.value||null;
}

function categoryValues() { return [...document.querySelectorAll('input[name="contributionCategory"]:checked')].map(x=>x.value); }
function categoryLabel(value) { const item=CATEGORIES.find(([v])=>v===value); return item ? (af()?item[2]:item[1]) : value.replaceAll('_',' '); }

function installUi() {
  if (!form || document.getElementById('contributionCategoryPicker')) return;
  const oldTypeLabel=document.querySelector('label[for="contributionType"]');
  const oldLanguageLabel=document.querySelector('label[for="language"]');
  oldTypeLabel?.classList.add('hidden'); oldType?.classList.add('hidden');
  oldLanguageLabel?.classList.add('hidden'); oldLanguage?.classList.add('hidden');

  const picker=document.createElement('fieldset');
  picker.id='contributionCategoryPicker';
  picker.className='contribution-category-picker';
  picker.innerHTML=`<legend>${t('What are you adding? Tick everything that applies.','Wat voeg jy by? Merk alles wat van toepassing is.')}</legend><div class="contribution-category-grid">${CATEGORIES.map(([value,en,afr])=>`<label class="contribution-category-chip"><input type="checkbox" name="contributionCategory" value="${value}" /><span>${esc(af()?afr:en)}</span></label>`).join('')}</div>`;

  const languageWrap=document.createElement('label');
  languageWrap.className='contribution-language-field';
  languageWrap.innerHTML=`<span>${t('Language of this information','Taal van hierdie inligting')}</span><select id="contributionLanguageSelect"><option value="en">English</option><option value="af">Afrikaans</option></select>`;
  languageWrap.querySelector('select').value=af()?'af':'en';

  const guide=document.getElementById('contributionGuide');
  (guide||form.firstElementChild)?.insertAdjacentElement('afterend',picker);
  picker.insertAdjacentElement('afterend',languageWrap);

  document.querySelectorAll('input[name="contributionCategory"]').forEach(cb=>cb.addEventListener('change',syncSourceArea));
  syncSourceArea();
}

function syncLabels() {
  const legend=document.querySelector('#contributionCategoryPicker legend');
  if (legend) legend.textContent=t('What are you adding? Tick everything that applies.','Wat voeg jy by? Merk alles wat van toepassing is.');
  document.querySelectorAll('.contribution-category-chip').forEach((label,index)=>{ const span=label.querySelector('span'); const item=CATEGORIES[index]; if(span&&item) span.textContent=af()?item[2]:item[1]; });
  const langLabel=document.querySelector('.contribution-language-field > span');
  if(langLabel) langLabel.textContent=t('Language of this information','Taal van hierdie inligting');
  const select=document.getElementById('contributionLanguageSelect'); if(select&&!select.dataset.touched) select.value=af()?'af':'en';
  renderPending();
}

function syncSourceArea() {
  const sourceArea=document.getElementById('sourceUploadArea');
  const sourceSelected=categoryValues().includes('source');
  const storySelected=categoryValues().includes('story');
  sourceArea?.classList.toggle('hidden',!sourceSelected);
  document.getElementById('voiceStoryArea')?.classList.toggle('hidden',!storySelected);
  if(textArea) textArea.placeholder=sourceSelected
    ? t('Describe what you are adding and what you believe the record or photograph shows.','Beskryf wat jy byvoeg en wat jy glo die rekord of foto toon.')
    : storySelected
      ? t('Add any context you remember. This can be brief when a voice recording is attached.','Voeg enige konteks by wat jy onthou. Dit kan kort wees wanneer n stemopname aangeheg is.')
      : t('Tell us the information in your own words.','Vertel ons die inligting in jou eie woorde.');
}

function voiceMimeType() {
  if (!window.MediaRecorder) return '';
  return ['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm']
    .find(type => MediaRecorder.isTypeSupported?.(type)) || '';
}

function voiceExtension(type) {
  if (/mp4|m4a/i.test(type)) return 'm4a';
  if (/ogg/i.test(type)) return 'ogg';
  if (/mpeg|mp3/i.test(type)) return 'mp3';
  return 'webm';
}

function voiceClock(seconds) {
  const safe=Math.max(0,Math.min(MAX_VOICE_SECONDS,Math.floor(seconds||0)));
  return `${Math.floor(safe/60)}:${String(safe%60).padStart(2,'0')}`;
}

function stopVoiceTracks() {
  voiceStream?.getTracks?.().forEach(track=>track.stop());
  voiceStream=null;
}

function stopVoiceTimer() {
  window.clearInterval(voiceTimer);
  voiceTimer=null;
}

function setVoiceStatus(text='',type='') {
  const node=document.getElementById('voiceStoryStatus');
  if(!node)return;
  node.textContent=text;
  node.className=`message${type?` ${type}`:''}`;
}

function renderRecordedVoice() {
  const preview=document.getElementById('voiceStoryPreview');
  const audio=document.getElementById('voiceStoryPlayback');
  const meta=document.getElementById('voiceStoryMeta');
  if(!preview||!audio||!meta)return;
  preview.classList.toggle('hidden',!recordedVoice);
  if(!recordedVoice){audio.removeAttribute('src');audio.load();meta.textContent='';return;}
  audio.src=recordedVoice.url;
  meta.textContent=t(`${voiceClock(recordedVoice.duration)} recording ready to submit.`,`Opname van ${voiceClock(recordedVoice.duration)} gereed om in te dien.`);
}

function clearRecordedVoice() {
  if(recordedVoice?.url)URL.revokeObjectURL(recordedVoice.url);
  recordedVoice=null;
  const input=document.getElementById('voiceStoryFile');if(input)input.value='';
  renderRecordedVoice();
  setVoiceStatus();
}

async function startVoiceRecording() {
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
    document.getElementById('voiceStoryFile')?.click();
    return;
  }
  try{
    clearRecordedVoice();
    voiceStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
    const mimeType=voiceMimeType();
    const options={audioBitsPerSecond:64000};if(mimeType)options.mimeType=mimeType;
    voiceRecorder=new MediaRecorder(voiceStream,options);
    const chunks=[];
    voiceRecorder.addEventListener('dataavailable',event=>{if(event.data?.size)chunks.push(event.data);});
    voiceRecorder.addEventListener('stop',()=>{
      stopVoiceTimer();stopVoiceTracks();
      const type=voiceRecorder?.mimeType||mimeType||chunks[0]?.type||'audio/webm';
      const blob=new Blob(chunks,{type});
      const duration=Math.min(MAX_VOICE_SECONDS,Math.max(1,Math.round((Date.now()-voiceStartedAt)/1000)));
      voiceRecorder=null;
      if(!blob.size){setVoiceStatus(t('No audio was captured. Please try again.','Geen klank is opgeneem nie. Probeer asseblief weer.'),'error');return;}
      if(blob.size>MAX_BYTES){setVoiceStatus(t('The recording is larger than 15 MB. Please make a shorter recording.','Die opname is groter as 15 MB. Maak asseblief n korter opname.'),'error');return;}
      const filename=`family-story-${new Date().toISOString().replace(/[:.]/g,'-')}.${voiceExtension(type)}`;
      recordedVoice={blob,name:filename,type,duration,url:URL.createObjectURL(blob)};
      document.getElementById('voiceStoryRecord')?.classList.remove('hidden');
      document.getElementById('voiceStoryStop')?.classList.add('hidden');
      renderRecordedVoice();
      setVoiceStatus(t('Recording saved on this device and ready to submit.','Opname op hierdie toestel gestoor en gereed om in te dien.'),'success');
    },{once:true});
    voiceStartedAt=Date.now();
    voiceRecorder.start(1000);
    document.getElementById('voiceStoryRecord')?.classList.add('hidden');
    document.getElementById('voiceStoryStop')?.classList.remove('hidden');
    const timer=document.getElementById('voiceStoryTimer');if(timer)timer.textContent=`0:00 / ${voiceClock(MAX_VOICE_SECONDS)}`;
    setVoiceStatus(t('Recording. Speak naturally; you can stop at any time.','Neem op. Praat natuurlik; jy kan enige tyd stop.'));
    voiceTimer=window.setInterval(()=>{
      const elapsed=Math.floor((Date.now()-voiceStartedAt)/1000);
      if(timer)timer.textContent=`${voiceClock(elapsed)} / ${voiceClock(MAX_VOICE_SECONDS)}`;
      if(elapsed>=MAX_VOICE_SECONDS&&voiceRecorder?.state==='recording')voiceRecorder.stop();
    },250);
  }catch(error){stopVoiceTimer();stopVoiceTracks();voiceRecorder=null;setVoiceStatus(error?.name==='NotAllowedError'?t('Microphone access was not allowed. You can choose an existing voice file instead.','Mikrofoontoegang is nie toegelaat nie. Jy kan eerder n bestaande stemleer kies.'):error?.message||t('The recording could not start.','Die opname kon nie begin nie.'),'error');}
}

function stopVoiceRecording() {
  if(voiceRecorder?.state==='recording')voiceRecorder.stop();
}

function useVoiceFile(file) {
  clearRecordedVoice();
  if(!file)return;
  if(!file.type.startsWith('audio/')){setVoiceStatus(t('Please choose an audio recording.','Kies asseblief n klankopname.'),'error');return;}
  if(file.size>MAX_BYTES){setVoiceStatus(t('The recording is larger than 15 MB.','Die opname is groter as 15 MB.'),'error');return;}
  const audio=document.createElement('audio');
  const url=URL.createObjectURL(file);
  audio.preload='metadata';
  audio.addEventListener('loadedmetadata',()=>{
    const duration=Number.isFinite(audio.duration)?Math.round(audio.duration):0;
    if(duration>MAX_VOICE_SECONDS){URL.revokeObjectURL(url);setVoiceStatus(t('Please choose a recording of five minutes or less.','Kies asseblief n opname van vyf minute of minder.'),'error');return;}
    recordedVoice={blob:file,name:file.name||`family-story.${voiceExtension(file.type)}`,type:file.type,duration,url};
    renderRecordedVoice();setVoiceStatus(t('Voice recording ready to submit.','Stemopname gereed om in te dien.'),'success');
  },{once:true});
  audio.addEventListener('error',()=>{URL.revokeObjectURL(url);setVoiceStatus(t('This audio file could not be read.','Hierdie klankleer kon nie gelees word nie.'),'error');},{once:true});
  audio.src=url;
}

function installVoiceUi(afterElement) {
  if(document.getElementById('voiceStoryArea'))return;
  const area=document.createElement('section');
  area.id='voiceStoryArea';area.className='voice-story-area hidden';
  area.innerHTML=`
    <div class="voice-story-head"><div><strong>${t('Record a family story','Neem n familieverhaal op')}</strong><p>${t('The original recording stays private and is reviewed as family recollection, not documentary proof.','Die oorspronklike opname bly privaat en word as familieherinnering hersien, nie as dokumentere bewys nie.')}</p></div><span>${t('Up to 5 minutes','Tot 5 minute')}</span></div>
    <div class="voice-story-controls"><button id="voiceStoryRecord" class="button secondary" type="button">${t('Start recording','Begin opname')}</button><button id="voiceStoryStop" class="button danger hidden" type="button">${t('Stop recording','Stop opname')}</button><span id="voiceStoryTimer">0:00 / 5:00</span></div>
    <label class="voice-file-fallback"><span>${t('Or choose an existing voice recording','Of kies n bestaande stemopname')}</span><input id="voiceStoryFile" type="file" accept="audio/*,.m4a,.mp3,.webm,.ogg,.wav" /></label>
    <div id="voiceStoryPreview" class="voice-story-preview hidden"><audio id="voiceStoryPlayback" controls preload="metadata"></audio><div><span id="voiceStoryMeta"></span><button id="voiceStoryDelete" class="text-button" type="button">${t('Delete and record again','Vee uit en neem weer op')}</button></div></div>
    <div class="voice-story-fields"><label><span>${t('Who is speaking? (optional)','Wie praat? (opsioneel)')}</span><input id="voiceStorySpeaker" type="text" maxlength="120" /></label><label><span>${t('Relationship to this person (optional)','Verwantskap met hierdie persoon (opsioneel)')}</span><input id="voiceStoryRelationship" type="text" maxlength="160" /></label></div>
    <label class="check-row voice-story-check"><input id="voiceStoryLivingData" type="checkbox" /><span>${t('This recording mentions private information about someone who is still living.','Hierdie opname noem private inligting oor iemand wat nog leef.')}</span></label>
    <label class="check-row voice-story-check"><input id="voiceStoryConsent" type="checkbox" /><span>${t('I am the speaker, or I have the speaker\'s permission to preserve this recording in the private family archive.','Ek is die spreker, of ek het die spreker se toestemming om hierdie opname in die private familieargief te bewaar.')}</span></label>
    <p id="voiceStoryStatus" class="message" aria-live="polite"></p>`;
  afterElement.insertAdjacentElement('afterend',area);
  area.querySelector('#voiceStoryRecord')?.addEventListener('click',startVoiceRecording);
  area.querySelector('#voiceStoryStop')?.addEventListener('click',stopVoiceRecording);
  area.querySelector('#voiceStoryDelete')?.addEventListener('click',clearRecordedVoice);
  area.querySelector('#voiceStoryFile')?.addEventListener('change',event=>useVoiceFile(event.target.files?.[0]));
}

function resetForm() {
  form?.reset();
  document.querySelectorAll('input[name="contributionCategory"]').forEach(cb=>{cb.checked=false;});
  const lang=document.getElementById('contributionLanguageSelect'); if(lang) lang.value=af()?'af':'en';
  document.getElementById('sourceUploadArea')?.classList.add('hidden');
  const list=document.getElementById('sourceFileList'); if(list) list.innerHTML='';
  clearRecordedVoice();
  for(const id of ['voiceStorySpeaker','voiceStoryRelationship']){const node=document.getElementById(id);if(node)node.value='';}
  for(const id of ['voiceStoryLivingData','voiceStoryConsent']){const node=document.getElementById(id);if(node)node.checked=false;}
  document.getElementById('voiceStoryArea')?.classList.add('hidden');
  syncSourceArea();
}

async function approvedSession() {
  const { data:{session} }=await supabase.auth.getSession();
  if(!session) throw new Error(t('Please sign in again before submitting information.','Meld asseblief weer aan voordat jy inligting indien.'));
  const {data:profile,error}=await supabase.from('app_users').select('status').eq('user_id',session.user.id).maybeSingle();
  if(error||profile?.status!=='approved') throw new Error(t('Your family access must be approved before you can submit information.','Jou familietoegang moet goedgekeur wees voordat jy inligting kan indien.'));
  sessionUserId=session.user.id;
  return session;
}

async function uploadEvidence(session, description) {
  const files=[...(document.getElementById('sourceFiles')?.files||[])];
  if(!files.length) throw new Error(t('Please attach at least one record or image.','Heg asseblief ten minste een rekord of beeld aan.'));
  if(files.length>MAX_FILES) throw new Error(t(`Please attach no more than ${MAX_FILES} files in one submission.`,`Heg asseblief hoogstens ${MAX_FILES} lêers in een indiening aan.`));
  for(const file of files){ const ext=extensionOf(file.name); if(!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`${file.name}: ${t('unsupported file type','nie ’n ondersteunde lêertipe nie')}`); if(file.size>MAX_BYTES) throw new Error(`${file.name}: ${t('larger than 15 MB','groter as 15 MB')}`); }
  const evidence=[];
  for(const file of files){
    const path=`${session.user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
    const {error:uploadError}=await supabase.storage.from('family-evidence').upload(path,file,{contentType:file.type||undefined,upsert:false}); if(uploadError) throw uploadError;
    const {data:item,error}=await supabase.from('evidence_items').insert({submitted_by:session.user.id,evidence_type:'other',title:titleFrom(description,file.name),storage_path:path,original_filename:file.name,notes:description,visibility:'restricted',review_status:'pending'}).select('id,storage_path,original_filename,title').single(); if(error) throw error;
    evidence.push(item);
  }
  return evidence;
}

async function uploadVoiceEvidence(session, description, targetName) {
  if(!recordedVoice)return [];
  if(!document.getElementById('voiceStoryConsent')?.checked)throw new Error(t('Please confirm that the speaker has agreed to preserve this recording.','Bevestig asseblief dat die spreker ingestem het dat hierdie opname bewaar word.'));
  const speaker=document.getElementById('voiceStorySpeaker')?.value.trim()||'';
  const relationship=document.getElementById('voiceStoryRelationship')?.value.trim()||'';
  const path=`${session.user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName(recordedVoice.name)}`;
  const file=new File([recordedVoice.blob],recordedVoice.name,{type:recordedVoice.type||recordedVoice.blob.type||'audio/webm'});
  const {error:uploadError}=await supabase.storage.from('family-evidence').upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;
  const notes=[description,speaker?`Speaker: ${speaker}`:'',relationship?`Relationship: ${relationship}`:'',`Duration: ${voiceClock(recordedVoice.duration)}`].filter(Boolean).join('\n');
  const {data:item,error}=await supabase.from('evidence_items').insert({
    submitted_by:session.user.id,evidence_type:'oral_recollection',source_class:'other',title:`Oral recollection about ${targetName}`.slice(0,180),storage_path:path,original_filename:file.name,notes,visibility:'restricted',review_status:'pending',privacy_review_status:'pending',contains_living_person_data:Boolean(document.getElementById('voiceStoryLivingData')?.checked)
  }).select('id,storage_path,original_filename,title').single();if(error)throw error;
  return [item];
}

async function submit(event) {
  if(!form||event.target!==form) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const categories=categoryValues();
  const description=textArea?.value.trim()||'';
  const targetName=selectedPersonName();
  const voiceSelected=categories.includes('story')?recordedVoice:null;
  if(!categories.length){setMessage(t('Choose at least one type of information.','Kies ten minste een soort inligting.'),'error');return;}
  if(!targetName){setMessage(t('First click the person that this information belongs to.','Klik eers op die persoon aan wie hierdie inligting behoort.'),'error');return;}
  if(!description&&!voiceSelected){setMessage(t('Please enter the information you want to submit or attach a voice recording.','Voer asseblief die inligting in wat jy wil indien, of heg n stemopname aan.'),'error');return;}
  try{
    const session=await approvedSession();
    const targetPersonId=await selectedPersonId(); if(!targetPersonId) throw new Error(t('I could not identify the selected family record.','Ek kon nie die gekose familierekord identifiseer nie.'));
    const evidence=categories.includes('source')?await uploadEvidence(session,description):[];
    const voiceEvidence=voiceSelected?await uploadVoiceEvidence(session,description,targetName):[];
    evidence.push(...voiceEvidence);
    const lang=document.getElementById('contributionLanguageSelect')?.value||'en';
    const submittedCategories=voiceEvidence.length?[...new Set([...categories,'voice_note'])]:categories;
    const primary=voiceEvidence.length&&categories.includes('story')?'story':categories.length===1?categories[0]:'multiple';
    const narrative=description||t(`Voice recollection about ${targetName}. The recording has not yet been transcribed.`,`Stemherinnering oor ${targetName}. Die opname is nog nie getranskribeer nie.`);
    const payload={submitted_by:session.user.id,target_person_id:targetPersonId,contribution_type:primary,original_language:lang,narrative_text:narrative,payload:{categories:submittedCategories,attached_to_name:targetName,selected_record_linkage:true,voice_recording:voiceEvidence.length?{duration_seconds:recordedVoice.duration,speaker:document.getElementById('voiceStorySpeaker')?.value.trim()||null,relationship_to_person:document.getElementById('voiceStoryRelationship')?.value.trim()||null,transcript_status:'not_transcribed',evidence_status:'family_supplied'}:null,evidence_items:evidence.map(x=>({id:x.id,storage_path:x.storage_path,original_filename:x.original_filename,title:x.title})),attachment_count:evidence.length}};
    const {error}=await supabase.from('contributions').insert(payload); if(error) throw error;
    currentTargetId=targetPersonId; resetForm();
    setMessage(t(`Saved immediately for you as pending information about ${targetName}. It will become canonical only after editor review.`,`Onmiddellik vir jou gestoor as hangende inligting oor ${targetName}. Dit word eers kanoniek ná redakteursoorsig.`),'success');
    await loadPending();
  }catch(error){setMessage(error?.message||t('The submission could not be saved.','Die indiening kon nie gestoor word nie.'),'error');}
}

async function loadPending() {
  const {data:{session}}=await supabase.auth.getSession();
  sessionUserId=session?.user?.id||null;
  if(!sessionUserId){pendingRows=[];renderPending();return;}
  const {data,error}=await supabase.from('contributions').select('id,target_person_id,contribution_type,narrative_text,payload,status,created_at').eq('submitted_by',sessionUserId).eq('status','pending').order('created_at',{ascending:false});
  pendingRows=error?[]:(data||[]); renderPending();
}

function renderPending() {
  if(!personDetails) return;
  document.getElementById('personalPendingContributions')?.remove();
  const target=currentTargetId||centreSelect?.value||null;
  if(!target) return;
  const rows=pendingRows.filter(x=>x.target_person_id===target);
  if(!rows.length) return;
  const section=document.createElement('section'); section.id='personalPendingContributions'; section.className='personal-pending-contributions';
  section.innerHTML=`<div class="personal-pending-head"><strong>${t('Your pending information','Jou hangende inligting')}</strong><span>${t('Visible to you · not canonical yet','Sigbaar vir jou · nog nie kanoniek nie')}</span></div>${rows.map(row=>{const cats=Array.isArray(row.payload?.categories)?row.payload.categories:[row.contribution_type];return `<article><div>${cats.map(c=>`<span>${esc(categoryLabel(c))}</span>`).join('')}</div><p>${esc(row.narrative_text||'')}</p></article>`;}).join('')}`;
  personDetails.insertAdjacentElement('afterend',section);
}

function installStyles(){
  if(document.getElementById('contributionWorkflowV2Styles')) return;
  const style=document.createElement('style'); style.id='contributionWorkflowV2Styles'; style.textContent=`
    .contribution-category-picker{grid-column:1/-1;margin:0;padding:0;border:0}.contribution-category-picker legend{margin:0 0 9px;font:700 .82rem/1.3 Arial,sans-serif;color:#554c44}
    .contribution-category-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.contribution-category-chip{position:relative}.contribution-category-chip input{position:absolute;opacity:0;pointer-events:none}.contribution-category-chip span{display:flex;align-items:center;min-height:42px;padding:9px 11px;border:1px solid #d5cabd;border-radius:11px;background:#fff;color:#51483f;font:700 .8rem/1.25 Arial,sans-serif;cursor:pointer}.contribution-category-chip input:checked+span{border-color:#725a43;background:#eee1d2;color:#33281f;box-shadow:inset 0 0 0 1px #725a43}.contribution-category-chip input:checked+span:before{content:'✓';margin-right:7px;font-weight:900}
    .contribution-language-field{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:2px}.contribution-language-field>span{font-size:.76rem}.contribution-language-field select{width:auto;min-width:150px}
    .contribution-panel-inner{max-width:none!important}.contribution-panel-inner #contributionForm{width:100%}.contribution-panel-inner #contributionText{width:100%;min-height:210px}.contribution-panel-inner .source-upload-area{grid-column:1/-1}
    .voice-story-area{grid-column:1/-1;display:grid;gap:12px;padding:14px;border:1px solid #d7c399;border-radius:13px;background:#fff8e9}.voice-story-head{display:flex;justify-content:space-between;gap:12px}.voice-story-head strong{font:700 .9rem/1.3 Arial,sans-serif;color:#49382a}.voice-story-head p{margin:4px 0 0;font:.78rem/1.45 Arial,sans-serif;color:#65584d}.voice-story-head>span{flex:none;height:max-content;padding:4px 7px;border-radius:999px;background:#efe0c4;font:700 .68rem Arial,sans-serif;color:#6a5334}.voice-story-controls{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.voice-story-controls>span{font:700 .76rem Arial,sans-serif;color:#65584d}.voice-file-fallback{display:grid;gap:5px;font:700 .76rem Arial,sans-serif;color:#65584d}.voice-story-preview{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px;border:1px solid #dccdb9;border-radius:11px;background:#fff}.voice-story-preview audio{width:100%}.voice-story-preview>div{display:grid;gap:4px}.voice-story-preview span{font:.72rem Arial,sans-serif;color:#65584d}.voice-story-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.voice-story-fields label{display:grid;gap:5px;font:700 .74rem Arial,sans-serif;color:#65584d}.voice-story-fields input{width:100%;box-sizing:border-box}.voice-story-check{align-items:flex-start}.voice-story-check span{font:.76rem/1.4 Arial,sans-serif}
    .personal-pending-contributions{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #e2d8cc}.personal-pending-head{display:grid;gap:2px}.personal-pending-head strong{font:700 .82rem Arial,sans-serif;color:#5d4b3d}.personal-pending-head span{font: .73rem Arial,sans-serif;color:#85786c}.personal-pending-contributions article{padding:9px 10px;border:1px dashed #c9aa77;border-radius:10px;background:#fff8e9}.personal-pending-contributions article>div{display:flex;flex-wrap:wrap;gap:5px}.personal-pending-contributions article>div span{padding:3px 6px;border-radius:999px;background:#efe1c8;font:700 .67rem Arial,sans-serif}.personal-pending-contributions article p{margin:6px 0 0;font:.82rem/1.4 Arial,sans-serif;color:#51483f}
    @media(max-width:760px){.contribution-category-grid{grid-template-columns:1fr 1fr}.contribution-language-field{align-items:stretch;flex-direction:column}.contribution-language-field select{width:100%}.voice-story-head,.voice-story-preview{grid-template-columns:1fr;display:grid}.voice-story-head>span{justify-self:start}.voice-story-fields{grid-template-columns:1fr}}
  `; document.head.appendChild(style);
}

installStyles(); installUi();
installVoiceUi(document.querySelector('.contribution-language-field')||document.getElementById('contributionCategoryPicker'));
document.addEventListener('submit',submit,true);
document.addEventListener('click',(event)=>{const el=event.target instanceof Element?event.target.closest('[data-person-id],[data-snapshot-person]'):null;const id=el?.dataset?.personId||el?.dataset?.snapshotPerson;if(id){currentTargetId=id;setTimeout(renderPending,20);}},true);
centreSelect?.addEventListener('change',()=>{currentTargetId=centreSelect.value;setTimeout(renderPending,20);});
if(personName){new MutationObserver(()=>setTimeout(renderPending,20)).observe(personName,{childList:true,subtree:true,characterData:true});}
document.getElementById('contributionLanguageSelect')?.addEventListener('change',(e)=>{e.target.dataset.touched='1';});
document.addEventListener('genealogy:language-changed',syncLabels);
supabase.auth.onAuthStateChange(()=>setTimeout(loadPending,0));
await loadPending();
