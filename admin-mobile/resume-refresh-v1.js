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

function requestSelectiveReview() {
  if (!activeTreeChangeId || !detailBody) return;
  const box = detailBody.querySelector('.mobile-intelligent-review');
  if (!box) return;
  if (box.nextElementSibling?.classList.contains('selective-review')) return;
  if (box.dataset.selectiveRequestedFor === activeTreeChangeId) return;
  box.dataset.selectiveRequestedFor = activeTreeChangeId;
  document.dispatchEvent(new CustomEvent('genealogy:tree-intelligent-review-rendered', {
    detail: { changeSetId: activeTreeChangeId }
  }));
}

document.addEventListener('click', (event) => {
  const reviewCard = event.target.closest?.('[data-review-kind="tree_change"][data-review-id]');
  if (reviewCard) {
    activeTreeChangeId = reviewCard.dataset.reviewId || null;
    window.setTimeout(requestSelectiveReview, 0);
    return;
  }
  if (event.target.closest?.('#closeDetail, #detailBackdrop')) activeTreeChangeId = null;
}, true);

if (detailBody) {
  new MutationObserver(() => window.setTimeout(requestSelectiveReview, 0))
    .observe(detailBody, { childList: true, subtree: true });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestRefresh();
});

window.addEventListener('focus', () => requestRefresh());
window.addEventListener('pageshow', () => {
  requestRefresh(true);
  window.setTimeout(requestSelectiveReview, 0);
});
