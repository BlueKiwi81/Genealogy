import './editor-tree-selective-core-v3.js?v=20260905-9';
import './editor-tree-suggestions-v1.js?v=4';

const BUILD = '2026-09-05.9';
function markBuild() {
  const heading = document.querySelector('.tree-change-review-heading .small');
  if (!heading) return false;
  if (heading.querySelector('[data-tree-review-build]')) return true;
  const badge = document.createElement('span');
  badge.dataset.treeReviewBuild = BUILD;
  badge.textContent = `Review build ${BUILD}`;
  badge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 6px;border-radius:999px;background:#eef3ea;color:#4d704f;font-size:9px;font-weight:700;';
  heading.appendChild(badge);
  return true;
}

if (!markBuild()) {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (markBuild() || attempts >= 40) clearInterval(timer);
  }, 250);
}
