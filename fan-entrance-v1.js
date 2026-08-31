const canvas = document.getElementById('treeCanvas');
const desktopViewport = window.matchMedia('(min-width: 900px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let entrancePlayed = false;
let settleTimer = null;
let cleanupTimer = null;

function currentFanSvg() {
  const svg = canvas?.querySelector(':scope > svg');
  return svg?.querySelector('[data-fan-level]') ? svg : null;
}

function maxRenderedLevel(svg) {
  return [...svg.querySelectorAll('[data-fan-level]')]
    .reduce((max, node) => Math.max(max, Number(node.dataset.fanLevel) || 0), 0);
}

function playEntrance(svg) {
  if (!svg || entrancePlayed || !desktopViewport.matches || reducedMotion.matches) return;
  entrancePlayed = true;
  svg.classList.add('fan-entrance');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => svg.classList.add('fan-entrance-run'));
  });

  const maxLevel = maxRenderedLevel(svg);
  const finishAfter = 900 + (maxLevel * 140);
  cleanupTimer = window.setTimeout(() => {
    svg.classList.remove('fan-entrance', 'fan-entrance-run');
    cleanupTimer = null;
  }, finishAfter);
}

function scheduleEntrance() {
  if (entrancePlayed || !desktopViewport.matches || reducedMotion.matches || !canvas) return;
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    settleTimer = null;
    const svg = currentFanSvg();
    if (svg) playEntrance(svg);
  }, 110);
}

if (canvas) {
  new MutationObserver(scheduleEntrance).observe(canvas, { childList: true, subtree: true });
  document.addEventListener('genealogy:archive-ready', scheduleEntrance);
  window.addEventListener('pageshow', scheduleEntrance, { once: true });
  scheduleEntrance();
}

window.addEventListener('pagehide', () => {
  window.clearTimeout(settleTimer);
  window.clearTimeout(cleanupTimer);
});
