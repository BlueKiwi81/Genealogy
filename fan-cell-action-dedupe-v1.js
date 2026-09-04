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

// Compatibility bridge for the older upload/research modules. Those modules
// still switch the hidden contributionType select to "source", while the
// current contribution workflow validates the visible contributionCategory
// checkboxes. Ensure a legacy source hand-off also selects the new Source chip.
const legacyContributionType = document.getElementById('contributionType');

function syncLegacySourceCategory() {
  if (legacyContributionType?.value !== 'source') return;
  const sourceCategory = document.querySelector('input[name="contributionCategory"][value="source"]');
  if (!sourceCategory || sourceCategory.checked) return;
  sourceCategory.checked = true;
  sourceCategory.dispatchEvent(new Event('change', { bubbles: true }));
}

legacyContributionType?.addEventListener('change', syncLegacySourceCategory);
// Also cover a source mode selected before this late compatibility module loaded.
syncLegacySourceCategory();
