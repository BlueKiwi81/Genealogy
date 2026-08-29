import { supabase } from './supabase-client-v1.js';

const reviews = new Map();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

async function run(action, contributionId) {
  const { data, error } = await supabase.functions.invoke('contribution-intelligent-review', {
    body: { action, contribution_id: contributionId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function proposalRows(review) {
  const p = review?.proposal || {};
  const rows = [];
  const updates = p.person_updates || {};
  const labels = {
    preferred_name: 'Known as', birth_date: 'Birth date', death_date: 'Death date',
    birth_place: 'Birth place', death_place: 'Death place', occupation_summary: 'Occupation', narrative_summary: 'Family note',
  };
  Object.entries(updates).forEach(([key, value]) => { if (value) rows.push([labels[key] || key, value]); });
  if (p?.new_relative?.role && p.new_relative.role !== 'none') {
    const name = [p.new_relative.given_names, p.new_relative.surname].filter(Boolean).join(' ');
    rows.push(['New relative', `${p.new_relative.role}: ${name || 'name not supplied'}`]);
  }
  if (p.publish_story) rows.push(['Narrative', 'Publish as an approved family recollection']);
  return rows;
}

function renderReview(card, review, error = '') {
  let box = card.querySelector('.intelligent-review-box');
  if (!box) {
    box = document.createElement('section');
    box.className = 'intelligent-review-box';
    const actions = card.querySelector('.queue-actions');
    actions?.insertAdjacentElement('beforebegin', box);
  }
  if (error) {
    box.innerHTML = `<strong>Intelligent review could not finish</strong><p>${esc(error)}</p>`;
    box.classList.add('error');
    return;
  }
  const rows = proposalRows(review);
  const warnings = Array.isArray(review.warnings) ? review.warnings : [];
  box.classList.toggle('warning', review.decision !== 'approve');
  box.innerHTML = `
    <div class="intelligent-review-head"><strong>Intelligent review</strong><span>${esc(String(review.decision || '').replaceAll('_',' '))} - ${Math.round(Number(review.confidence || 0) * 100)}%</span></div>
    <p>${esc(review.summary || '')}</p>
    ${rows.length ? `<div class="intelligent-review-changes">${rows.map(([l,v]) => `<div><strong>${esc(l)}</strong><span>${esc(v)}</span></div>`).join('')}</div>` : ''}
    ${warnings.length ? `<ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    <details><summary>Why?</summary><p>${esc(review.rationale || '')}</p></details>`;
}

function installStyles() {
  if (document.getElementById('intelligentContributionReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'intelligentContributionReviewStyles';
  style.textContent = `
    .intelligent-review-box{margin:12px 0;padding:13px 14px;border:1px solid #bfd0b7;border-radius:12px;background:#f2f7ee;color:#423a33;font:.84rem/1.45 Arial,sans-serif}
    .intelligent-review-box.warning{border-color:#e2c58f;background:#fff8e9}.intelligent-review-box.error{border-color:#ddb1aa;background:#fff1ef}
    .intelligent-review-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:7px}.intelligent-review-head>span{font-size:.74rem;text-transform:uppercase;letter-spacing:.04em;color:#6b6157}
    .intelligent-review-box p{margin:5px 0}.intelligent-review-box ul{margin:8px 0 0;padding-left:19px}.intelligent-review-box details{margin-top:8px}.intelligent-review-box summary{cursor:pointer;font-weight:700}
    .intelligent-review-changes{display:grid;gap:6px;margin:9px 0}.intelligent-review-changes>div{display:grid;grid-template-columns:120px 1fr;gap:8px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.65)}
    .intelligent-review-changes strong{font-size:.72rem;text-transform:uppercase;color:#75695f}
  `;
  document.head.appendChild(style);
}

installStyles();

document.addEventListener('click', async (event) => {
  const button = event.target instanceof Element ? event.target.closest('[data-approve-note],[data-publish-story]') : null;
  if (!button) return;
  const card = button.closest('[data-contribution-id]');
  const contributionId = card?.dataset?.contributionId;
  if (!card || !contributionId) return;

  const contributionType = card.querySelector('.queue-title')?.textContent?.trim().toLowerCase() || '';
  if (contributionType === 'source') {
    // Source files require the editor to open and inspect the actual attachment.
    // Do not allow the text-only intelligent contribution review to masquerade
    // as document review. The evidence-specific review handler will take over.
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    button.disabled = true;
    if (!button.dataset.aiReviewReady) {
      button.textContent = 'Reviewing intelligently...';
      const result = await run('review', contributionId);
      const review = result.review;
      reviews.set(contributionId, review);
      renderReview(card, review);
      if (review?.decision === 'approve') {
        button.dataset.aiReviewReady = '1';
        button.textContent = 'Approve reviewed contribution';
        button.disabled = false;
      } else {
        button.textContent = review?.decision === 'reject_duplicate' ? 'AI flags a duplicate' : 'Manual review required';
        button.disabled = true;
      }
      return;
    }

    button.textContent = 'Applying reviewed contribution...';
    await run('approve', contributionId);
    card.remove();
    document.getElementById('refreshEditor')?.click();
  } catch (error) {
    renderReview(card, reviews.get(contributionId), error?.message || 'Unable to complete intelligent review.');
    button.textContent = button.dataset.aiReviewReady ? 'Approve reviewed contribution' : 'Review intelligently';
    button.disabled = false;
  }
}, true);
