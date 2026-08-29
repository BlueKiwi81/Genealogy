import { supabase } from './supabase-client-v1.js';

const personDetails = document.getElementById('personDetails');
const personName = document.getElementById('personName');
const centreSelect = document.getElementById('centreSelect');
let currentPersonId = centreSelect?.value || null;
let timer = null;
let requestToken = 0;

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function statusLabel(value) { return ({strong:'Strong lead',probable:'Probable',hypothesis:'Hypothesis',unresolved:'Unresolved'})[value] || 'Research lead'; }

function installStyles() {
  if (document.getElementById('researchFrontierProfileV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'researchFrontierProfileV1Styles';
  style.textContent = `
    .person-research-frontier{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #e2d8cc}.person-research-frontier-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.person-research-frontier-head strong{font:700 .82rem/1.3 Arial,sans-serif;color:#5d4b3d}.person-research-frontier-head span{font:.68rem/1.2 Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#8a6d43}.person-research-frontier article{padding:10px 11px;border:1px dashed #d0b27f;border-radius:10px;background:#fff8e9}.person-research-frontier article header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.person-research-frontier article h4{margin:0;font:700 .83rem/1.35 Arial,sans-serif;color:#4c4035}.person-research-frontier-badge{flex:0 0 auto;padding:3px 6px;border-radius:999px;background:#efe0c4;font:700 .64rem/1.2 Arial,sans-serif;color:#6a5334}.person-research-frontier article p{margin:6px 0 0;font:.8rem/1.45 Arial,sans-serif;color:#5d5146}.person-research-frontier article small{display:block;margin-top:6px;color:#817466;font:.7rem/1.35 Arial,sans-serif}
  `;
  document.head.appendChild(style);
}

function render(rows) {
  if (!personDetails) return;
  document.getElementById('personResearchFrontier')?.remove();
  if (!rows?.length) return;
  const section = document.createElement('section');
  section.id = 'personResearchFrontier';
  section.className = 'person-research-frontier';
  section.innerHTML = `
    <div class="person-research-frontier-head"><strong>Research frontier</strong><span>Provisional · not proved</span></div>
    ${rows.map((row)=>`<article><header><h4>${esc(row.title || 'Family research lead')}</h4><span class="person-research-frontier-badge">${esc(statusLabel(row.frontier_status))}</span></header><p>${esc(row.detail || '')}</p>${row.evidence_note?`<small>${esc(row.evidence_note)}</small>`:''}</article>`).join('')}`;
  personDetails.appendChild(section);
}

async function load() {
  window.clearTimeout(timer);
  const token = ++requestToken;
  const personId = currentPersonId || centreSelect?.value || null;
  if (!personId) { render([]); return; }
  const { data, error } = await supabase.from('research_frontier_entries')
    .select('id,frontier_status,title,detail,evidence_note,created_at')
    .eq('person_id',personId)
    .eq('is_active',true)
    .order('created_at',{ascending:false});
  if (token !== requestToken) return;
  if (error) { render([]); return; }
  render(data || []);
}

function schedule(delay=60) { window.clearTimeout(timer); timer=window.setTimeout(load,delay); }

document.addEventListener('click',(event)=>{
  const node = event.target instanceof Element ? event.target.closest('[data-person-id],[data-snapshot-person]') : null;
  const id = node?.dataset?.personId || node?.dataset?.snapshotPerson;
  if (id) { currentPersonId=id; schedule(); }
},true);
centreSelect?.addEventListener('change',()=>{ currentPersonId=centreSelect.value||null; schedule(); });
if (personName) new MutationObserver(()=>schedule(90)).observe(personName,{childList:true,subtree:true,characterData:true});
document.addEventListener('genealogy:frontier-updated',(event)=>{ if (!event.detail?.person_id || event.detail.person_id===currentPersonId) schedule(40); });
document.addEventListener('genealogy:archive-ready',()=>schedule(100));
supabase.auth.onAuthStateChange(()=>schedule(100));
installStyles();
schedule(150);
