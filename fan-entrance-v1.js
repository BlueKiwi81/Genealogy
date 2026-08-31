const canvas = document.getElementById('treeCanvas');
const desktopViewport = window.matchMedia('(min-width: 900px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const INDIVIDUAL_CELL_LIMIT = 850;
const ALWAYS_INDIVIDUAL_THROUGH_LEVEL = 5;
const STYLE_ID = 'genealogyFanGrowthStyle';

let entrancePlayed = false;
let cleanupTimer = null;
let activeAnimations = [];
let deferredTimers = [];

function currentFanSvg() {
  const svg = canvas?.querySelector(':scope > svg');
  return svg?.querySelector('[data-fan-level]') ? svg : null;
}

function ensurePreparationStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #treeCanvas > svg.fan-growth-prepared [data-fan-level],
    #treeCanvas > svg.fan-growth-prepared .family-centre-disc,
    #treeCanvas > svg.fan-growth-prepared .family-centre-person,
    #treeCanvas > svg.fan-growth-prepared .family-couple-link,
    #treeCanvas > svg.fan-growth-prepared .family-child-node,
    #treeCanvas > svg.fan-growth-prepared > g.person-node:not([data-fan-level]) {
      opacity: 0;
    }
    #treeCanvas > svg.fan-growth-prepared [data-fan-level] {
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

function centreNodes(svg) {
  return [
    ...svg.querySelectorAll(':scope > .family-centre-disc'),
    ...svg.querySelectorAll(':scope > .family-centre-person'),
    ...svg.querySelectorAll(':scope > .family-couple-link'),
    ...svg.querySelectorAll(':scope > .family-child-node'),
    ...svg.querySelectorAll(':scope > g.person-node:not([data-fan-level])'),
  ];
}

function isMeaningfulCell(node) {
  return node.classList.contains('person-node') || node.classList.contains('research-frontier-node');
}

function cellKey(level, slot) {
  return `${level}:${slot}`;
}

function rootSlot(level, slot) {
  return Math.floor(slot / (2 ** level));
}

function buildGrowthSchedule(svg) {
  const cells = [...svg.querySelectorAll('[data-fan-level]')]
    .map((node) => ({
      node,
      level: Number(node.dataset.fanLevel) || 0,
      slot: Number(node.dataset.fanSlot) || 0,
    }))
    .sort((a, b) => a.level - b.level || a.slot - b.slot);

  const roots = cells.filter((item) => item.level === 0);
  const branchPace = new Map(roots.map((item) => [item.slot, 0.78 + Math.random() * 0.58]));
  const schedule = new Map();

  cells.forEach((item) => {
    const root = rootSlot(item.level, item.slot);
    const pace = branchPace.get(root) || 1;
    const duration = Math.round((235 + Math.random() * 135) * pace);
    let start;

    if (item.level === 0) {
      start = 430 + Math.round((35 + Math.random() * 250) * pace);
    } else {
      const parent = schedule.get(cellKey(item.level - 1, Math.floor(item.slot / 2)));
      const parentEnd = parent ? parent.start + parent.duration : 430;
      const gap = Math.round((20 + Math.random() * 145) * pace);
      start = parentEnd + gap;
    }

    schedule.set(cellKey(item.level, item.slot), {
      ...item,
      root,
      pace,
      start,
      duration,
      meaningful: isMeaningfulCell(item.node),
    });
  });

  return { cells, schedule };
}

function keysToAnimateIndividually(cells, schedule) {
  if (cells.length <= INDIVIDUAL_CELL_LIMIT) {
    return new Set(cells.map((item) => cellKey(item.level, item.slot)));
  }

  const keys = new Set();
  schedule.forEach((item, key) => {
    if (item.level <= ALWAYS_INDIVIDUAL_THROUGH_LEVEL || item.meaningful) keys.add(key);
  });

  // A meaningful outer cell must never grow out of an invisible parent. Include
  // its whole inward path even on unusually deep, mostly-empty fans.
  [...keys].forEach((key) => {
    let item = schedule.get(key);
    while (item && item.level > 0) {
      const parentKey = cellKey(item.level - 1, Math.floor(item.slot / 2));
      keys.add(parentKey);
      item = schedule.get(parentKey);
    }
  });

  return keys;
}

