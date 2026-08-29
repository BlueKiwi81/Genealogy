import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const params = new URLSearchParams(location.search);
let currentContributionId = params.get('review') === 'contribution' ? params.get('id') : null;
let currentTreeChangeId = params.get('review') === 'tree_change' ? params.get('id') : null;
let currentReview = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);

async function runContribution(action, contributionId, approvedText = '') {
  const { data, error } = await supabase.functions.invoke('contribution-intelligent-review', {
    body: { action, contribution_id: contributionId, approved_text: approvedText },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function runTreeChange(action, changeSetId) {
  const { data, error } = await supabase.functions.invoke('tree-change-intelligent-review', {
    body: { action, change_set_id: changeSetId },
  });
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

function renderReview(review, error = '') {
  const body = document.getElementById('detailBody');
  if (!body) return;
  let box = body.querySelector('.mobile-intelligent-review');
  if (!box) {
    box = document.createElement('section');
    box.className = 'mobile-intelligent-review';
    const actions = body.querySelector('.sheet-actions');
    actions?.insertAdjacentElement('beforebegin', box);
  }
  if (error) {
    box.className = 'mobile-intelligent-review error';
    box.innerHTML = `<strong>Intelligent review could not finish</strong><p>${esc(error)}</p>`;
    return;
  }
  const rows = proposalRows(review);
  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  const audioReview = review.model === 'human-audio-review';
  box.className = `mobile-intelligent-review${review.decision === 'approve' ? '' : ' warning'}`;
  box.innerHTML = `<div class="mobile-ai-head"><strong>${audioReview?'Human audio review':'Intelligent review'}</strong><span>${audioReview?'No AI used':`${esc(String(review.decision || '').replaceAll('_',' '))} · ${Math.round(Number(review.confidence || 0)*100)}%`}</span></div><p>${esc(review.summary || '')}</p>${rows.length ? `<div class="mobile-ai-rows">${rows.map(([l,v])=>`<div><strong>${esc(l)}</strong><span>${esc(v)}</span></div>`).join('')}</div>`:''}${warnings.length ? `<ul>${warnings.map((w)=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}<details><summary>Why?</summary><p>${esc(review.rationale || '')}</p></details>`;
}

function installStyles() {
  if (document.getElementById('mobileIntelligentReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'mobileIntelligentReviewStyles';
  style.textContent = `.mobile-intelligent-review{margin:12px 0;padding:13px;border:1px solid #b9ceb1;border-radius:13px;background:#f1f7ed;font:.84rem/1.45 system-ui,sans-serif}.mobile-intelligent-review.warning{border-color:#dfc488;background:#fff8e8}.mobile-intelligent-review.error{border-color:#d9a7a0;background:#fff0ee}.mobile-ai-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.mobile-ai-head span{font-size:.7rem;text-transform:uppercase}.mobile-intelligent-review p{margin:6px 0}.mobile-ai-rows{display:grid;gap:6px;margin-top:8px}.mobile-ai-rows>div{display:grid;grid-template-columns:105px 1fr;gap:7px;padding:6px 7px;border-radius:8px;background:rgba(255,255,255,.65)}.mobile-ai-rows strong{font-size:.68rem;text-transform:uppercase}.mobile-intelligent-review ul{padding-left:18px}.mobile-intelligent-review summary{font-weight:700;cursor:pointer}`;
  document.head.appendChild(style);
}

function prepareApprovalButtons() {
  const contributionButton = document.getElementById('approveContributionButton');
  if (contributionButton && !contributionButton.dataset.aiReviewReady) contributionButton.textContent = 'Review intelligently';
  const treeButton = document.getElementById('approveTreeButton');
  if (treeButton && !treeButton.dataset.aiReviewReady) treeButton.textContent = 'Review intelligently';
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

document.addEventListener('click', async (event) => {
  const button = event.target instanceof Element ? event.target.closest('#approveContributionButton') : null;
  if (!button || !currentContributionId) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  button.disabled = true;

  try {
    if (!button.dataset.aiReviewReady) {
      button.textContent = 'Reviewing intelligently...';
      const result = await runContribution('review', currentContributionId);
      currentReview = result.review;
      renderReview(currentReview);
      if (currentReview?.decision === 'approve') {
        button.dataset.aiReviewReady = '1';
        button.textContent = currentReview.model === 'human-audio-review' ? 'Approve reviewed recording' : 'Approve reviewed contribution';
        button.disabled = false;
      } else {
        button.textContent = currentReview?.decision === 'reject_duplicate' ? 'AI flags a duplicate' : 'Manual review required';
        button.disabled = true;
      }
      return;
    }

    button.textContent = 'Applying reviewed contribution...';
    const approvedText = document.getElementById('contributionEdit')?.value.trim() || '';
    await runContribution('approve', currentContributionId, approvedText);
    document.getElementById('closeDetail')?.click();
    document.getElementById('refreshButton')?.click();
  } catch (error) {
    renderReview(currentReview, error?.message || 'Unable to complete intelligent review.');
    button.textContent = button.dataset.aiReviewReady ? (currentReview?.model === 'human-audio-review' ? 'Approve reviewed recording' : 'Approve reviewed contribution') : 'Review intelligently';
    button.disabled = false;
  }
}, true);

document.addEventListener('click', async (event) => {
  const button = event.target instanceof Element ? event.target.closest('#approveTreeButton') : null;
  if (!button || !currentTreeChangeId) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  button.disabled = true;

  try {
    if (!button.dataset.aiReviewReady) {
      button.textContent = 'Reviewing intelligently...';
      const result = await runTreeChange('review', currentTreeChangeId);
      currentReview = result.review;
      renderReview(currentReview);
      if (currentReview?.decision === 'approve') {
        button.dataset.aiReviewReady = '1';
        button.textContent = 'Approve reviewed tree change';
        button.disabled = false;
      } else {
        button.textContent = currentReview?.decision === 'reject_duplicate' ? 'AI flags a duplicate' : 'Manual review required';
        button.disabled = true;
      }
      return;
    }

    button.textContent = 'Applying reviewed tree change...';
    await runTreeChange('approve', currentTreeChangeId);
    document.getElementById('closeDetail')?.click();
    document.getElementById('refreshButton')?.click();
  } catch (error) {
    renderReview(currentReview, error?.message || 'Unable to complete intelligent tree review.');
    button.textContent = button.dataset.aiReviewReady ? 'Approve reviewed tree change' : 'Review intelligently';
    button.disabled = false;
  }
}, true);
