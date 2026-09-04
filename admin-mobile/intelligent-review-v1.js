import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';
import './selective-tree-approval-v1.js';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const params = new URLSearchParams(location.search);
const REVIEW_TIMEOUT_MS = 60000;
let currentContributionId = params.get('review') === 'contribution' ? params.get('id') : null;
let currentTreeChangeId = params.get('review') === 'tree_change' ? params.get('id') : null;
let currentReview = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);

function currentReviewKey() {
  if (currentTreeChangeId) return `tree_change:${currentTreeChangeId}`;
  if (currentContributionId) return `contribution:${currentContributionId}`;
  return '';
}

function reviewKey(kind, id) {
  return `${kind}:${id}`;
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} is taking longer than expected. No change has been applied. Close and reopen this item, then try once more; a completed review will be reused.`)), REVIEW_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

async function runContribution(action, contributionId, extra = {}) {
  const { data, error } = await withTimeout(supabase.functions.invoke('contribution-intelligent-review', {
    body: { action, contribution_id: contributionId, ...extra },
  }), 'The intelligent review');
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function runTreeChange(action, changeSetId, extra = {}) {
  const { data, error } = await withTimeout(supabase.functions.invoke('tree-change-intelligent-review', {
    body: { action, change_set_id: changeSetId, ...extra },
  }), 'The intelligent tree review');
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function proposalRows(review) {
  const p = review?.proposal || {};
  const rows = [];
  const labels = { preferred_name:'Known as', birth_date:'Birth date', death_date:'Death date', birth_place:'Birth place', death_place:'Death place', occupation_summary:'Occupation', narrative_summary:'Family note' };
  Object.entries(p.person_updates || {}).forEach(([key,value]) => { if (value) rows.push([labels[key] || key, value]); });
  if (p?.new_relative?.role && p.new_relative.role !== 'none') rows.push(['New relative', `${p.new_relative.role}: ${[p.new_relative.given_names,p.new_relative.surname].filter(Boolean).join(' ')}`]);
  if (p.publish_story) rows.push(['Narrative','Publish approved family recollection']);
  if (p.approve_source) rows.push(['Source','Approve attached source / record']);
  return rows;
}

function reviewBox() {
  const body = document.getElementById('detailBody');
  if (!body) return null;
  let box = body.querySelector('.mobile-intelligent-review');
  if (!box) {
    box = document.createElement('section');
    box.className = 'mobile-intelligent-review';
    const actions = body.querySelector('.sheet-actions');
    actions?.insertAdjacentElement('beforebegin', box);
  }
  return box;
}

function renderProgress() {
  const box = reviewBox();
  if (!box) return;
  box.className = 'mobile-intelligent-review working';
  box.setAttribute('role', 'status');
  box.innerHTML = `<strong>Running intelligent review</strong><p>Checking identities, dates, relationships, conflicts and possible duplicates. Nothing will be applied unless you make a separate editor decision.</p><p class="mobile-ai-wait">This normally takes 10 to 30 seconds.</p>`;
}

function renderReview(review, error = '', kind = '') {
  const box = reviewBox();
  if (!box) return;
  if (error) {
    box.className = 'mobile-intelligent-review error';
    box.setAttribute('role', 'alert');
    box.innerHTML = `<strong>Intelligent review could not finish on this screen</strong><p>${esc(error)}</p>`;
    return;
  }
  const rows = proposalRows(review);
  const warnings = Array.isArray(review?.warnings) ? review.warnings : [];
  const decision = review?.decision || 'manual_review';
  const finishedNote = decision === 'approve'
    ? 'The review is complete. Nothing has been applied yet; use the approval button below only if you agree.'
    : 'The review is complete and approval is paused. No tree or contribution data has been changed.';
  const actions = decision === 'approve' ? '' : `
    <div class="mobile-ai-actions">
      <button class="button secondary" type="button" data-mobile-review-again="${esc(kind)}">Run fresh review</button>
    </div>
    <p class="mobile-ai-action-message">Use the existing reject button if the warning confirms that this submission should not be applied.</p>`;
  box.removeAttribute('role');
  box.className = `mobile-intelligent-review${decision === 'approve' ? '' : ' warning'}`;
  box.innerHTML = `<div class="mobile-ai-head"><strong>Intelligent review finished</strong><span>${esc(String(decision).replaceAll('_',' '))} - ${Math.round(Number(review?.confidence || 0)*100)}%</span></div><p>${esc(review?.summary || '')}</p><p class="mobile-ai-finished">${esc(finishedNote)}</p>${rows.length ? `<div class="mobile-ai-rows">${rows.map(([l,v])=>`<div><strong>${esc(l)}</strong><span>${esc(v)}</span></div>`).join('')}</div>`:''}${warnings.length ? `<ul>${warnings.map((w)=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}<details><summary>Why?</summary><p>${esc(review?.rationale || '')}</p></details>${actions}`;
  window.requestAnimationFrame(() => box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

function installStyles() {
  if (document.getElementById('mobileIntelligentReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'mobileIntelligentReviewStyles';
  style.textContent = `.mobile-intelligent-review{margin:12px 0;padding:13px;border:1px solid #b9ceb1;border-radius:13px;background:#f1f7ed;font:.9rem/1.5 system-ui,sans-serif}.mobile-intelligent-review.warning{border-color:#dfc488;background:#fff8e8}.mobile-intelligent-review.error{border-color:#d9a7a0;background:#fff0ee}.mobile-intelligent-review.working{border-color:#b9c8d8;background:#f1f6fb}.mobile-ai-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.mobile-ai-head span{font-size:.76rem;text-transform:uppercase;text-align:right}.mobile-intelligent-review p{margin:7px 0}.mobile-ai-wait,.mobile-ai-finished{color:#62584f;font-size:.84rem}.mobile-ai-rows{display:grid;gap:6px;margin-top:8px}.mobile-ai-rows>div{display:grid;grid-template-columns:105px 1fr;gap:7px;padding:6px 7px;border-radius:8px;background:rgba(255,255,255,.65)}.mobile-ai-rows strong{font-size:.76rem;text-transform:uppercase}.mobile-intelligent-review ul{padding-left:20px}.mobile-intelligent-review summary{font-weight:700;cursor:pointer}.mobile-ai-actions{display:grid;gap:8px;margin-top:12px}.mobile-ai-actions .button{width:100%}.mobile-ai-action-message{min-height:0;color:#62584f;font-weight:700}`;
  document.head.appendChild(style);
}

function setReviewButtonState(button, kind, state, decision = '') {
  if (!button) return;
  button.dataset.aiReviewState = state;
  const noun = kind === 'tree_change' ? 'tree change' : 'contribution';
  if (state === 'idle') {
    button.disabled = false;
    button.textContent = 'Review intelligently';
  } else if (state === 'running') {
    button.disabled = true;
    button.textContent = 'Reviewing intelligently...';
  } else if (state === 'ready') {
    button.disabled = false;
    button.textContent = `Approve reviewed ${noun}`;
  } else if (state === 'manual') {
    button.disabled = true;
    button.textContent = decision === 'reject_duplicate' ? 'Review finished - possible duplicate' : 'Review finished - decision needed';
  } else if (state === 'applying') {
    button.disabled = true;
    button.textContent = `Applying reviewed ${noun}...`;
  } else if (state === 'error') {
    button.disabled = false;
    button.textContent = 'Show saved result or try again';
  }
}

function prepareApprovalButtons() {
  const contributionButton = document.getElementById('approveContributionButton');
  if (contributionButton && !contributionButton.dataset.aiReviewState) setReviewButtonState(contributionButton, 'contribution', 'idle');
  const treeButton = document.getElementById('approveTreeButton');
  if (treeButton && !treeButton.dataset.aiReviewState) setReviewButtonState(treeButton, 'tree_change', 'idle');
}

installStyles();

const detailBody = document.getElementById('detailBody');
if (detailBody) {
  new MutationObserver(() => window.setTimeout(prepareApprovalButtons, 0)).observe(detailBody, { childList: true, subtree: true });
}

document.addEventListener('click', (event) => {
  const reviewCard = event.target instanceof Element ? event.target.closest('[data-review-kind][data-review-id]') : null;
  if (!reviewCard) return;
  currentReview = null;
  if (reviewCard.dataset.reviewKind === 'contribution') {
    currentContributionId = reviewCard.dataset.reviewId;
    currentTreeChangeId = null;
  } else if (reviewCard.dataset.reviewKind === 'tree_change') {
    currentTreeChangeId = reviewCard.dataset.reviewId;
    currentContributionId = null;
  }
  window.setTimeout(prepareApprovalButtons, 0);
}, true);

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('#closeDetail, #detailBackdrop')) return;
  currentContributionId = null;
  currentTreeChangeId = null;
  currentReview = null;
}, true);

async function requestReview(kind, id, button, refresh = false) {
  const key = reviewKey(kind, id);
  setReviewButtonState(button, kind, 'running');
  renderProgress();
  try {
    const result = kind === 'tree_change'
      ? await runTreeChange('review', id, refresh ? { refresh: true } : {})
      : await runContribution('review', id, refresh ? { refresh: true } : {});
    if (currentReviewKey() !== key) return;
    currentReview = result.review;
    renderReview(currentReview, '', kind);
    if (kind === 'tree_change') {
      document.dispatchEvent(new CustomEvent('genealogy:tree-intelligent-review-rendered', {
        detail: { changeSetId: id, review: currentReview },
      }));
    }
    setReviewButtonState(button, kind, currentReview?.decision === 'approve' ? 'ready' : 'manual', currentReview?.decision);
  } catch (error) {
    if (currentReviewKey() !== key) return;
    renderReview(null, error?.message || 'Unable to complete intelligent review.', kind);
    setReviewButtonState(button, kind, 'error');
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target instanceof Element ? event.target.closest('#approveContributionButton') : null;
  if (!button || !currentContributionId) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    if (button.dataset.aiReviewState !== 'ready') {
      await requestReview('contribution', currentContributionId, button, false);
      return;
    }

    setReviewButtonState(button, 'contribution', 'applying');
    await runContribution('approve', currentContributionId);
    document.getElementById('closeDetail')?.click();
    document.getElementById('refreshButton')?.click();
  } catch (error) {
    renderReview(currentReview, error?.message || 'Unable to complete intelligent review.', 'contribution');
    setReviewButtonState(button, 'contribution', currentReview?.decision === 'approve' ? 'ready' : 'error');
  }
}, true);

