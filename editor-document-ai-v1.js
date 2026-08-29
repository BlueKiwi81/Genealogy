import { supabase } from './supabase-client-v1.js';

const queue = document.getElementById('contributionQueue');
const refreshButton = document.getElementById('refreshEditor');
const editorMessage = document.getElementById('editorMessage');
let decorating = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}
function human(value) { return String(value || '').replaceAll('_',' '); }
function setMessage(text, type='') {
  if (!editorMessage) return;
  editorMessage.textContent = text;
  editorMessage.className = `message${type ? ` ${type}` : ''}`;
}
function refs(payload) {
  const raw = Array.isArray(payload?.evidence_items) ? payload.evidence_items : [];
  return raw.map((x) => typeof x === 'string' ? { id:x } : x).filter((x) => x?.id);
}
async function invoke(action, evidenceId, contributionId, refresh=false) {
  const { data, error } = await supabase.functions.invoke('evidence-document-review', {
    body:{ action, evidence_id:evidenceId, contribution_id:contributionId, refresh },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function proposalHtml(proposals) {
  if (!Array.isArray(proposals) || !proposals.length) return '<p class="document-ai-muted">No claim-level changes were proposed from this record.</p>';
  return `<div class="document-ai-proposals">${proposals.map((p) => `
    <div class="document-ai-proposal ${p.match_state === 'conflicts' ? 'is-conflict' : ''}">
      <div><strong>${esc(p.claim_label || human(p.claim_type))}</strong><span>${esc(p.extracted_value || p.normalized_value || '')}</span></div>
      <small>${esc(human(p.match_state))} | ${esc(human(p.suggested_evidence_status))} | ${Math.round(Number(p.confidence || 0) * 100)}%</small>
      ${p.rationale ? `<p>${esc(p.rationale)}</p>` : ''}
    </div>`).join('')}</div>`;
}

function reviewHtml(review, item) {
  const status = review?.review_status || 'not_started';
  if (!review || status === 'failed') {
    return `<section class="document-ai-item" data-evidence-id="${esc(item.id)}">
      <div class="document-ai-item-head"><strong>${esc(item.original_filename || item.title || 'Attached record')}</strong><span>${status === 'failed' ? 'analysis failed' : 'not yet analysed'}</span></div>
      ${review?.error_text ? `<p class="document-ai-error">${esc(review.error_text)}</p>` : ''}
      <button type="button" class="button secondary document-ai-run" data-evidence-id="${esc(item.id)}">${status === 'failed' ? 'Retry AI transcription' : 'Run AI transcription'}</button>
    </section>`;
  }
  const privacy = Array.isArray(review.privacy_flags) ? review.privacy_flags : [];
  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  const manual = status === 'manual_required' || review.identity_match === 'mismatch';
  return `<section class="document-ai-item ${manual ? 'needs-manual' : ''}" data-evidence-id="${esc(item.id)}">
    <div class="document-ai-item-head"><strong>${esc(item.original_filename || item.title || 'Attached record')}</strong><span>${esc(human(status))}</span></div>
    <div class="document-ai-score"><span>Identity: ${esc(human(review.identity_match))}</span><span>Confidence: ${Math.round(Number(review.confidence || 0) * 100)}%</span></div>
    ${review.document_summary ? `<p class="document-ai-summary">${esc(review.document_summary)}</p>` : ''}
    ${privacy.length ? `<div class="document-ai-privacy"><strong>Privacy flags</strong>${privacy.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
    ${proposalHtml(review.claim_proposals)}
    ${warnings.length ? `<details><summary>Warnings</summary><ul>${warnings.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
    <details class="document-ai-transcription"><summary>Read transcription</summary><pre>${esc(review.transcription || 'No transcription returned.')}</pre></details>
    <button type="button" class="button ghost document-ai-run" data-evidence-id="${esc(item.id)}" data-refresh="true">Re-read document</button>
    ${manual ? '<p class="document-ai-manual">This item needs human judgement before claim changes are applied. You can still open and approve the source manually.</p>' : ''}
  </section>`;
}

async function decorate() {
  if (!queue || decorating) return;
  const cards = [...queue.querySelectorAll('[data-contribution-id]')].filter((card) => {
    const type = card.querySelector('.queue-title')?.textContent?.trim().toLowerCase();
    return type === 'source' && !card.dataset.documentAiEnhanced;
  });
  if (!cards.length) return;
  decorating = true;
  try {
    const contributionIds = cards.map((c) => c.dataset.contributionId);
    const { data: contributions, error } = await supabase.from('contributions').select('id,payload').in('id', contributionIds);
    if (error) throw error;
    const byId = new Map((contributions || []).map((c) => [c.id,c]));
    const evidenceIds = [...new Set((contributions || []).flatMap((c) => refs(c.payload).map((r) => r.id)))];
    const [{ data:evidence, error:evidenceError }, { data:reviews, error:reviewError }] = await Promise.all([
      evidenceIds.length ? supabase.from('evidence_items').select('id,title,original_filename').in('id', evidenceIds) : Promise.resolve({data:[],error:null}),
      evidenceIds.length ? supabase.from('evidence_ai_reviews').select('*').in('evidence_id', evidenceIds) : Promise.resolve({data:[],error:null}),
    ]);
    if (evidenceError) throw evidenceError;
    if (reviewError) throw reviewError;
    const evidenceMap = new Map((evidence || []).map((x) => [x.id,x]));
    const reviewMap = new Map((reviews || []).map((x) => [x.evidence_id,x]));

    for (const card of cards) {
      const contributionId = card.dataset.contributionId;
      const contribution = byId.get(contributionId);
      const itemRefs = refs(contribution?.payload);
      if (!itemRefs.length) { card.dataset.documentAiEnhanced = 'true'; continue; }
      const items = itemRefs.map((r) => evidenceMap.get(r.id) || r);
      const itemReviews = items.map((item) => reviewMap.get(item.id) || null);
      const box = document.createElement('section');
      box.className = 'document-ai-box';
      box.dataset.contributionId = contributionId;
      box.innerHTML = `<div class="document-ai-box-head"><div><strong>Intelligent document review</strong><span>The AI has access to the actual uploaded file, not just the contributor's description.</span></div></div>
        ${items.map((item, i) => reviewHtml(itemReviews[i], item)).join('')}`;

      const acceptable = itemReviews.length === items.length && itemReviews.every((r) => r && ['reviewed','accepted'].includes(r.review_status) && r.identity_match !== 'mismatch');
      if (acceptable) {
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.className = 'button primary document-ai-approve-all';
        approve.textContent = 'Approve AI reading and record';
        box.appendChild(approve);
      } else {
        const note = document.createElement('p');
        note.className = 'document-ai-muted';
        note.textContent = 'One-click approval becomes available when every attached item has a usable AI reading. Manual source approval remains available below.';
        box.appendChild(note);
      }
      const actions = card.querySelector('.queue-actions');
      card.insertBefore(box, actions || null);
      card.dataset.documentAiEnhanced = 'true';
    }
  } catch (error) {
    setMessage(error?.message || 'Unable to load intelligent document reviews.', 'error');
  } finally { decorating = false; }
}

async function runAnalysis(button) {
  const card = button.closest('[data-contribution-id]');
  const contributionId = card?.dataset.contributionId;
  const evidenceId = button.dataset.evidenceId;
  if (!contributionId || !evidenceId) return;
  button.disabled = true;
  setMessage('Reading the uploaded document and comparing it with the family record...');
  try {
    await invoke('analyze', evidenceId, contributionId, button.dataset.refresh === 'true');
    setMessage('Document transcription and evidence proposals are ready for review.', 'success');
    card.dataset.documentAiEnhanced = '';
    card.querySelector('.document-ai-box')?.remove();
    await decorate();
  } catch (error) {
    button.disabled = false;
    setMessage(error?.message || 'The document could not be analysed automatically.', 'error');
  }
}

async function approveAll(button) {
  const card = button.closest('[data-contribution-id]');
  const contributionId = card?.dataset.contributionId;
  const box = button.closest('.document-ai-box');
  if (!contributionId || !box) return;
  const evidenceIds = [...box.querySelectorAll('[data-evidence-id]')].map((x) => x.dataset.evidenceId).filter(Boolean);
  if (!evidenceIds.length) return;
  const { data:{ session } } = await supabase.auth.getSession();
  if (!session) return setMessage('Please sign in again before approving this record.', 'error');
  button.disabled = true;
  setMessage('Applying the reviewed evidence to the supported claims...');
  try {
    for (const evidenceId of evidenceIds) await invoke('accept', evidenceId, contributionId);
    const now = new Date().toISOString();
    const { error } = await supabase.from('contributions').update({
      status:'approved', review_note:'Approved after intelligent document transcription and claim-level evidence review.',
      reviewed_by:session.user.id, reviewed_at:now,
    }).eq('id', contributionId).eq('status','pending');
    if (error) throw error;
    setMessage('Document accepted. Supported claims were linked to the evidence; conflicts and uncertain items were left for manual review.', 'success');
    document.dispatchEvent(new CustomEvent('genealogy:provenance-updated'));
    refreshButton?.click();
  } catch (error) {
    button.disabled = false;
    setMessage(error?.message || 'The reviewed document could not be applied.', 'error');
  }
}

function installStyles() {
  if (document.getElementById('documentAiStyles')) return;
  const style = document.createElement('style');
  style.id = 'documentAiStyles';
  style.textContent = `
    .document-ai-box{margin:11px 0;padding:12px;border:1px solid #b9cbb7;border-radius:12px;background:#f5f8f2;display:grid;gap:10px}
    .document-ai-box-head>div{display:grid;gap:2px}.document-ai-box-head strong{font-size:.88rem}.document-ai-box-head span{font-size:.72rem;color:#6d655c;line-height:1.35}
    .document-ai-item{padding:10px;border:1px solid rgba(72,91,71,.16);border-radius:10px;background:#fff}.document-ai-item.needs-manual{border-color:#d8b37d;background:#fffaf0}
    .document-ai-item-head{display:flex;justify-content:space-between;gap:9px;align-items:flex-start}.document-ai-item-head strong{font-size:.82rem;overflow-wrap:anywhere}.document-ai-item-head span{font-size:.66rem;text-transform:uppercase;color:#73685e}
    .document-ai-score{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:.69rem;color:#70665c}.document-ai-summary{font-size:.79rem;line-height:1.45;margin:8px 0}
    .document-ai-proposals{display:grid;gap:6px;margin:8px 0}.document-ai-proposal{padding:8px;border-radius:8px;background:#f2f6ef}.document-ai-proposal.is-conflict{background:#fff0ec}.document-ai-proposal>div{display:grid;gap:2px}.document-ai-proposal strong{font-size:.75rem}.document-ai-proposal span{font-size:.78rem}.document-ai-proposal small{display:block;margin-top:3px;font-size:.64rem;color:#776e65;text-transform:capitalize}.document-ai-proposal p{margin:4px 0 0;font-size:.7rem;line-height:1.4;color:#665d54}
    .document-ai-privacy{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin:7px 0}.document-ai-privacy strong{font-size:.69rem}.document-ai-privacy span{padding:3px 6px;border-radius:999px;background:#f4e3cf;font-size:.63rem;color:#6c4d34}
    .document-ai-transcription pre{white-space:pre-wrap;max-height:240px;overflow:auto;padding:9px;border-radius:8px;background:#f7f4ef;font: .72rem/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#493f37}.document-ai-item details{margin-top:7px}.document-ai-item summary{cursor:pointer;font-size:.72rem;font-weight:700}
    .document-ai-muted,.document-ai-manual,.document-ai-error{margin:6px 0 0;font-size:.7rem;line-height:1.4;color:#766b61}.document-ai-error{color:#91483f}.document-ai-manual{color:#7b5a32}.document-ai-box>.button{justify-self:start}
    @media(max-width:640px){.document-ai-item-head{display:grid}.document-ai-box>.button{width:100%}.document-ai-item .button{width:100%;margin-top:7px}}
  `;
  document.head.appendChild(style);
}

if (queue) {
  installStyles();
  queue.addEventListener('click', (event) => {
    const run = event.target.closest('.document-ai-run');
    const approve = event.target.closest('.document-ai-approve-all');
    if (run) { event.preventDefault(); event.stopPropagation(); runAnalysis(run); }
    else if (approve) { event.preventDefault(); event.stopPropagation(); approveAll(approve); }
  }, true);
  const observer = new MutationObserver(() => setTimeout(decorate, 0));
  observer.observe(queue, { childList:true, subtree:false });
  window.addEventListener('load', () => setTimeout(decorate, 600));
}
