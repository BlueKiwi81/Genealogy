import './tree-snapshot-centre-fit-v1.js';
import './access-activity-v1.js?v=1';
import './selective-tree-approval-v1.js?v=2';

const refreshButton = document.getElementById('refreshButton');
const detailBody = document.getElementById('detailBody');
let lastRefreshRequest = 0;
let activeTreeChangeId = new URLSearchParams(location.search).get('review') === 'tree_change'
  ? new URLSearchParams(location.search).get('id')
  : null;

function requestRefresh(force = false) {
  if (!refreshButton || document.visibilityState === 'hidden') return;
  const now = Date.now();
  if (!force && now - lastRefreshRequest < 4000) return;
  lastRefreshRequest = now;
  refreshButton.click();
}

function requestSelectiveReview(force = false) {
  if (!activeTreeChangeId || !detailBody) return false;
  const box = detailBody.querySelector('.mobile-intelligent-review');
  if (!box) return false;
  const existing = detailBody.querySelector('.selective-review');
  if (existing) {
    existing.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return true;
  }
  if (!force && box.dataset.selectiveRequestedFor === activeTreeChangeId) return false;
  box.dataset.selectiveRequestedFor = activeTreeChangeId;
  document.dispatchEvent(new CustomEvent('genealogy:tree-intelligent-review-rendered', {
    detail: { changeSetId: activeTreeChangeId }
  }));
  window.setTimeout(() => {
    const panel = detailBody.querySelector('.selective-review');
    if (panel) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 80);
  return true;
}

function ensureSelectiveAction() {
  if (!activeTreeChangeId || !detailBody) return;
  const actions = detailBody.querySelector('.sheet-actions');
  const approve = detailBody.querySelector('#approveTreeButton');
  const reject = detailBody.querySelector('#rejectTreeButton');
  if (!actions || !reject || !approve) return;
  if (detailBody.querySelector('#chooseSelectiveTreeButton')) return;

  const button = document.createElement('button');
  button.id = 'chooseSelectiveTreeButton';
  button.type = 'button';
  button.className = 'button secondary';
  button.textContent = 'Choose what to keep';
  button.addEventListener('click', () => {
    const box = detailBody.querySelector('.mobile-intelligent-review');
    if (!box) {
      button.textContent = 'Run intelligent review first';
      window.setTimeout(() => { button.textContent = 'Choose what to keep'; }, 1800);
      return;
    }
    box.dataset.selectiveRequestedFor = '';
    const dispatched = requestSelectiveReview(true);
    if (!dispatched) {
      button.textContent = 'Selective review unavailable';
      window.setTimeout(() => { button.textContent = 'Choose what to keep'; }, 1800);
    }
  });
  actions.insertBefore(button, reject);
}

document.addEventListener('click', (event) => {
  const reviewCard = event.target.closest?.('[data-review-kind="tree_change"][data-review-id]');
  if (reviewCard) {
    activeTreeChangeId = reviewCard.dataset.reviewId || null;
    window.setTimeout(() => {
      ensureSelectiveAction();
      requestSelectiveReview();
    }, 0);
    return;
  }
  if (event.target.closest?.('#closeDetail, #detailBackdrop')) activeTreeChangeId = null;
}, true);

if (detailBody) {
  new MutationObserver(() => window.setTimeout(() => {
    ensureSelectiveAction();
    requestSelectiveReview();
  }, 0)).observe(detailBody, { childList: true, subtree: true });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestRefresh();
});

window.addEventListener('focus', () => requestRefresh());
window.addEventListener('pageshow', () => {
  requestRefresh(true);
  window.setTimeout(() => {
    ensureSelectiveAction();
    requestSelectiveReview();
  }, 0);
});
