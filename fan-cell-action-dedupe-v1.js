function actionBackdrops() {
  return [...document.querySelectorAll('.fan-cell-action-backdrop:not(.research-case-backdrop)')];
}

function dedupeFanActionPopups() {
  const backdrops = actionBackdrops();
  if (backdrops.length <= 1) return;

  // Keep the most recently-created action popup. Multiple module instances can
  // otherwise respond to the same double-click and leave stacked dialogs.
  const keep = backdrops[backdrops.length - 1];
  backdrops.forEach((node) => {
    if (node !== keep) node.remove();
  });
}

// Run immediately in case this module loads while a duplicate pair is already open.
dedupeFanActionPopups();

const observer = new MutationObserver(() => {
  // Mutation observers run before the next paint, so duplicate dialogs are
  // collapsed before the user can interact with the lower copy.
  dedupeFanActionPopups();
});
observer.observe(document.body, { childList: true, subtree: true });
