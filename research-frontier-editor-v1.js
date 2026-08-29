import { supabase } from './supabase-client-v1.js';

let pending = new Map();
let syncing = false;
let timer = null;

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function validStatus(value) { return ['strong','probable','hypothesis','unresolved'].includes(value) ? value : 'hypothesis'; }
function statusLabel(value) { return ({strong:'Strong lead',probable:'Probable',hypothesis:'Hypothesis',unresolved:'Unresolved'})[validStatus(value)]; }

function installStyles() {
  if (document.getElementById('researchFrontierEditorV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'researchFrontierEditorV1Styles';
  style.textContent = `
    .queue-card.research-frontier-review{border-color:#d7c399;background:#fffaf0}.research-frontier-editor-box{margin:10px 0 12px;padding:12px 13px;border:1px solid #dbc99f;border-radius:11px;background:#fff6df;font:.82rem/1.45 Arial,sans-serif;color:#51473d}.research-frontier-editor-box strong{display:block;margin-bottom:4px}.research-frontier-editor-box p{margin:0 0 9px}.research-frontier-editor-row{display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:10px;align-items:end}.research-frontier-editor-row label{display:grid;gap:4px}.research-frontier-editor-row label span{font:700 .68rem/1.25 Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#76695d}.research-frontier-editor-note{color:#75695d;font:.75rem/1.4 Arial,sans-serif}.research-frontier-action{margin-top:0}
    @media(max-width:700px){.research-frontier-editor-row{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

async function loadPendingResearch() {
  const { data:{session} } = await supabase.auth.getSession();
  if (!session) { pending = new Map(); return; }
  const { data, error } = await supabase.from('contributions')
    .select('id,target_person_id,narrative_text,payload,status,created_at')
    .eq('status','pending')
    .eq('contribution_type','research')
    .order('created_at',{ascending:true});
  if (error) throw error;
  pending = new Map((data || []).map((item)=>[item.id,item]));
}

function decorateCard(card, item) {
  if (!card || !item) return;
  card.classList.add('research-frontier-review');
  const normalApprove = card.querySelector('[data-approve-note],[data-publish-story]');
  if (normalApprove) normalApprove.classList.add('hidden');
  let box = card.querySelector('.research-frontier-editor-box');
  if (!box) {
    box = document.createElement('section');
    box.className = 'research-frontier-editor-box';
    const field = card.querySelector('.queue-field');
    (field || card.querySelector('.queue-actions'))?.insertAdjacentElement('beforebegin', box);
  }
  const initial = validStatus(item.payload?.frontier_status);
  box.innerHTML = `
    <strong>Research frontier — not canonical</strong>
    <p>This contribution was deliberately submitted as provisional research. Accepting it here preserves the lead without asserting that the person, date or relationship has been proved.</p>
    <div class="research-frontier-editor-row">
      <label><span>Frontier strength</span><select data-frontier-strength>
        <option value="strong"${initial==='strong'?' selected':''}>Strong lead</option>
        <option value="probable"${initial==='probable'?' selected':''}>Probable</option>
        <option value="hypothesis"${initial==='hypothesis'?' selected':''}>Hypothesis</option>
        <option value="unresolved"${initial==='unresolved'?' selected':''}>Unresolved</option>
      </select></label>
      <span class="research-frontier-editor-note">There is intentionally no “documented” choice here. Promotion to documented evidence must happen through the evidence/claim review process.</span>
    </div>`;
  const actions = card.querySelector('.queue-actions');
  if (actions && !actions.querySelector('[data-add-frontier]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button primary research-frontier-action';
    button.dataset.addFrontier = '1';
    button.textContent = 'Add to research frontier';
    actions.prepend(button);
    button.addEventListener('click', () => void acceptFrontier(card, item));
  }
}

async function acceptFrontier(card, item) {
  const button = card.querySelector('[data-add-frontier]');
  const message = document.getElementById('editorMessage');
  const status = validStatus(card.querySelector('[data-frontier-strength]')?.value || item.payload?.frontier_status);
  if (button) { button.disabled = true; button.textContent = 'Saving research frontier...'; }
  try {
    const { data:{session} } = await supabase.auth.getSession();
    if (!session) throw new Error('Please sign in again.');
    const firstLine = String(item.payload?.frontier_title || item.narrative_text || 'Family research lead').split(/\r?\n/).map((v)=>v.trim()).find(Boolean) || 'Family research lead';
    const attachmentCount = Number(item.payload?.attachment_count || 0);
    const { error:frontierError } = await supabase.from('research_frontier_entries').upsert({
      person_id:item.target_person_id,
      source_contribution_id:item.id,
      frontier_status:status,
      title:firstLine.slice(0,180),
      detail:item.narrative_text || firstLine,
      evidence_note:attachmentCount ? `${attachmentCount} attached source file${attachmentCount === 1 ? '' : 's'} retained with the original contribution.` : null,
      is_active:true,
      updated_at:new Date().toISOString()
    }, { onConflict:'source_contribution_id' });
    if (frontierError) throw frontierError;
    const { error:updateError } = await supabase.from('contributions').update({
      status:'approved',
      review_note:`Accepted as ${statusLabel(status).toLowerCase()} research-frontier material. Not canonical or documented.`,
      reviewed_by:session.user.id,
      reviewed_at:new Date().toISOString()
    }).eq('id',item.id);
    if (updateError) throw updateError;
    if (message) { message.textContent = `Research saved as ${statusLabel(status).toLowerCase()} frontier material without promoting it to canonical history.`; message.className='message success'; }
    document.dispatchEvent(new CustomEvent('genealogy:frontier-updated',{detail:{person_id:item.target_person_id}}));
    document.getElementById('refreshEditor')?.click();
  } catch (error) {
    if (message) { message.textContent = error?.message || 'Could not save this research-frontier entry.'; message.className='message error'; }
    if (button) { button.disabled = false; button.textContent = 'Add to research frontier'; }
  }
}

async function sync() {
  if (syncing) return;
  syncing = true;
  try {
    installStyles();
    await loadPendingResearch();
    document.querySelectorAll('#contributionQueue [data-contribution-id]').forEach((card) => {
      const item = pending.get(card.dataset.contributionId);
      if (item) decorateCard(card,item);
    });
  } catch {}
  finally { syncing = false; }
}

function schedule() { window.clearTimeout(timer); timer = window.setTimeout(sync,60); }
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
document.getElementById('refreshEditor')?.addEventListener('click',()=>window.setTimeout(schedule,120));
supabase.auth.onAuthStateChange(()=>window.setTimeout(schedule,100));
document.addEventListener('genealogy:archive-ready',schedule);
window.addEventListener('load',schedule);
schedule();
