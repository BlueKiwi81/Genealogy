import './editor-tree-selective-core-v1.js?v=20260905-7';
import './editor-tree-suggestions-v1.js?v=4';

const BUILD = '2026-09-05.7';
const markBuild = () => {
  const heading = document.querySelector('.tree-change-review-heading .small');
  if (!heading) return;
  let badge = heading.querySelector('[data-tree-review-build]');
  if (!badge) {
    badge = document.createElement('span');
    badge.dataset.treeReviewBuild = BUILD;
    badge.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 6px;border-radius:999px;background:#eef3ea;color:#4d704f;font-size:9px;font-weight:700;';
    heading.appendChild(badge);
  }
  badge.textContent = `Review build ${BUILD}`;
};
markBuild();
new MutationObserver(markBuild).observe(document.body, { childList: true, subtree: true });
