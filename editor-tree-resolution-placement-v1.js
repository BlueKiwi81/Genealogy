import './fan-cell-action-dedupe-v1.js?v=1';

function placeResolutionAssistants() {
  document.querySelectorAll('.tree-ai-review .tree-ai-resolution-assistant').forEach((host) => {
    const review = host.closest('.tree-ai-review');
    if (review) review.insertAdjacentElement('afterend', host);
  });
}

placeResolutionAssistants();
const observer = new MutationObserver(placeResolutionAssistants);
observer.observe(document.body, { childList: true, subtree: true });
