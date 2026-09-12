const canvas = document.getElementById('treeCanvas');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let firstRevealDone = false;
let revealTimer = null;

function currentFanSvg() {
  const svg = canvas?.querySelector(':scope > svg');
  return svg?.querySelector('[data-fan-level]') ? svg : null;
}

function revealFan() {
  if (!canvas) return;
  const svg = currentFanSvg();
  if (!svg || svg.dataset.fanStableReveal === '1') return;
  svg.dataset.fanStableReveal = '1';

  // Subsequent re-centres and depth changes render immediately. Only the first
  // completed fan receives a short whole-SVG fade, avoiding per-cell border flash.
  if (firstRevealDone || reducedMotion.matches) {
    svg.style.removeProperty('opacity');
    svg.style.removeProperty('transition');
    return;
  }

  firstRevealDone = true;
  svg.style.opacity = '0';
  svg.style.transition = 'opacity 160ms ease-out';
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    if (!svg.isConnected) return;
    svg.style.opacity = '1';
    window.setTimeout(() => {
      if (!svg.isConnected) return;
      svg.style.removeProperty('transition');
      svg.style.removeProperty('opacity');
    }, 220);
  }));
}

function scheduleReveal(delay = 80) {
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(revealFan, delay);
}

if (canvas) {
  new MutationObserver(() => scheduleReveal(90)).observe(canvas, { childList: true, subtree: false });
  document.addEventListener('genealogy:archive-ready', () => scheduleReveal(100));
  window.addEventListener('pageshow', () => scheduleReveal(100), { once: true });
  scheduleReveal(100);
}
