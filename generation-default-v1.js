const STORAGE_KEY = 'genealogyGenerationDepthPreference';
const DEFAULT_DEPTH = 6;
let installed = false;

function availableMax(select) {
  const auto = [...select.options].find(option => option.value === 'auto');
  const match = auto?.textContent?.match(/\((\d+)\)/);
  if (match) return Number(match[1]);
  return Math.max(1, ...[...select.options].map(option => Number(option.value)).filter(Number.isFinite));
}

function desiredValue(select) {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'auto') return 'auto';
  const numeric = Number(saved || DEFAULT_DEPTH);
  const max = availableMax(select);
  return String(Math.max(1, Math.min(max, Number.isFinite(numeric) ? numeric : DEFAULT_DEPTH)));
}

function install() {
  const select = document.getElementById('generationDepth');
  if (!select || select.dataset.defaultDepthInstalled === '1') return false;
  select.dataset.defaultDepthInstalled = '1';
  const value = desiredValue(select);
  if ([...select.options].some(option => option.value === value) && select.value !== value) {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  select.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY, select.value || String(DEFAULT_DEPTH));
  });
  installed = true;
  return true;
}

function tryInstall() {
  if (install()) return;
  window.setTimeout(tryInstall, 80);
}

tryInstall();

document.addEventListener('genealogy:research-frontier-changed', () => {
  if (!installed) tryInstall();
});
