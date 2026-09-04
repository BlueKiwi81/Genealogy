const legacyType = document.getElementById('contributionType');

function syncLegacyTypeToCategories() {
  if (!legacyType) return;
  const value = legacyType.value;
  const categories = [...document.querySelectorAll('input[name="contributionCategory"]')];
  const selected = categories.find((checkbox) => checkbox.value === value);
  if (!selected) return;

  // Older upload/research modules still change the hidden contributionType select.
  // The current contribution workflow validates the newer checkbox categories.
  // Keep those two representations aligned whenever a legacy module changes type.
  for (const checkbox of categories) checkbox.checked = checkbox === selected;
  selected.dispatchEvent(new Event('change', { bubbles: true }));
}

legacyType?.addEventListener('change', syncLegacyTypeToCategories);
