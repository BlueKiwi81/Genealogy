import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const VAPID_PUBLIC_KEY = 'BEOC5CVWMQ2krvN2CpFJKZxe6e_7TJtgm9fim2B7nPAwIt8hvFGD_8888e_Tp-m19sL0VAy9MV5fBjPC7XS4z1Y';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const ui = {
  authView: document.getElementById('authView'), forbiddenView: document.getElementById('forbiddenView'), adminApp: document.getElementById('adminApp'),
  loginForm: document.getElementById('loginForm'), loginEmail: document.getElementById('loginEmail'), otpForm: document.getElementById('otpForm'), otpCode: document.getElementById('otpCode'), authMessage: document.getElementById('authMessage'),
  refreshButton: document.getElementById('refreshButton'), attentionCount: document.getElementById('attentionCount'), attentionSummary: document.getElementById('attentionSummary'), accessCount: document.getElementById('accessCount'), treeCount: document.getElementById('treeCount'), contributionCount: document.getElementById('contributionCount'), navReviewBadge: document.getElementById('navReviewBadge'),
  latestQueue: document.getElementById('latestQueue'), reviewQueue: document.getElementById('reviewQueue'), installNotice: document.getElementById('installNotice'), notificationStatus: document.getElementById('notificationStatus'), notificationHelp: document.getElementById('notificationHelp'), enableNotifications: document.getElementById('enableNotifications'),
  photoForm: document.getElementById('photoForm'), photoPerson: document.getElementById('photoPerson'), photoFile: document.getElementById('photoFile'), photoPreview: document.getElementById('photoPreview'), photoCaption: document.getElementById('photoCaption'), photoDate: document.getElementById('photoDate'), photoPlace: document.getElementById('photoPlace'), photoMessage: document.getElementById('photoMessage'),
  peopleSearch: document.getElementById('peopleSearch'), peopleResults: document.getElementById('peopleResults'),
  detailBackdrop: document.getElementById('detailBackdrop'), detailSheet: document.getElementById('detailSheet'), detailKicker: document.getElementById('detailKicker'), detailTitle: document.getElementById('detailTitle'), detailBody: document.getElementById('detailBody'), closeDetail: document.getElementById('closeDetail'), toast: document.getElementById('toast'),
};

