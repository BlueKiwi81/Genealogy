const BASE = { x: 0, y: 0, width: 1200, height: 1200 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const STEP = 1.25;

let currentSvg = null;
let zoom = 1;
let centreX = 600;
let centreY = 600;
let drag = null;
let suppressClickUntil = 0;
let frame = null;

function af() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}

function t(en, afr) {
  return af() ? afr : en;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dimensions() {
  return {
    width: BASE.width / zoom,
    height: BASE.height / zoom,
  };
}

function clampCentre() {
  const { width, height } = dimensions();
  centreX = clamp(centreX, BASE.x + width / 2, BASE.x + BASE.width - width / 2);
  centreY = clamp(centreY, BASE.y + height / 2, BASE.y + BASE.height - height / 2);
}

function applyView() {
  if (!currentSvg?.isConnected) return;
  clampCentre();
  const { width, height } = dimensions();
  currentSvg.setAttribute('viewBox', `${centreX - width / 2} ${centreY - height / 2} ${width} ${height}`);
  currentSvg.classList.toggle('fan-is-zoomed', zoom > 1.001);
  const readout = document.getElementById('fanZoomReset');
  if (readout) readout.textContent = `${Math.round(zoom * 100)}%`;
  const minus = document.getElementById('fanZoomOut');
  const plus = document.getElementById('fanZoomIn');
  if (minus) minus.disabled = zoom <= MIN_ZOOM + 0.001;
  if (plus) plus.disabled = zoom >= MAX_ZOOM - 0.001;
}

function setZoom(next) {
  zoom = clamp(next, MIN_ZOOM, MAX_ZOOM);
  if (zoom <= MIN_ZOOM + 0.001) {
    zoom = MIN_ZOOM;
    centreX = 600;
    centreY = 600;
  }
  applyView();
}

function resetZoom() {
  zoom = 1;
  centreX = 600;
  centreY = 600;
  applyView();
}

function pointerDown(event) {
  if (zoom <= 1.001 || event.button !== 0) return;
  const rect = currentSvg.getBoundingClientRect();
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    centreX,
    centreY,
    pixelWidth: rect.width || 1,
    pixelHeight: rect.height || 1,
    moved: false,
  };
  currentSvg.setPointerCapture?.(event.pointerId);
  currentSvg.classList.add('fan-is-dragging');
}

function pointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
  if (!drag.moved) return;
  event.preventDefault();
  const { width, height } = dimensions();
  centreX = drag.centreX - (dx / drag.pixelWidth) * width;
  centreY = drag.centreY - (dy / drag.pixelHeight) * height;
  applyView();
}

function pointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (drag.moved) suppressClickUntil = performance.now() + 180;
  currentSvg.releasePointerCapture?.(event.pointerId);
  currentSvg.classList.remove('fan-is-dragging');
  drag = null;
}

function suppressDraggedClick(event) {
  if (performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function ensureStyles() {
  if (document.getElementById('fanZoomPanStyles')) return;
  const style = document.createElement('style');
  style.id = 'fanZoomPanStyles';
  style.textContent = `
    #treeCanvas{position:relative}
    #treeCanvas > svg.fan-is-zoomed{cursor:grab;touch-action:none;user-select:none}
    #treeCanvas > svg.fan-is-dragging{cursor:grabbing}
    .fan-zoom-controls{position:absolute;right:12px;bottom:12px;z-index:30;display:flex;align-items:center;gap:5px;padding:5px;border:1px solid rgba(92,80,67,.28);border-radius:12px;background:rgba(255,253,248,.94);box-shadow:0 5px 18px rgba(48,38,29,.13);backdrop-filter:blur(5px)}
    .fan-zoom-controls button{display:grid;place-items:center;min-width:36px;height:36px;padding:0 9px;border:1px solid #cfc4b7;border-radius:8px;background:#fffdf8;color:#3e3329;font:700 1.18rem/1 Arial,sans-serif;cursor:pointer}
    .fan-zoom-controls button:disabled{opacity:.38;cursor:default}
    .fan-zoom-controls .fan-zoom-readout{min-width:58px;font-size:.72rem;font-weight:700}
    @media(max-width:620px){.fan-zoom-controls{right:8px;bottom:8px}.fan-zoom-controls button{min-width:34px;height:34px}}
    @media print{.fan-zoom-controls{display:none!important}}
  `;
  document.head.appendChild(style);
}

function localizeControls() {
  const out = document.getElementById('fanZoomOut');
  const reset = document.getElementById('fanZoomReset');
  const input = document.getElementById('fanZoomIn');
  if (out) {
    out.title = t('Zoom out', 'Zoem uit');
    out.setAttribute('aria-label', out.title);
  }
  if (reset) {
    reset.title = t('Reset fan zoom and position', 'Herstel die waaier se zoem en posisie');
    reset.setAttribute('aria-label', reset.title);
  }
  if (input) {
    input.title = t('Zoom in', 'Zoem in');
    input.setAttribute('aria-label', input.title);
  }
}

function ensureControls(canvas) {
  let controls = document.getElementById('fanZoomControls');
  if (!controls) {
    controls = document.createElement('div');
    controls.id = 'fanZoomControls';
    controls.className = 'fan-zoom-controls';
    controls.setAttribute('role', 'group');
    controls.innerHTML = `
      <button id="fanZoomOut" type="button" aria-label="Zoom out">−</button>
      <button id="fanZoomReset" class="fan-zoom-readout" type="button" aria-label="Reset fan zoom and position">100%</button>
      <button id="fanZoomIn" type="button" aria-label="Zoom in">+</button>`;
    controls.querySelector('#fanZoomOut').addEventListener('click', () => setZoom(zoom / STEP));
    controls.querySelector('#fanZoomReset').addEventListener('click', resetZoom);
    controls.querySelector('#fanZoomIn').addEventListener('click', () => setZoom(zoom * STEP));
  }
  if (controls.parentElement !== canvas) canvas.appendChild(controls);
  localizeControls();
}

function bindSvg(svg) {
  if (svg === currentSvg) return;
  if (currentSvg) {
    currentSvg.removeEventListener('pointerdown', pointerDown);
    currentSvg.removeEventListener('pointermove', pointerMove);
    currentSvg.removeEventListener('pointerup', pointerUp);
    currentSvg.removeEventListener('pointercancel', pointerUp);
    currentSvg.removeEventListener('click', suppressDraggedClick, true);
  }
  currentSvg = svg;
  resetZoom();
  svg.addEventListener('pointerdown', pointerDown);
  svg.addEventListener('pointermove', pointerMove, { passive: false });
  svg.addEventListener('pointerup', pointerUp);
  svg.addEventListener('pointercancel', pointerUp);
  svg.addEventListener('click', suppressDraggedClick, true);
}

function install() {
  frame = null;
  ensureStyles();
  const canvas = document.getElementById('treeCanvas');
  const treePanel = canvas?.closest('.tree-panel');
  const svg = canvas?.querySelector(':scope > svg');
  const controls = document.getElementById('fanZoomControls');
  if (!canvas || !svg || treePanel?.classList.contains('map-view-active')) {
    if (controls) controls.hidden = true;
    return;
  }
  bindSvg(svg);
  ensureControls(canvas);
  document.getElementById('fanZoomControls').hidden = false;
  applyView();
}

function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(install);
}

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
document.addEventListener('genealogy:archive-ready', schedule);
document.addEventListener('genealogy:language-changed', () => { localizeControls(); schedule(); });
window.addEventListener('load', schedule);
schedule();
