const treeCanvas = document.getElementById('treeCanvas');
const STORAGE_KEY = 'genealogyFanViewStateV2';
let controlsBound = false;
let repairTimer = null;

function controls() {
  return {
    mode: document.getElementById('treeViewMode'),
    depth: document.getElementById('generationDepth'),
  };
}

function readSavedDepth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return saved?.depth ? String(saved.depth) : null;
  } catch {
    return null;
  }
}

function saveDepth() {
  const { depth } = controls();
  if (!depth) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ depth: depth.value }));
  } catch {
    // View persistence is a convenience only.
  }
}

function enhancedSvgIsCurrent() {
  const svg = treeCanvas?.querySelector(':scope > svg');
  if (!svg) return false;
  return svg.getAttribute('viewBox') === '0 0 1200 1200';
}

function rerenderFromControls() {
  const { mode, depth } = controls();
  if (!mode || !depth || enhancedSvgIsCurrent()) return;
  mode.dispatchEvent(new Event('change', { bubbles: true }));
  depth.dispatchEvent(new Event('change', { bubbles: true }));
}

function scheduleRepair(delay = 30) {
  window.clearTimeout(repairTimer);
  repairTimer = window.setTimeout(rerenderFromControls, delay);
}

function bindControls() {
  if (controlsBound) return true;
  const { mode, depth } = controls();
  if (!mode || !depth) return false;

  controlsBound = true;

  // Family/couple view is the deliberate default on every fresh page load.
  // Do not restore an old ancestry-mode choice from localStorage: that made a
  // signed-in family member unexpectedly appear without their spouse/partner.
  if ([...mode.options].some(option => option.value === 'family')) {
    mode.value = 'family';
  }

  const savedDepth = readSavedDepth();
  if (savedDepth && [...depth.options].some(option => option.value === savedDepth)) {
    depth.value = savedDepth;
  } else if ([...depth.options].some(option => option.value === '6')) {
    depth.value = '6';
  }

  depth.addEventListener('change', saveDepth);

  // Apply the defaults to whichever renderer currently owns the controls.
  queueMicrotask(() => {
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    depth.dispatchEvent(new Event('change', { bubbles: true }));
    saveDepth();
  });
  return true;
}

if (treeCanvas) {
  const canvasObserver = new MutationObserver((mutations) => {
    const svgWasReplaced = mutations.some((mutation) =>
      [...mutation.addedNodes].some((node) => node.nodeName?.toLowerCase() === 'svg'));
    if (svgWasReplaced) scheduleRepair();
  });
  canvasObserver.observe(treeCanvas, { childList: true, subtree: false });
}

const controlObserver = new MutationObserver(() => {
  if (bindControls()) controlObserver.disconnect();
});
controlObserver.observe(document.body, { childList: true, subtree: true });

if (!bindControls()) {
  window.addEventListener('load', () => {
    bindControls();
    scheduleRepair(120);
  });
}
