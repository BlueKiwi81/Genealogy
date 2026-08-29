import './language-bootstrap-v1.js?v=4';

const STORAGE_KEY = 'genealogyGenerationDepthPreference';
const DEFAULT_DEPTH = 5;
let installed = false;

function availableMax(select) {
  const auto = [...select.options].find(option => option.value === 'auto');
  const match = auto?.textContent?.match(/\((\d+)/);
  if (match) return Number(match[1]);
  const numeric = [...select.options].map(option => Number(option.value)).filter(Number.isFinite);
  return numeric.length ? Math.max(...numeric) : 0;
}

function desiredValue(select) {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'auto') return 'auto';
  const numeric = Number(saved || DEFAULT_DEPTH);
  const max = availableMax(select);
  if (max < 2) return null;
  return String(Math.max(1, Math.min(max, Number.isFinite(numeric) ? numeric : DEFAULT_DEPTH)));
}

function moveCentreControl() {
  const button = document.getElementById('centreMe');
  const controls = document.querySelector('.tree-panel .enhanced-tree-controls');
  if (!button || !controls) return false;
  if (button.parentElement !== controls) {
    button.classList.add('tree-centre-me');
    button.setAttribute('title', 'Place my profile at the centre of the tree');
    controls.appendChild(button);
  }
  if (!document.getElementById('treeCentreMePlacementStyles')) {
    const style = document.createElement('style');
    style.id = 'treeCentreMePlacementStyles';
    style.textContent = '.enhanced-tree-controls .tree-centre-me{align-self:end;min-height:38px;margin:0;white-space:nowrap}';
    document.head.appendChild(style);
  }
  return true;
}

function install() {
  const select = document.getElementById('generationDepth');
  if (!select || select.dataset.defaultDepthInstalled === '1') {
    moveCentreControl();
    return false;
  }

  const value = desiredValue(select);
  if (!value) {
    moveCentreControl();
    return false;
  }

  select.dataset.defaultDepthInstalled = '1';
  if ([...select.options].some(option => option.value === value) && select.value !== value) {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  select.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY, select.value || String(DEFAULT_DEPTH));
  });
  moveCentreControl();
  installed = true;
  return true;
}

function tryInstall() {
  moveCentreControl();
  if (install()) return;
  window.setTimeout(tryInstall, 80);
}

tryInstall();

document.addEventListener('genealogy:research-frontier-changed', () => {
  moveCentreControl();
  if (!installed) tryInstall();
});
