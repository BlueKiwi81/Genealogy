const treeCanvas = document.getElementById('treeCanvas');

function alignCentreCardsWithAncestry() {
  const svg = treeCanvas?.querySelector('svg[viewBox="0 0 1200 1200"]');
  if (!svg) return;
  const cards = [...svg.querySelectorAll(':scope > .family-centre-person')];
  if (cards.length !== 2) return;

  // The current fan assigns the primary person's ancestry to the right half
  // and the partner's ancestry to the left half. Keep the ancestry geometry
  // stable and place each centre card on the matching side.
  cards[0].setAttribute('transform', 'translate(156 0)');
  cards[1].setAttribute('transform', 'translate(-156 0)');
}

function scheduleAlignment() {
  setTimeout(alignCentreCardsWithAncestry, 25);
  setTimeout(alignCentreCardsWithAncestry, 100);
}

if (treeCanvas) {
  const observer = new MutationObserver(scheduleAlignment);
  observer.observe(treeCanvas, { childList: true, subtree: false });
}

document.getElementById('centreSelect')?.addEventListener('change', scheduleAlignment);
document.getElementById('treeViewMode')?.addEventListener('change', scheduleAlignment);
document.addEventListener('genealogy:known-as-updated', scheduleAlignment);
scheduleAlignment();