document.addEventListener('click', async (event) => {
  const button = event.target instanceof Element ? event.target.closest('#approveTreeButton') : null;
  if (!button || !currentTreeChangeId) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    if (button.dataset.aiReviewState !== 'ready') {
      await requestReview('tree_change', currentTreeChangeId, button, false);
      return;
    }

    setReviewButtonState(button, 'tree_change', 'applying');
    await runTreeChange('approve', currentTreeChangeId);
    document.getElementById('closeDetail')?.click();
    document.getElementById('refreshButton')?.click();
  } catch (error) {
    renderReview(currentReview, error?.message || 'Unable to complete intelligent tree review.', 'tree_change');
    setReviewButtonState(button, 'tree_change', currentReview?.decision === 'approve' ? 'ready' : 'error');
  }
}, true);

document.addEventListener('click', async (event) => {
  const button = event.target instanceof Element ? event.target.closest('[data-mobile-review-again]') : null;
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const kind = button.dataset.mobileReviewAgain;
  const id = kind === 'tree_change' ? currentTreeChangeId : currentContributionId;
  const primary = document.getElementById(kind === 'tree_change' ? 'approveTreeButton' : 'approveContributionButton');
  if (!id || !primary) return;
  button.disabled = true;
  await requestReview(kind, id, primary, true);
}, true);
