const panel = document.querySelector('.tree-panel');
const canvas = document.getElementById('treeCanvas');
let lastModeNode = null;
let repairingFan = false;

function installStyles() {
  if (document.getElementById('treeInteractionGuardStyles')) return;
  const style = document.createElement('style');
  style.id = 'treeInteractionGuardStyles';
  style.textContent = `
    #treeExplorerControls{
      position:relative!important;
      z-index:30!important;
      isolation:isolate!important;
      pointer-events:auto!important;
    }
    #treeExplorerControls *{pointer-events:auto}
    #treeExplorerControls button,
    #treeExplorerControls select,
    #treeExplorerControls input,
    #treeExplorerControls label{
      pointer-events:auto!important;
      position:relative;
      z-index:1;
    }
    #treeStatus{position:relative;z-index:2}
    #treeCanvas{position:relative;z-index:1}
  `;
  document.head.appendChild(style);
}

function ensureFreshFamilyDefault() {
  const mode = document.getElementById('treeViewMode');
  if (!mode || mode === lastModeNode) return;
  lastModeNode = mode;

  // A renderer may replace the select after the page-state guard has run.
  // Preserve the deliberate fresh-load default when that happens.
  if ([...mode.options].some(option => option.value === 'family') && !window.__genealogyUserChangedViewMode) {
    mode.value = 'family';
    queueMicrotask(() => mode.dispatchEvent(new Event('change', { bubbles: true })));
  }

  mode.addEventListener('change', event => {
    if (event.isTrusted) window.__genealogyUserChangedViewMode = true;
  });
}

function reinforcePerspectiveButtons() {
  const switcher = document.getElementById('treePerspectiveSwitch');
  if (!switcher || switcher.dataset.interactionGuard === '1') return;
  switcher.dataset.interactionGuard = '1';
  switcher.querySelectorAll('button[data-tree-perspective]').forEach(button => {
    button.disabled = false;
    button.tabIndex = 0;
  });
}

function snapshotActive() {
  return document.querySelector('[data-tree-perspective="snapshot"][aria-pressed="true"]') !== null;
}

function ensureIdBasedFanRenderer() {
  if (!canvas || snapshotActive() || repairingFan) return;
  const svg = canvas.querySelector('svg');
  if (!svg) return;

  const personNodes = [...svg.querySelectorAll('.person-node,.family-centre-person,.family-child-node')];
  if (!personNodes.length) return;

  // The adaptive fan is the canonical renderer because every real person node carries
  // the stable database person ID. Older renderers can briefly win an event race and
  // are unsafe around namesakes. If that happens, immediately ask the adaptive renderer
  // to repaint rather than allowing any name-only person identity to remain on screen.
  const hasNameOnlyNode = personNodes.some(node => !node.dataset.personId);
  if (!hasNameOnlyNode) return;

  const depth = document.getElementById('generationDepth');
  if (!depth || depth.dataset.adaptive !== '1') return;
  repairingFan = true;
  queueMicrotask(() => {
    depth.dispatchEvent(new Event('change', { bubbles: true }));
    window.setTimeout(() => { repairingFan = false; }, 30);
  });
}

function apply() {
  installStyles();
  ensureFreshFamilyDefault();
  reinforcePerspectiveButtons();
  ensureIdBasedFanRenderer();
}

apply();
const observer = new MutationObserver(() => queueMicrotask(apply));
if (panel) observer.observe(panel, { childList: true, subtree: true });
window.addEventListener('load', () => window.setTimeout(apply, 80));
