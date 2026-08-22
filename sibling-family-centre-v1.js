// Ensure navigation from sibling controls always opens the selected sibling in Family view.
// This keeps spouse/partner information visible in the centre when the relationship qualifies
// for the family-centre renderer (current or ended by death).

function siblingNavigationTarget(target) {
  if (!(target instanceof Element)) return null;
  return target.closest('#collateralSiblingDrawer .collateral-person, #collateralSiblingCard .collateral-centre-action');
}

function forceFamilyViewForSiblingNavigation(event) {
  const action = siblingNavigationTarget(event.target);
  if (!action) return;

  const viewMode = document.getElementById('treeViewMode');
  if (!viewMode || viewMode.value === 'family') return;

  viewMode.value = 'family';
  viewMode.dispatchEvent(new Event('change', { bubbles: true }));
}

document.addEventListener('click', forceFamilyViewForSiblingNavigation, true);
