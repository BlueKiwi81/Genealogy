import { supabase } from './supabase-client-v1.js';


const queue = document.getElementById('contributionQueue');
const refreshButton = document.getElementById('refreshEditor');
const editorMessage = document.getElementById('editorMessage');
let decorating = false;

function setEditorMessage(text, type = '') {
  if (!editorMessage) return;
  editorMessage.textContent = text;
  editorMessage.className = `message${type ? ` ${type}` : ''}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function evidenceRefs(payload) {
  const raw = payload?.evidence_items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => typeof item === 'string' ? { id: item } : item).filter((item) => item?.id);
}

async function openEvidence(path, filename) {
  const tab = window.open('', '_blank');
  try {
    const { data, error } = await supabase.storage.from('family-evidence').download(path);
    if (error) throw error;
    const url = URL.createObjectURL(data);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (error) {
    if (tab) tab.close();
    setEditorMessage(error?.message || `Unable to open ${filename || 'record'}.`, 'error');
  }
}

async function decorateSourceCards() {
  if (!queue || decorating) return;
  const cards = [...queue.querySelectorAll('[data-contribution-id]')].filter((card) => {
    const title = card.querySelector('.queue-title')?.textContent?.trim().toLowerCase();
    return title === 'source' && !card.dataset.evidenceEnhanced;
  });
  if (!cards.length) return;

  decorating = true;
  try {
    const ids = cards.map((card) => card.dataset.contributionId);
    const { data: contributions, error } = await supabase
      .from('contributions')
      .select('id, payload')
      .in('id', ids);
    if (error) throw error;

    const byId = new Map((contributions || []).map((item) => [item.id, item]));
    const evidenceIds = [...new Set((contributions || []).flatMap((item) => evidenceRefs(item.payload).map((ref) => ref.id)))];
    let evidenceById = new Map();
    if (evidenceIds.length) {
      const { data: evidence, error: evidenceError } = await supabase
        .from('evidence_items')
        .select('id, title, original_filename, storage_path, review_status')
        .in('id', evidenceIds);
      if (evidenceError) throw evidenceError;
      evidenceById = new Map((evidence || []).map((item) => [item.id, item]));
    }

    cards.forEach((card) => {
      const contribution = byId.get(card.dataset.contributionId);
      const refs = evidenceRefs(contribution?.payload);
      card.dataset.evidenceEnhanced = 'true';
      card.dataset.evidenceIds = refs.map((ref) => ref.id).join(',');
      if (!refs.length) return;

      const box = document.createElement('div');
      box.className = 'evidence-review-box';
      box.innerHTML = `<strong>Attached ${refs.length === 1 ? 'record' : 'records'}</strong>`;
      refs.forEach((ref) => {
        const item = evidenceById.get(ref.id) || ref;
        const row = document.createElement('div');
        row.className = 'evidence-review-row';
        const name = item.original_filename || item.title || 'Attached record';
        row.innerHTML = `<span>${esc(name)}</span>`;
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'button secondary evidence-open';
        open.textContent = 'Open record';
        open.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openEvidence(item.storage_path || ref.storage_path, name);
        });
        row.appendChild(open);
        box.appendChild(row);
      });
      const actions = card.querySelector('.queue-actions');
      card.insertBefore(box, actions || null);
    });
  } catch (error) {
    setEditorMessage(error?.message || 'Unable to load attached records.', 'error');
  } finally {
    decorating = false;
  }
}

async function reviewSourceCard(event) {
  const action = event.target.closest('[data-approve-note], [data-reject]');
  const card = action?.closest('[data-contribution-id]');
  if (!action || !card || !card.dataset.evidenceEnhanced || !card.dataset.evidenceIds) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const approved = action.hasAttribute('data-approve-note');
  const contributionId = card.dataset.contributionId;
  const evidenceIds = card.dataset.evidenceIds.split(',').filter(Boolean);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    setEditorMessage('Please sign in again before reviewing this record.', 'error');
    return;
  }

  action.disabled = true;
  setEditorMessage(approved ? 'Approving attached record...' : 'Rejecting attached record...');
  try {
    const now = new Date().toISOString();
    const { error: evidenceError } = await supabase
      .from('evidence_items')
      .update({
        review_status: approved ? 'approved' : 'rejected',
        reviewed_by: session.user.id,
        reviewed_at: now,
      })
      .in('id', evidenceIds);
    if (evidenceError) throw evidenceError;

    const editorText = card.querySelector('[data-edit]')?.value.trim() || '';
    const { error: contributionError } = await supabase
      .from('contributions')
      .update({
        status: approved ? 'approved' : 'rejected',
        review_note: approved ? (editorText || 'Approved source record for incorporation.') : 'Rejected by family editor.',
        reviewed_by: session.user.id,
        reviewed_at: now,
      })
      .eq('id', contributionId);
    if (contributionError) throw contributionError;

    setEditorMessage(approved
      ? 'Record approved. The original file remains preserved and restricted while its genealogical claims are incorporated.'
      : 'Record rejected. The original submission remains preserved.', 'success');
    refreshButton?.click();
  } catch (error) {
    action.disabled = false;
    setEditorMessage(error?.message || 'Unable to review this record.', 'error');
  }
}

function installStyles() {
  if (document.getElementById('evidenceReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'evidenceReviewStyles';
  style.textContent = `
    .evidence-review-box{margin:10px 0;padding:11px;border:1px solid rgba(96,82,67,.22);border-radius:10px;background:rgba(250,247,242,.75)}
    .evidence-review-box>strong{display:block;margin-bottom:7px}
    .evidence-review-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid rgba(96,82,67,.12)}
    .evidence-review-row:first-of-type{border-top:0}
    .evidence-review-row span{font-size:.86rem;overflow-wrap:anywhere}
    .evidence-review-row .button{white-space:nowrap}
  `;
  document.head.appendChild(style);
}

if (queue) {
  installStyles();
  queue.addEventListener('click', reviewSourceCard, true);
  const observer = new MutationObserver(() => window.setTimeout(decorateSourceCards, 0));
  observer.observe(queue, { childList: true, subtree: false });
  window.addEventListener('load', () => window.setTimeout(decorateSourceCards, 500));
}
