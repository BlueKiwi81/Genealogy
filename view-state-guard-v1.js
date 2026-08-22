const treeCanvas = document.getElementById('treeCanvas');
const STORAGE_KEY = 'genealogyFanViewStateV1';
let controlsBound = false;
let repairTimer = null;

function controls() {
  return {
    mode: document.getElementById('treeViewMode'),
    depth: document.getElementById('generationDepth'),
  };
}

function readSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState() {
  const { mode, depth } = controls();
  if (!mode || !depth) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: mode.value, depth: depth.value }));
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

  // The enhanced renderer owns these controls. Re-firing their current values
  // restores its internal state without changing the user's selection.
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
  const saved = readSavedState();
  let changed = false;

  if (saved?.mode && [...mode.options].some((option) => option.value === saved.mode)) {
    mode.value = saved.mode;
    changed = true;
  }
  if (saved?.depth && [...depth.options].some((option) => option.value === String(saved.depth))) {
    depth.value = String(saved.depth);
    changed = true;
  }

  mode.addEventListener('change', saveState);
  depth.addEventListener('change', saveState);

  if (changed) {
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    depth.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    saveState();
  }
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