function animateNode(node, keyframes, options) {
  node.style.transformBox = 'view-box';
  node.style.transformOrigin = '600px 600px';
  const animation = node.animate(keyframes, { ...options, fill: 'both' });
  activeAnimations.push(animation);
  return animation;
}

function animateCentre(svg) {
  centreNodes(svg).forEach((node, index) => {
    const isChild = node.classList.contains('family-child-node');
    const delay = isChild ? 135 + index * 22 : 45 + index * 18;
    animateNode(node, [
      { opacity: 0, transform: 'scale(.90)' },
      { opacity: 1, transform: 'scale(1)' },
    ], {
      duration: 340,
      delay,
      easing: 'cubic-bezier(.2,.82,.28,1)',
    });
  });
}

function animateCellsIndividually(schedule, individualKeys) {
  let maxEnd = 0;
  schedule.forEach((item, key) => {
    if (!individualKeys.has(key)) return;
    maxEnd = Math.max(maxEnd, item.start + item.duration);
    animateNode(item.node, [
      { opacity: 0, transform: 'scale(.82)' },
      { opacity: 0.88, offset: 0.7 },
      { opacity: 1, transform: 'scale(1)' },
    ], {
      duration: item.duration,
      delay: item.start,
      easing: 'cubic-bezier(.18,.78,.28,1)',
    });
  });
  return maxEnd;
}

function revealDeferredEmptyLevels(schedule, individualKeys, after) {
  const byLevel = new Map();
  schedule.forEach((item, key) => {
    if (individualKeys.has(key)) return;
    const list = byLevel.get(item.level) || [];
    list.push(item.node);
    byLevel.set(item.level, list);
  });

  let finish = after;
  [...byLevel.keys()].sort((a, b) => a - b).forEach((level, index) => {
    const start = after + 90 + index * 270;
    finish = start + 230;
    const timer = window.setTimeout(() => {
      (byLevel.get(level) || []).forEach((node) => {
        node.style.transition = 'opacity 220ms ease-out';
        node.style.opacity = '1';
      });
    }, start);
    deferredTimers.push(timer);
  });

  return finish;
}

function cleanupGrowth(svg) {
  svg?.classList.remove('fan-growth-prepared');
  activeAnimations.forEach((animation) => animation.cancel());
  activeAnimations = [];
  deferredTimers.forEach((timer) => window.clearTimeout(timer));
  deferredTimers = [];
  svg?.querySelectorAll('[data-fan-level], .family-centre-disc, .family-centre-person, .family-couple-link, .family-child-node, :scope > g.person-node:not([data-fan-level])')
    .forEach((node) => {
      node.style.removeProperty('opacity');
      node.style.removeProperty('transition');
      node.style.removeProperty('transform-box');
      node.style.removeProperty('transform-origin');
    });
}

function playEntrance(svg) {
  if (!svg || entrancePlayed || !desktopViewport.matches || reducedMotion.matches) return;
  entrancePlayed = true;
  ensurePreparationStyle();
  svg.classList.add('fan-growth-prepared');

  const { cells, schedule } = buildGrowthSchedule(svg);
  const individualKeys = keysToAnimateIndividually(cells, schedule);

  requestAnimationFrame(() => {
    animateCentre(svg);
    const individualFinish = animateCellsIndividually(schedule, individualKeys);
    const allFinish = revealDeferredEmptyLevels(schedule, individualKeys, individualFinish);
    cleanupTimer = window.setTimeout(() => {
      cleanupGrowth(svg);
      cleanupTimer = null;
    }, allFinish + 420);
  });
}

function tryEntrance() {
  if (entrancePlayed || !desktopViewport.matches || reducedMotion.matches || !canvas) return;
  const svg = currentFanSvg();
  if (svg) playEntrance(svg);
}

if (canvas) {
  new MutationObserver(tryEntrance).observe(canvas, { childList: true, subtree: false });
  document.addEventListener('genealogy:archive-ready', tryEntrance);
  window.addEventListener('pageshow', tryEntrance, { once: true });
  tryEntrance();
}

window.addEventListener('pagehide', () => {
  window.clearTimeout(cleanupTimer);
  deferredTimers.forEach((timer) => window.clearTimeout(timer));
  activeAnimations.forEach((animation) => animation.cancel());
});