const state = {
  session: null, profile: null, loginEmail: '', people: [], peopleById: new Map(), usersById: new Map(),
  access: [], tree: [], contributions: [], queue: [], filter: 'all', channels: [], objectUrls: [], refreshTimer: null,
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const canonicalName = (p) => [p?.given_names?.trim(), p?.surname?.trim()].filter(Boolean).join(' ') || 'Unknown person';
const displayName = (p) => [p?.preferred_name?.trim() || p?.given_names?.trim(), p?.surname?.trim()].filter(Boolean).join(' ') || 'Unknown person';
const userName = (id) => state.usersById.get(id)?.display_name || 'Family contributor';
const targetName = (id) => state.peopleById.get(id) ? displayName(state.peopleById.get(id)) : 'General family contribution';
const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T00:00:00`)) : 'not supplied';
const formatTime = (value) => value ? new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(value)) : '';

function setAuthMessage(text='', type=''){ ui.authMessage.textContent=text; ui.authMessage.className=`message${type?` ${type}`:''}`; }
function setPhotoMessage(text='', type=''){ ui.photoMessage.textContent=text; ui.photoMessage.className=`message${type?` ${type}`:''}`; }
function toast(text){ ui.toast.textContent=text; ui.toast.classList.remove('hidden'); window.clearTimeout(toast.timer); toast.timer=window.setTimeout(()=>ui.toast.classList.add('hidden'),2800); }
function isStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function safeName(name){ return String(name||'photo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(-120) || 'photo'; }
function human(value){ return String(value ?? '').replaceAll('_',' '); }

function switchTab(name){
  document.querySelectorAll('.tab-panel').forEach((p)=>p.classList.toggle('active',p.dataset.panel===name));
  document.querySelectorAll('.nav-item').forEach((b)=>b.classList.toggle('active',b.dataset.tab===name));
  window.scrollTo({top:0,behavior:'smooth'});
}

document.querySelectorAll('[data-tab]').forEach((b)=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
document.querySelectorAll('[data-open-kind]').forEach((b)=>b.addEventListener('click',()=>{state.filter=b.dataset.openKind; syncFilters(); switchTab('review'); renderReviewQueue();}));
document.querySelectorAll('.filter').forEach((b)=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;syncFilters();renderReviewQueue();}));
function syncFilters(){ document.querySelectorAll('.filter').forEach((b)=>b.classList.toggle('active',b.dataset.filter===state.filter)); }

function matchScore(request, person){
  let score=0; if(request.birth_date && person.birth_date===request.birth_date) score+=8; if(request.last_name && norm(person.surname)===norm(request.last_name)) score+=4;
  const first=norm(request.first_name); const names=`${norm(person.given_names)} ${norm(person.preferred_name)}`.split(' '); if(first && names.includes(first)) score+=4;
  norm(request.middle_names).split(' ').filter(Boolean).forEach((m)=>{if(names.includes(m))score+=1;}); return score;
}
function likelyPersonId(request){ const ranked=state.people.map((person)=>({person,score:matchScore(request,person)})).sort((a,b)=>b.score-a.score); return ranked[0]?.score>=6?ranked[0].person.id:''; }
function peopleOptions(selected=''){ return state.people.slice().sort((a,b)=>displayName(a).localeCompare(displayName(b))).map((p)=>`<option value="${esc(p.id)}"${p.id===selected?' selected':''}>${esc(displayName(p))}${p.birth_date?` — ${esc(formatDate(p.birth_date))}`:''}</option>`).join(''); }

async function editorProfile(session){
  const {data,error}=await supabase.from('app_users').select('user_id,person_id,display_name,role,status').eq('user_id',session.user.id).maybeSingle();
  if(error) throw error; return data;
}

async function loadReferenceData(){
  const [peopleRes,usersRes]=await Promise.all([
    supabase.from('people').select('id,given_names,preferred_name,surname,birth_date,death_date,birth_place,death_place,occupation_summary,residence_summary,final_rest_type,final_rest_place,source_status').order('surname'),
    supabase.from('app_users').select('user_id,person_id,display_name,role,status'),
  ]);
  if(peopleRes.error) throw peopleRes.error; if(usersRes.error) throw usersRes.error;
  state.people=peopleRes.data||[]; state.peopleById=new Map(state.people.map((p)=>[p.id,p])); state.usersById=new Map((usersRes.data||[]).map((u)=>[u.user_id,u]));
  ui.photoPerson.innerHTML='<option value="">Choose a person…</option>'+peopleOptions();
  renderPeople();
}

async function loadQueues(){
  const [accessRes,treeRes,contributionRes]=await Promise.all([
    supabase.from('access_requests').select('id,user_id,display_name,email,first_name,middle_names,last_name,birth_date,email_updates_opt_in,status,created_at').eq('status','pending').order('created_at',{ascending:true}),
    supabase.from('tree_change_sets').select('id,submitted_by,target_person_id,change_type,payload,before_snapshot,base_updated_at,status,review_note,created_at').in('status',['pending','conflict']).order('created_at',{ascending:true}),
    supabase.from('contributions').select('id,submitted_by,target_person_id,contribution_type,original_language,narrative_text,payload,status,created_at').eq('status','pending').order('created_at',{ascending:true}),
  ]);
  if(accessRes.error) throw accessRes.error; if(treeRes.error) throw treeRes.error; if(contributionRes.error) throw contributionRes.error;
  state.access=accessRes.data||[]; state.tree=treeRes.data||[]; state.contributions=contributionRes.data||[];
  state.queue=[
    ...state.access.map((item)=>({kind:'access_request',id:item.id,created_at:item.created_at,item})),
    ...state.tree.map((item)=>({kind:'tree_change',id:item.id,created_at:item.created_at,item})),
    ...state.contributions.map((item)=>({kind:'contribution',id:item.id,created_at:item.created_at,item})),
  ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  renderDashboard(); renderReviewQueue(); await updateBadge();
}

function queueTitle(entry){
  const item=entry.item;
  if(entry.kind==='access_request') return [item.first_name,item.middle_names,item.last_name].filter(Boolean).join(' ') || item.display_name || 'Access request';
  if(entry.kind==='tree_change'){
    const target=targetName(item.target_person_id); if(item.change_type==='add_relative'){const r=item.payload?.relative||{};return `Add ${[r.given_names,r.surname].filter(Boolean).join(' ')||'relative'} to ${target}`;}
    if(item.change_type==='edit_person') return `Edit ${target}`; if(item.change_type==='remove_person') return `Remove ${target}`; return `Tree change for ${target}`;
  }
  if(item.contribution_type==='story') return `Story about ${targetName(item.target_person_id)}`;
  if(item.contribution_type==='source') return `Photo / record for ${targetName(item.target_person_id)}`;
  return `${human(item.contribution_type)} — ${targetName(item.target_person_id)}`;
}
function queueSubtitle(entry){
  if(entry.kind==='access_request') return `${entry.item.email} · ${formatTime(entry.created_at)}`;
  if(entry.kind==='tree_change') return `${userName(entry.item.submitted_by)} · ${entry.item.status} · ${formatTime(entry.created_at)}`;
  return `${userName(entry.item.submitted_by)} · ${formatTime(entry.created_at)}`;
}
function queuePill(entry){ return entry.kind==='access_request'?'Access':entry.kind==='tree_change'?(entry.item.status==='conflict'?'Conflict':'Tree'):(entry.item.contribution_type==='story'?'Story':entry.item.contribution_type==='source'?'File':'Info'); }
function reviewCard(entry){ return `<button type="button" class="review-card" data-review-kind="${esc(entry.kind)}" data-review-id="${esc(entry.id)}"><div class="review-card-top"><div><strong>${esc(queueTitle(entry))}</strong><p>${esc(queueSubtitle(entry))}</p></div><span class="review-pill${entry.item.status==='conflict'?' conflict':''}">${esc(queuePill(entry))}</span></div></button>`; }

function renderDashboard(){
  const total=state.queue.length; ui.attentionCount.textContent=String(total); ui.accessCount.textContent=String(state.access.length); ui.treeCount.textContent=String(state.tree.length); ui.contributionCount.textContent=String(state.contributions.length);
  ui.attentionSummary.textContent=total?`${total} item${total===1?'':'s'} waiting for an editor decision.`:'Nothing waiting right now.';
  ui.navReviewBadge.textContent=String(total); ui.navReviewBadge.classList.toggle('hidden',!total);
  ui.latestQueue.innerHTML=state.queue.length?state.queue.slice(0,4).map(reviewCard).join(''):'<div class="queue-empty">You are all caught up.</div>';
  bindReviewCards(ui.latestQueue);
}
function renderReviewQueue(){
  const items=state.filter==='all'?state.queue:state.queue.filter((e)=>e.kind===state.filter);
  ui.reviewQueue.innerHTML=items.length?items.map(reviewCard).join(''):'<div class="queue-empty">No items in this group.</div>';
  bindReviewCards(ui.reviewQueue);
}
function bindReviewCards(root){ root.querySelectorAll('[data-review-id]').forEach((b)=>b.addEventListener('click',()=>openReview(b.dataset.reviewKind,b.dataset.reviewId))); }

function cleanupObjectUrls(){ state.objectUrls.forEach((u)=>URL.revokeObjectURL(u)); state.objectUrls=[]; }
function closeDetail(){ cleanupObjectUrls(); ui.detailSheet.classList.add('hidden'); ui.detailBackdrop.classList.add('hidden'); ui.detailBody.innerHTML=''; }
ui.closeDetail.addEventListener('click',closeDetail); ui.detailBackdrop.addEventListener('click',closeDetail);
function showDetail(kicker,title,html){ cleanupObjectUrls(); ui.detailKicker.textContent=kicker; ui.detailTitle.textContent=title; ui.detailBody.innerHTML=html; ui.detailSheet.classList.remove('hidden'); ui.detailBackdrop.classList.remove('hidden'); }

async function openReview(kind,id){
  const entry=state.queue.find((e)=>e.kind===kind&&e.id===id); if(!entry){toast('This item is no longer pending.');return;}
  if(kind==='access_request') return openAccess(entry.item);
  if(kind==='tree_change') return openTreeChange(entry.item);
  return openContribution(entry.item);
}

function registrationName(r){ return [r.first_name,r.middle_names,r.last_name].filter(Boolean).join(' ').trim()||r.display_name||'Family member'; }
function openAccess(r){
  const likely=likelyPersonId(r); const likelyPerson=state.peopleById.get(likely);
  showDetail('Access request',registrationName(r),`
    <p class="detail-meta">Requested ${esc(formatTime(r.created_at))}</p>
    <div class="detail-grid"><div class="detail-row"><strong>Verified email</strong><span>${esc(r.email)}</span></div><div class="detail-row"><strong>Date of birth supplied</strong><span>${esc(formatDate(r.birth_date))}</span></div>${likelyPerson?`<div class="detail-row"><strong>Suggested match</strong><span>${esc(displayName(likelyPerson))}</span></div>`:''}</div>
    <label>Link this login to<select id="accessPersonSelect">${peopleOptions(likely)}</select></label>
    <label>Access level<select id="accessRoleSelect"><option value="family">Family</option><option value="editor">Editor</option></select></label>
    <div class="sheet-actions"><button id="approveAccessButton" class="button primary" type="button">Approve and link</button><button id="rejectAccessButton" class="button danger" type="button">Reject</button></div>`);
  document.getElementById('approveAccessButton').addEventListener('click',()=>approveAccess(r));
  document.getElementById('rejectAccessButton').addEventListener('click',()=>rejectAccess(r));
}
async function approveAccess(r){
  const personId=document.getElementById('accessPersonSelect').value; const role=document.getElementById('accessRoleSelect').value; if(!personId)return toast('Choose the correct person first.');
  const now=new Date().toISOString();
  const {error:userError}=await supabase.from('app_users').upsert({user_id:r.user_id,person_id:personId,display_name:registrationName(r),role,status:'approved',approved_at:now},{onConflict:'user_id'}); if(userError)return toast(userError.message);
  const {error}=await supabase.from('access_requests').update({status:'approved',reviewed_at:now}).eq('id',r.id); if(error)return toast(error.message);
  closeDetail(); toast(`${registrationName(r)} approved.`); await refreshAll();
}
async function rejectAccess(r){ const {error}=await supabase.from('access_requests').update({status:'rejected',reviewed_at:new Date().toISOString()}).eq('id',r.id); if(error)return toast(error.message); closeDetail();toast('Access request rejected.');await refreshAll(); }

function historyRows(context={}){ const rows=[]; const labels={south_african_war:'South African War / Anglo-Boer War',first_world_war:'First World War',second_world_war:'Second World War'}; Object.entries(context||{}).forEach(([key,v])=>{if(!v||typeof v!=='object')return; const label=labels[key]||human(key); if(v.status==='no_known_information')rows.push([`Historical context — ${label}`,'No information currently known']); if(v.status==='known')rows.push([`Historical context — ${label}`,[v.details,v.concentration_camp?`Concentration camp: ${v.concentration_camp}`:''].filter(Boolean).join(' | ')||'Information known; details not supplied']);});return rows; }
function treeRows(change){
  const rows=[]; if(change.change_type==='add_relative'){const r=change.payload?.relative||{}; rows.push(['Relationship',change.payload?.role||'relative'],['Name',[r.given_names,r.surname].filter(Boolean).join(' ')||'Not supplied']); [['preferred_name','Known as'],['life_status','Life status'],['birth_date','Birth'],['birth_place','Birth place'],['residence_summary','Where they lived'],['death_date','Death'],['death_place','Death place'],['occupation_summary','Occupation'],['military_service_summary','Military / service'],['narrative_summary','Family note']].forEach(([key,label])=>{if(r[key])rows.push([label,human(r[key])]);}); if(r.final_rest_type||r.final_rest_place)rows.push(['Final resting place',[human(r.final_rest_type),r.final_rest_place].filter(Boolean).join(' — ')]); rows.push(...historyRows(r.historical_context));}
  else if(change.change_type==='edit_person'){const before=change.before_snapshot?.person||{};const after=change.payload?.after||{};Object.keys(after).forEach((key)=>{if(key==='historical_context'){rows.push(...historyRows(after[key]));return;} if(String(before[key]??'')!==String(after[key]??''))rows.push([human(key),`${before[key]??'blank'} → ${after[key]??'blank'}`]);});}
  else if(change.change_type==='remove_relationship'){const rel=change.before_snapshot?.relationship||{};rows.push(['Relationship',human(rel.relationship_type||'relationship')]);if(change.payload?.reason)rows.push(['Reason',change.payload.reason]);}
  else if(change.change_type==='remove_person'){rows.push(['Effect','Person and connected relationships disappear from the active tree; underlying records remain recoverable.']);if(change.payload?.reason)rows.push(['Reason',change.payload.reason]);}
  return rows;
}
function openTreeChange(change){
  const rows=treeRows(change).map(([l,v])=>`<div class="detail-row"><strong>${esc(l)}</strong><span>${esc(v)}</span></div>`).join('');
  showDetail(change.status==='conflict'?'Conflict review':'Tree change',queueTitle({kind:'tree_change',item:change}),`<p class="detail-meta">${esc(userName(change.submitted_by))} · ${esc(formatTime(change.created_at))}</p><div class="detail-grid">${rows||'<div class="detail-row"><span>No additional structured details.</span></div>'}</div>${change.review_note?`<div class="detail-row"><strong>Current review note</strong><span>${esc(change.review_note)}</span></div>`:''}<label>Review note<textarea id="treeReviewNote" rows="2" placeholder="Optional"></textarea></label><div class="sheet-actions${change.status==='conflict'?' single':''}">${change.status==='conflict'?'':`<button id="approveTreeButton" class="button primary" type="button">Approve and keep</button>`}<button id="rejectTreeButton" class="button danger" type="button">Reject and restore</button></div>`);
  document.getElementById('approveTreeButton')?.addEventListener('click',()=>approveTree(change)); document.getElementById('rejectTreeButton').addEventListener('click',()=>rejectTree(change));
}
async function approveTree(change){ const note=document.getElementById('treeReviewNote')?.value.trim(); if(note){const {error}=await supabase.from('tree_change_sets').update({review_note:note}).eq('id',change.id);if(error)return toast(error.message);} const {data,error}=await supabase.rpc('approve_tree_change_set',{p_change_set_id:change.id});if(error)return toast(error.message);closeDetail();toast(data?.status==='conflict'?'Moved to conflict review.':'Tree change approved.');await refreshAll(); }
async function rejectTree(change){ const note=document.getElementById('treeReviewNote')?.value.trim()||'Rejected by family editor.';const {error}=await supabase.from('tree_change_sets').update({status:'rejected',review_note:note,reviewed_by:state.session.user.id,reviewed_at:new Date().toISOString()}).eq('id',change.id);if(error)return toast(error.message);closeDetail();toast('Rejected and restored.');await refreshAll(); }

function evidenceRefs(payload){ const raw=payload?.evidence_items; if(!Array.isArray(raw))return[]; return raw.map((x)=>typeof x==='string'?{id:x}:x).filter((x)=>x?.id); }
async function evidenceFor(item){
  const refs=evidenceRefs(item.payload); if(!refs.length)return[]; const ids=refs.map((r)=>r.id); const {data,error}=await supabase.from('evidence_items').select('id,evidence_type,title,original_filename,storage_path,notes,review_status').in('id',ids); if(error)throw error; return data||[];
}
async function evidenceHtml(items){
  const parts=[]; for(const item of items){ let media=''; try{const {data,error}=await supabase.storage.from('family-evidence').download(item.storage_path); if(error)throw error; const url=URL.createObjectURL(data); state.objectUrls.push(url); const type=data.type||''; const filename=(item.original_filename||'').toLowerCase(); if(type.startsWith('image/')||/\.(jpg|jpeg|png|webp|heic|heif|tif|tiff)$/.test(filename)) media=`<img src="${esc(url)}" alt="${esc(item.title||item.original_filename||'Family photograph')}" />`; else media=`<a class="button secondary document-link" href="${esc(url)}" target="_blank" rel="noopener">Open document</a>`; }catch(error){media=`<p class="message error">${esc(error.message||'Unable to load file')}</p>`;}
    parts.push(`<article class="evidence-item"><div class="evidence-name">${esc(item.original_filename||item.title||'Attached record')}</div>${item.notes?`<p class="evidence-note">${esc(item.notes)}</p>`:''}${media}</article>`); }
  return parts.join('');
}
async function openContribution(item){
  showDetail(item.contribution_type==='story'?'Family story':item.contribution_type==='source'?'Photo / source':'Family contribution',targetName(item.target_person_id),`<p class="detail-meta">${esc(userName(item.submitted_by))} · ${esc(formatTime(item.created_at))}</p><div class="story-text">${esc(item.narrative_text||'No written description supplied.')}</div><div id="evidenceArea"></div><label>Approved wording / review note<textarea id="contributionEdit" rows="5">${esc(item.narrative_text||'')}</textarea></label><div class="sheet-actions"><button id="approveContributionButton" class="button primary" type="button">Approve</button><button id="rejectContributionButton" class="button danger" type="button">Reject</button></div>`);
  if(item.contribution_type==='source'){ try{const evidence=await evidenceFor(item); const html=await evidenceHtml(evidence); const area=document.getElementById('evidenceArea'); if(area)area.innerHTML=`<div class="evidence-grid">${html||'<div class="queue-empty">No attached file found.</div>'}</div>`;}catch(error){document.getElementById('evidenceArea').innerHTML=`<p class="message error">${esc(error.message)}</p>`;} }
  document.getElementById('approveContributionButton').addEventListener('click',()=>approveContribution(item)); document.getElementById('rejectContributionButton').addEventListener('click',()=>rejectContribution(item));
}
async function approveContribution(item){
  const edited=document.getElementById('contributionEdit')?.value.trim()||''; const now=new Date().toISOString();
  if(item.contribution_type==='story'&&item.target_person_id){ if(!edited)return toast('Approved story text cannot be blank.'); const {error}=await supabase.from('narratives').insert({person_id:item.target_person_id,title:'Family recollection',original_language:item.original_language||'en',original_text:item.narrative_text||'',edited_text:edited,narrative_status:'approved',source_status:'family_supplied'});if(error)return toast(error.message); }
  if(item.contribution_type==='source'){ const refs=evidenceRefs(item.payload); if(refs.length){const {error}=await supabase.from('evidence_items').update({review_status:'approved',reviewed_by:state.session.user.id,reviewed_at:now}).in('id',refs.map((r)=>r.id));if(error)return toast(error.message);} }
  const note=item.contribution_type==='story'?'Approved as a family narrative.':edited||'Approved for structured incorporation into the canonical tree.'; const {error}=await supabase.from('contributions').update({status:'approved',review_note:note,reviewed_by:state.session.user.id,reviewed_at:now}).eq('id',item.id);if(error)return toast(error.message); closeDetail();toast('Contribution approved.');await refreshAll();
}
async function rejectContribution(item){ const now=new Date().toISOString(); if(item.contribution_type==='source'){const refs=evidenceRefs(item.payload);if(refs.length){const {error}=await supabase.from('evidence_items').update({review_status:'rejected',reviewed_by:state.session.user.id,reviewed_at:now}).in('id',refs.map((r)=>r.id));if(error)return toast(error.message);}} const {error}=await supabase.from('contributions').update({status:'rejected',review_note:'Rejected by family editor.',reviewed_by:state.session.user.id,reviewed_at:now}).eq('id',item.id);if(error)return toast(error.message);closeDetail();toast('Contribution rejected.');await refreshAll(); }

function renderPeople(){
  const q=norm(ui.peopleSearch.value); const list=state.people.filter((p)=>!q||norm(`${p.given_names} ${p.preferred_name||''} ${p.surname}`).includes(q)).slice(0,80);
  ui.peopleResults.innerHTML=list.map((p)=>`<button type="button" class="person-result" data-person-id="${esc(p.id)}"><strong>${esc(displayName(p))}</strong><span>${esc([p.birth_date?`b. ${p.birth_date.slice(0,4)}`:'',p.death_date?`d. ${p.death_date.slice(0,4)}`:''].filter(Boolean).join(' · ')||'Dates not recorded')}</span></button>`).join('')||'<div class="queue-empty">No matching person.</div>';
  ui.peopleResults.querySelectorAll('[data-person-id]').forEach((b)=>b.addEventListener('click',()=>openPerson(b.dataset.personId)));
}
ui.peopleSearch.addEventListener('input',renderPeople);
function openPerson(id){ const p=state.peopleById.get(id); if(!p)return; const rows=[['Full name',canonicalName(p)],p.preferred_name?['Known as',p.preferred_name]:null,p.birth_date?['Born',`${formatDate(p.birth_date)}${p.birth_place?` — ${p.birth_place}`:''}`]:null,p.death_date?['Died',`${formatDate(p.death_date)}${p.death_place?` — ${p.death_place}`:''}`]:null,p.residence_summary?['Lived',p.residence_summary]:null,p.occupation_summary?['Occupation',p.occupation_summary]:null,(p.final_rest_type||p.final_rest_place)?['Final resting place',[human(p.final_rest_type),p.final_rest_place].filter(Boolean).join(' — ')]:null,['Source status',human(p.source_status||'unresolved')]].filter(Boolean); showDetail('Person record',displayName(p),`<div class="detail-grid">${rows.map(([l,v])=>`<div class="detail-row"><strong>${esc(l)}</strong><span>${esc(v)}</span></div>`).join('')}</div><div class="sheet-actions single"><button id="personPhotoShortcut" class="button primary" type="button">Add photograph</button></div>`); document.getElementById('personPhotoShortcut').addEventListener('click',()=>{closeDetail();ui.photoPerson.value=p.id;switchTab('photos');}); }

ui.photoFile.addEventListener('change',()=>{ const file=ui.photoFile.files?.[0]; if(!file){ui.photoPreview.classList.add('hidden');return;} const url=URL.createObjectURL(file); ui.photoPreview.src=url; ui.photoPreview.classList.remove('hidden'); ui.photoPreview.onload=()=>URL.revokeObjectURL(url); });
ui.photoForm.addEventListener('submit',async(event)=>{
  event.preventDefault(); const personId=ui.photoPerson.value; const file=ui.photoFile.files?.[0]; if(!personId||!file)return setPhotoMessage('Choose a person and photograph.','error'); if(!file.type.startsWith('image/'))return setPhotoMessage('Please choose an image file.','error'); if(file.size>20*1024*1024)return setPhotoMessage('Please use an image smaller than 20 MB.','error');
  setPhotoMessage('Uploading photograph…'); const path=`${state.session.user.id}/${personId}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
  const {error:uploadError}=await supabase.storage.from('person-photos').upload(path,file,{contentType:file.type,upsert:false}); if(uploadError)return setPhotoMessage(uploadError.message,'error');
  const {error}=await supabase.from('person_photos').insert({person_id:personId,storage_path:path,caption:ui.photoCaption.value.trim()||null,date_text:ui.photoDate.value.trim()||null,place:ui.photoPlace.value.trim()||null,source_status:'family_supplied',is_primary:false,uploaded_by:state.session.user.id,source_collection:'mobile-admin',association_status:'confirmed',identification_note:'Uploaded by family editor from the mobile admin companion.'}); if(error)return setPhotoMessage(error.message,'error');
  ui.photoForm.reset();ui.photoPreview.classList.add('hidden');setPhotoMessage(`Photograph added to ${displayName(state.peopleById.get(personId))}.`,'success');toast('Photograph uploaded.');
});

