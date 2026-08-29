import { supabase } from './supabase-client-v1.js';

const reviewState = new Map();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function installStyles() {
  if (document.getElementById('treeIntelligentReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'treeIntelligentReviewStyles';
  style.textContent = `
    .tree-ai-review{margin:12px 0;padding:12px;border:1px solid rgba(91,72,55,.2);border-radius:12px;background:#fff}
    .tree-ai-review.review-approve{border-color:rgba(72,112,76,.34);background:#f6fbf5}
    .tree-ai-review.review-manual_review{border-color:rgba(164,105,44,.38);background:#fff9ee}
    .tree-ai-review.review-reject,.tree-ai-review.review-reject_duplicate{border-color:rgba(140,65,65,.34);background:#fff5f3}
    .tree-ai-review-head{display:flex;justify-content:space-between;gap:12px;align-items:start}
    .tree-ai-review h4{margin:2px 0 0;font-size:13px;color:#3f3329}
    .tree-ai-review-label{margin:0;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#74675b}
    .tree-ai-review-decision{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eee4d8;color:#5f5144;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .tree-ai-review.review-approve .tree-ai-review-decision{background:#e5f1e3;color:#466648}
    .tree-ai-review.review-manual_review .tree-ai-review-decision{background:#f7e4bd;color:#76531e}
    .tree-ai-review.review-reject .tree-ai-review-decision,.tree-ai-review.review-reject_duplicate .tree-ai-review-decision{background:#f5dfda;color:#7b413d}
    .tree-ai-review-summary{margin:9px 0 0;font-size:11px;font-weight:700;color:#493d33}
    .tree-ai-review-rationale{margin:6px 0 0;font-size:10.5px;line-height:1.45;color:#5e5146;white-space:pre-wrap}
    .tree-ai-review-warnings{margin:7px 0 0;padding-left:18px;font-size:10px;line-height:1.4;color:#76531e}
    .tree-ai-review-foot{margin:8px 0 0;font-size:9.5px;line-height:1.4;color:#75685d}
    .tree-ai-review-override-help{margin:9px 0 0;padding:9px 10px;border-radius:9px;background:rgba(164,105,44,.08);font-size:10px;line-height:1.4;color:#6c512e}
    .tree-ai-review-error{margin:10px 0;padding:10px;border-radius:10px;background:#fff3f0;color:#8a3e36;font-size:10.5px}
    .tree-ai-review-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
    .tree-ai-review-actions .button{font-size:10px;padding:6px 9px}
    .tree-ai-review-actions .override-confirm{font-weight:700}
  `;
  document.head.appendChild(style);
}

function reviewLabel(decision) {
  if (decision === 'approve') return 'Approve';
  if (decision === 'manual_review') return 'Manual review';
  if (decision === 'reject_duplicate') return 'Possible duplicate';
  if (decision === 'reject') return 'Do not approve';
  return String(decision || 'Review').replaceAll('_', ' ');
}

function confidenceLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return `${Math.round(numeric * 100)}% confidence`;
}

function setPageMessage(text = '', type = '') {
  const node = document.getElementById('treeChangeReviewMessage');
  if (!node) return;
  node.textContent = text;
  node.className = `message${type ? ` ${type}` : ''}`;
}

function reviewPanel(card) {
  let panel = card.querySelector('.tree-ai-review');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.className = 'tree-ai-review';
  const note = card.querySelector('.tree-change-note');
  if (note) note.insertAdjacentElement('beforebegin', panel);
  else card.appendChild(panel);
  return panel;
}

function renderLoading(card) {
  const panel = reviewPanel(card);
  panel.className = 'tree-ai-review';
  panel.innerHTML = `
    <p class="tree-ai-review-label">Intelligent review</p>
    <p class="tree-ai-review-rationale">Checking the proposed change against the current person, existing relationships, nearby family submissions, known claims and possible duplicates...</p>`;
}

function renderError(card, message) {
  const panel = reviewPanel(card);
  panel.className = 'tree-ai-review';
  panel.innerHTML = `
    <p class="tree-ai-review-label">Intelligent review</p>
    <div class="tree-ai-review-error">${esc(message || 'The intelligent review could not be completed.')}</div>`;
}

function renderReview(card, review, cached = false) {
  const panel = reviewPanel(card);
  const decision = review?.decision || 'manual_review';
  const warnings = Array.isArray(review?.warnings) ? review.warnings.filter(Boolean) : [];
  panel.className = `tree-ai-review review-${decision}`;
  panel.innerHTML = `
    <div class="tree-ai-review-head">
      <div>
        <p class="tree-ai-review-label">Intelligent review${cached ? ' - existing review' : ''}</p>
        <h4>${esc(reviewLabel(decision))}</h4>
      </div>
      <span class="tree-ai-review-decision">${esc(confidenceLabel(review?.confidence) || reviewLabel(decision))}</span>
    </div>
    ${review?.summary ? `<p class="tree-ai-review-summary">${esc(review.summary)}</p>` : ''}
    ${review?.rationale ? `<p class="tree-ai-review-rationale">${esc(review.rationale)}</p>` : ''}
    ${warnings.length ? `<ul class="tree-ai-review-warnings">${warnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul>` : ''}
    <p class="tree-ai-review-foot">This review checks identity, consistency, conflicts and duplicates. It does not turn family-supplied information into independent documentary proof.</p>
    ${decision !== 'approve' ? `
      <p class="tree-ai-review-override-help">If you have checked the warning and know the existing tree is wrong, you may override the review. Add a brief reason in the review note below. The AI warning and your override will both remain in the audit trail.</p>
      <div class="tree-ai-review-actions">
        <button type="button" class="button secondary" data-refresh-tree-ai-review>Run review again</button>
        <button type="button" class="button secondary" data-override-tree-ai-review>Approve despite review</button>
      </div>` : ''}`;
}

async function invokeReview(changeSetId, refresh = false) {
  const { data, error } = await supabase.functions.invoke('tree-change-intelligent-review', {
    body: { action: 'review', change_set_id: changeSetId, refresh }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.review) throw new Error('The intelligent review returned no review result.');
  return data;
}

async function invokeApproval(changeSetId) {
  const { data, error } = await supabase.functions.invoke('tree-change-intelligent-review', {
    body: { action: 'approve', change_set_id: changeSetId }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function invokeOverrideApproval(changeSetId, reason) {
  const { data, error } = await supabase.functions.invoke('tree-change-intelligent-review', {
    body: { action: 'override_approve', change_set_id: changeSetId, override_reason: reason }
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function setButtonBusy(button, busy, text) {
  if (!button) return;
  button.disabled = Boolean(busy);
  if (text) button.textContent = text;
}

async function runReview(changeSetId, card, button, refresh = false) {
  installStyles();
  setButtonBusy(button, true, refresh ? 'Reviewing again...' : 'Running intelligent review...');
  setPageMessage('Running intelligent review before this change can be approved...');
  renderLoading(card);
  try {
    const result = await invokeReview(changeSetId, refresh);
    const review = result.review;
    reviewState.set(changeSetId, { review, overrideArmed: false });
    renderReview(card, review, Boolean(result.cached));
    if (review.decision === 'approve') {
      setButtonBusy(button, false, 'Confirm approve and keep');
      setPageMessage('Intelligent review recommends approval. Read the review, then confirm if you agree.', 'success');
    } else {
      setButtonBusy(button, true, 'Approval paused by review');
      const note = card.querySelector('.tree-change-note');
      if (note) note.placeholder = 'Required for override: briefly explain why you are accepting this change despite the review';
      setPageMessage(`Intelligent review marked this ${reviewLabel(review.decision).toLowerCase()}. You can review again, reject it, or deliberately override the review with a reason.`, 'error');
    }
  } catch (error) {
    const message = error?.message || 'Unable to run the intelligent review.';
    reviewState.delete(changeSetId);
    renderError(card, message);
    setButtonBusy(button, false, 'Try intelligent review again');
    setPageMessage(message, 'error');
  }
}

async function approveReviewedChange(changeSetId, card, button) {
  const current = reviewState.get(changeSetId);
  if (current?.review?.decision !== 'approve') {
    await runReview(changeSetId, card, button, false);
    return;
  }

  const note = card.querySelector('.tree-change-note')?.value.trim() || '';
  setButtonBusy(button, true, 'Approving reviewed change...');
  setPageMessage('Applying the reviewed change to the shared canonical tree...');

  try {
    if (note) {
      const { error: noteError } = await supabase.from('tree_change_sets')
        .update({ review_note: note })
        .eq('id', changeSetId)
        .eq('status', 'pending');
      if (noteError) throw noteError;
    }

    await invokeApproval(changeSetId);
    reviewState.delete(changeSetId);
    setPageMessage('Approved. The reviewed change is now part of the shared canonical tree.', 'success');
    document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
    document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
  } catch (error) {
    const message = error?.message || 'Unable to approve this reviewed tree change.';
    setButtonBusy(button, false, 'Confirm approve and keep');
    setPageMessage(message, 'error');
    renderError(card, message);
  }
}

async function overrideReviewedChange(changeSetId, card, button) {
  const current = reviewState.get(changeSetId);
  if (!current?.review || current.review.decision === 'approve') return;

  const note = card.querySelector('.tree-change-note');
  const reason = note?.value.trim() || '';
  if (reason.length < 8) {
    if (note) {
      note.placeholder = 'Required for override: briefly explain why you are accepting this change despite the review';
      note.focus();
    }
    setPageMessage('Before overriding the intelligent review, add a brief reason in the review note.', 'error');
    return;
  }

  if (!current.overrideArmed) {
    current.overrideArmed = true;
    reviewState.set(changeSetId, current);
    button.textContent = 'Confirm override and approve';
    button.classList.add('override-confirm');
    setPageMessage('Override is armed. Press "Confirm override and approve" once more to make the change canonical. The AI warning and your reason will both be retained.', 'error');
    return;
  }

  setButtonBusy(button, true, 'Approving override...');
  setPageMessage('Recording your override and applying the family correction...');
  try {
    await invokeOverrideApproval(changeSetId, reason);
    reviewState.delete(changeSetId);
    setPageMessage('Approved by editor override. The AI warning and your reason have been retained in the audit trail.', 'success');
    document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
    document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
  } catch (error) {
    const message = error?.message || 'Unable to approve this override.';
    current.overrideArmed = false;
    reviewState.set(changeSetId, current);
    setButtonBusy(button, false, 'Approve despite review');
    button.classList.remove('override-confirm');
    setPageMessage(message, 'error');
  }
}

document.addEventListener('input', (event) => {
  const note = event.target.closest?.('.tree-change-note');
  if (!note) return;
  const card = note.closest('[data-tree-change-id]');
  const changeSetId = card?.dataset?.treeChangeId;
  if (!changeSetId) return;
  const current = reviewState.get(changeSetId);
  if (current?.overrideArmed) {
    current.overrideArmed = false;
    reviewState.set(changeSetId, current);
    const overrideButton = card.querySelector('[data-override-tree-ai-review]');
    if (overrideButton) {
      overrideButton.textContent = 'Approve despite review';
      overrideButton.classList.remove('override-confirm');
    }
  }
}, true);

document.addEventListener('click', async (event) => {
  const refreshButton = event.target.closest?.('[data-refresh-tree-ai-review]');
  if (refreshButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = refreshButton.closest('[data-tree-change-id]');
    const approveButton = card?.querySelector('[data-approve-tree-change]');
    const changeSetId = card?.dataset?.treeChangeId;
    if (card && approveButton && changeSetId) await runReview(changeSetId, card, approveButton, true);
    return;
  }

  const overrideButton = event.target.closest?.('[data-override-tree-ai-review]');
  if (overrideButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = overrideButton.closest('[data-tree-change-id]');
    const changeSetId = card?.dataset?.treeChangeId;
    if (card && changeSetId) await overrideReviewedChange(changeSetId, card, overrideButton);
    return;
  }

  const button = event.target.closest?.('[data-approve-tree-change]');
  if (!button) return;
  const card = button.closest('[data-tree-change-id]');
  const changeSetId = card?.dataset?.treeChangeId;
  if (!card || !changeSetId) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const current = reviewState.get(changeSetId);
  if (!current) {
    await runReview(changeSetId, card, button, false);
    return;
  }

  if (current.review?.decision === 'approve') {
    await approveReviewedChange(changeSetId, card, button);
    return;
  }

  await runReview(changeSetId, card, button, true);
}, true);

installStyles();
