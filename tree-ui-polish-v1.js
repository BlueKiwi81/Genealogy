const treeCanvas = document.getElementById('treeCanvas');
const treePanel = document.querySelector('.tree-panel');
let repairQueued = false;
let snapshotRepairQueued = false;

function adaptiveSvg(svg) {
  return Boolean(svg?.querySelector('[data-fan-level]'));
}

function requestAdaptiveRender() {
  if (repairQueued || treePanel?.classList.contains('snapshot-active')) return;
  repairQueued = true;
  queueMicrotask(() => {
    repairQueued = false;
    const svg = treeCanvas?.querySelector(':scope > svg');
    if (!svg || adaptiveSvg(svg)) return;
    const depth = document.getElementById('generationDepth');
    const mode = document.getElementById('treeViewMode');
    if (depth) depth.dispatchEvent(new Event('change', { bubbles: true }));
    else if (mode) mode.dispatchEvent(new Event('change', { bubbles: true }));
    else window.setTimeout(requestAdaptiveRender, 60);
  });
}

function requestSnapshotRender() {
  if (snapshotRepairQueued || !treePanel?.classList.contains('snapshot-active')) return;
  snapshotRepairQueued = true;
  queueMicrotask(() => {
    snapshotRepairQueued = false;
    if (treeCanvas?.querySelector('.family-snapshot')) return;
    const button = document.querySelector('[data-tree-perspective="snapshot"]');
    if (button) button.click();
    else window.setTimeout(requestSnapshotRender, 80);
  });
}

function polishCentre(svg) {
  if (!adaptiveSvg(svg)) return;
  const disc = svg.querySelector('.family-centre-disc');
  const cards = [...svg.querySelectorAll('.family-centre-person')];
  if (!disc || cards.length !== 2) return;

  disc.setAttribute('r', '166');
  const centres = [510, 690];
  const width = 132;
  const y = 530;
  const height = 50;

  cards.forEach((card, index) => {
    const cx = centres[index];
    const rect = card.querySelector('.family-centre-card');
    const name = card.querySelector('.family-centre-name');
    if (!rect || !name) return;
    rect.setAttribute('x', String(cx - width / 2));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('rx', '12');
    name.setAttribute('x', String(cx));
    name.setAttribute('y', String(y + 29));
    const chars = (name.textContent || '').trim().length;
    name.setAttribute('font-size', chars > 20 ? '10.5' : chars > 16 ? '11.5' : '12.5');
  });

  const link = svg.querySelector('.family-couple-link');
  if (link) {
    link.setAttribute('x1', '576');
    link.setAttribute('x2', '624');
    link.setAttribute('y1', '555');
    link.setAttribute('y2', '555');
  }
}

function installSnapshotStyles() {
  if (document.getElementById('snapshotPolishV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'snapshotPolishV2Styles';
  style.textContent = `
    .snapshot-waist-row{justify-content:center!important;align-items:center!important}
    .snapshot-waist-row>.snapshot-siblings-wrap{display:none!important}
    .snapshot-focus-wrap{margin:0 auto!important}
    .snapshot-descendants{position:relative!important;padding-top:14px!important}
    .snapshot-descendants>.snapshot-section-label{position:relative;z-index:2;display:table;margin-left:auto!important;margin-right:auto!important;padding:0 10px;background:#fbf7ef}
    .snapshot-descendant-grid{--snapshot-rail-edge:10%;position:relative!important;display:grid!important;grid-template-columns:repeat(var(--snapshot-child-count,1),minmax(160px,1fr))!important;gap:14px!important;align-items:start!important;justify-content:stretch!important;padding-top:28px!important}
    .snapshot-descendant-grid::before{content:'';position:absolute;left:var(--snapshot-rail-edge);right:var(--snapshot-rail-edge);top:14px;border-top:1px solid #a89482;pointer-events:none}
    .snapshot-descendant-grid::after{content:'';position:absolute;left:50%;top:-46px;height:60px;border-left:1px solid #9e8876;pointer-events:none}
    .snapshot-descendant-grid>.descendant-cluster{position:relative!important;min-width:0!important;max-width:none!important;width:auto!important}
    .snapshot-descendant-grid>.descendant-cluster::before{content:'';position:absolute;left:50%;top:-14px;height:14px;border-left:1px solid #a89482;pointer-events:none}
    @media(max-width:900px){.snapshot-descendant-grid{grid-template-columns:repeat(var(--snapshot-child-count,1),minmax(150px,1fr))!important}}
  `;
  document.head.appendChild(style);
}

function polishSnapshot() {
  const snapshot = treeCanvas?.querySelector('.family-snapshot');
  if (!snapshot) return false;
  installSnapshotStyles();

  snapshot.querySelectorAll('.snapshot-waist-row > .snapshot-siblings-wrap').forEach((node) => node.remove());
  const grid = snapshot.querySelector('.snapshot-descendant-grid');
  const children = grid ? [...grid.children].filter((node) => node.classList.contains('descendant-cluster')) : [];
  if (grid && children.length) {
    grid.style.setProperty('--snapshot-child-count', String(children.length));
    grid.style.setProperty('--snapshot-rail-edge', `${50 / children.length}%`);
  }

  const status = document.getElementById('treeStatus');
  if (status && treePanel?.classList.contains('snapshot-active')) {
    status.textContent = `${children.length} child${children.length === 1 ? '' : 'ren'} shown for this focus family. Siblings are shown in the sibling branches above.`;
  }
  return true;
}

function stabilise() {
  if (!treeCanvas) return;
  if (treePanel?.classList.contains('snapshot-active')) {
    if (!polishSnapshot()) requestSnapshotRender();
    return;
  }
  const svg = treeCanvas.querySelector(':scope > svg');
  if (!svg) return;
  if (!adaptiveSvg(svg)) {
    requestAdaptiveRender();
    return;
  }
  polishCentre(svg);
}

if (treeCanvas) {
  const observer = new MutationObserver(() => stabilise());
  observer.observe(treeCanvas, { childList: true, subtree: false });
  document.addEventListener('genealogy:research-frontier-changed', () => window.setTimeout(stabilise, 0));
  window.addEventListener('load', () => window.setTimeout(stabilise, 180));
  stabilise();
}