function urlBase64ToUint8Array(base64String){ const padding='='.repeat((4-base64String.length%4)%4); const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/'); const raw=atob(base64); return Uint8Array.from([...raw].map((c)=>c.charCodeAt(0))); }
async function updateNotificationState(){
  const supported='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; if(!supported){ui.notificationStatus.textContent='Push notifications are not supported here.';ui.enableNotifications.disabled=true;return;}
  if(!isStandalone()){ui.installNotice.classList.remove('hidden');ui.notificationStatus.textContent='Install the companion first.';ui.notificationHelp.textContent='iPhone push notifications are enabled from the Home Screen app.';ui.enableNotifications.disabled=true;return;}
  ui.installNotice.classList.add('hidden'); const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'}); const subscription=await registration.pushManager.getSubscription();
  if(subscription && Notification.permission==='granted'){ui.notificationStatus.textContent='Notifications enabled';ui.notificationHelp.textContent='You will be prompted for new editor decisions.';ui.enableNotifications.textContent='Enabled';ui.enableNotifications.disabled=true;return;}
  ui.notificationStatus.textContent=Notification.permission==='denied'?'Notifications are blocked':'Notifications are available';ui.notificationHelp.textContent=Notification.permission==='denied'?'Enable notifications for this web app in iPhone Settings.':'Tap Enable to receive editor alerts.';ui.enableNotifications.disabled=Notification.permission==='denied';
}
ui.enableNotifications.addEventListener('click',async()=>{
  try{ const permission=await Notification.requestPermission(); if(permission!=='granted')return updateNotificationState(); const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'}); let subscription=await registration.pushManager.getSubscription(); if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)}); const json=subscription.toJSON(); const {error}=await supabase.from('mobile_push_subscriptions').upsert({user_id:state.session.user.id,endpoint:json.endpoint,p256dh:json.keys?.p256dh,auth:json.keys?.auth,user_agent:navigator.userAgent,device_label:'iPhone admin companion',enabled:true,updated_at:new Date().toISOString()},{onConflict:'endpoint'});if(error)throw error;toast('Notifications enabled.');await updateNotificationState(); }catch(error){toast(error.message||'Unable to enable notifications.');}
});

async function updateBadge(){ const count=state.queue.length; if('setAppBadge' in navigator){try{if(count)await navigator.setAppBadge(count);else await navigator.clearAppBadge();}catch{}} }
function subscribeRealtime(){ state.channels.forEach((c)=>c.unsubscribe()); state.channels=[]; ['access_requests','tree_change_sets','contributions','evidence_items'].forEach((table)=>{const c=supabase.channel(`mobile-admin-${table}`).on('postgres_changes',{event:'*',schema:'public',table},()=>scheduleRefresh()).subscribe();state.channels.push(c);}); }
function scheduleRefresh(){window.clearTimeout(state.refreshTimer);state.refreshTimer=window.setTimeout(()=>refreshAll().catch(()=>{}),350);}
async function refreshAll(){ ui.refreshButton.disabled=true; try{await loadReferenceData();await loadQueues();}catch(error){toast(error.message||'Unable to refresh.');}finally{ui.refreshButton.disabled=false;} }
ui.refreshButton.addEventListener('click',refreshAll);

async function showAdmin(session){
  state.session=session; state.profile=await editorProfile(session); const allowed=state.profile?.status==='approved'&&['editor','admin'].includes(state.profile.role); ui.authView.classList.add('hidden');
  if(!allowed){ui.forbiddenView.classList.remove('hidden');ui.adminApp.classList.add('hidden');return;}
  ui.forbiddenView.classList.add('hidden');ui.adminApp.classList.remove('hidden');await refreshAll();subscribeRealtime();await updateNotificationState();
  const params=new URLSearchParams(location.search); const review=params.get('review'),id=params.get('id'); if(review&&id){switchTab('review');setTimeout(()=>openReview(review,id),150);history.replaceState({},'',location.pathname);}
}

ui.loginForm.addEventListener('submit',async(event)=>{event.preventDefault();state.loginEmail=ui.loginEmail.value.trim();setAuthMessage('Sending sign-in code…');const {error}=await supabase.auth.signInWithOtp({email:state.loginEmail,options:{shouldCreateUser:false}});if(error)return setAuthMessage(error.message,'error');ui.loginForm.classList.add('hidden');ui.otpForm.classList.remove('hidden');setAuthMessage('Enter the newest code sent to your email.','success');ui.otpCode.focus();});
ui.otpForm.addEventListener('submit',async(event)=>{event.preventDefault();setAuthMessage('Verifying…');const {data,error}=await supabase.auth.verifyOtp({email:state.loginEmail,token:ui.otpCode.value.trim(),type:'email'});if(error)return setAuthMessage(error.message,'error');await showAdmin(data.session);});
document.getElementById('forbiddenSignOut').addEventListener('click',async()=>{await supabase.auth.signOut();location.reload();});

supabase.auth.onAuthStateChange((_event,session)=>{if(session&&!state.session)showAdmin(session).catch((error)=>setAuthMessage(error.message,'error'));});
const {data:{session}}=await supabase.auth.getSession(); if(session)await showAdmin(session); else ui.authView.classList.remove('hidden');
