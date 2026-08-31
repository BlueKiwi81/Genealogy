const treeCanvas = document.getElementById('treeCanvas');

const SVG_NS = 'http://www.w3.org/2000/svg';
const CENTRE_X = 600;
const CENTRE_Y = 600;
const OUTER_RADIUS = 575;
const RING_GAP = 2;
const GENERATION_YEARS = 29;
const PREFERRED_QUARTER = [270, 360]; // 9 to 12 o'clock in the fan's angle system.
const PREFERRED_TARGETS = [302, 332, 286, 346, 316, 276];

let renderTimer = null;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function polar(radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return [CENTRE_X + radius * Math.cos(radians), CENTRE_Y + radius * Math.sin(radians)];
}

function firstBirthYear(group) {
  const dateText = [...group.querySelectorAll('.enhanced-fan-date,.fan-date')]
    .map((node) => node.textContent?.trim() || '')
    .find(Boolean) || '';
  if (!dateText || /^d\./i.test(dateText)) return null;
  const match = dateText.match(/\b(1[4-9]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function groupsByLevel(svg) {
  const levels = new Map();
  svg.querySelectorAll(':scope > g[data-fan-level][data-fan-slot]').forEach((group) => {
    const level = Number(group.dataset.fanLevel);
    const slot = Number(group.dataset.fanSlot);
    if (!Number.isFinite(level) || !Number.isFinite(slot)) return;
    const rows = levels.get(level) || [];
    rows.push({ group, slot });
    levels.set(level, rows);
  });
  levels.forEach((rows) => rows.sort((a, b) => a.slot - b.slot));
  return levels;
}

function isOpenCell(group) {
  return !group.classList.contains('person-node')
    && !group.classList.contains('research-frontier-node')
    && !group.hasAttribute('data-person-id');
}

function openRuns(rows) {
  const count = rows.length;
  if (!count) return [];
  const open = Array.from({ length: count }, () => false);
  rows.forEach(({ group, slot }) => {
    if (slot >= 0 && slot < count) open[slot] = isOpenCell(group);
  });
  if (!open.some(Boolean)) return [];
  if (open.every(Boolean)) return [{ startSlot: 0, length: count }];

  const anchor = open.findIndex((value) => !value);
  const runs = [];
  let current = null;
  for (let offset = 1; offset <= count; offset += 1) {
    const logicalSlot = anchor + offset;
    const slot = logicalSlot % count;
    if (open[slot]) {
      if (!current) current = { startSlot: logicalSlot, length: 0 };
      current.length += 1;
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  return runs;
}

function overlapAmount(start, end, rangeStart, rangeEnd) {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
}

function preferredOverlap(start, end) {
  return Math.max(
    overlapAmount(start, end, PREFERRED_QUARTER[0], PREFERRED_QUARTER[1]),
    overlapAmount(start, end, PREFERRED_QUARTER[0] + 360, PREFERRED_QUARTER[1] + 360),
  );
}

function distanceToRange(value, start, end) {
  if (value < start) return start - value;
  if (value > end) return value - end;
  return 0;
}

function targetForRun(runStart, runEnd, level) {
  const base = PREFERRED_TARGETS[level % PREFERRED_TARGETS.length];
  const candidates = [base, base + 360];
  return candidates.reduce((best, candidate) => {
    const distance = distanceToRange(candidate, runStart, runEnd);
    return !best || distance < best.distance ? { angle: candidate, distance } : best;
  }, null);
}

function chooseRun(runs, count, level) {
  const step = 360 / count;
  const candidates = runs.map((run) => {
    const start = run.startSlot * step;
    const end = (run.startSlot + run.length) * step;
    const span = end - start;
    const overlap = preferredOverlap(start, end);
    const target = targetForRun(start, end, level);
    return { ...run, start, end, span, overlap, target };
  }).filter((run) => run.span >= 18);

  if (!candidates.length) return null;
  const preferred = candidates.filter((run) => run.overlap >= 10);
  const pool = preferred.length ? preferred : candidates;
  pool.sort((a, b) => {
    const aScore = a.overlap * 5 + a.span - a.target.distance * .35;
    const bScore = b.overlap * 5 + b.span - b.target.distance * .35;
    return bScore - aScore;
  });
  return pool[0];
}

function knownYearsForLevel(rows) {
  return rows.map(({ group }) => firstBirthYear(group)).filter(Number.isFinite);
}

function estimatedYear(level, yearMedians, maxLevel) {
  const own = yearMedians.get(level);
  if (Number.isFinite(own)) return own;

  for (let inner = level - 1; inner >= 0; inner -= 1) {
    const known = yearMedians.get(inner);
    if (Number.isFinite(known)) return known - GENERATION_YEARS * (level - inner);
  }
  for (let outer = level + 1; outer <= maxLevel; outer += 1) {
    const known = yearMedians.get(outer);
    if (Number.isFinite(known)) return known + GENERATION_YEARS * (outer - level);
  }
  return null;
}

function eraText(year, level, maxLevel, knownCount) {
  if (!Number.isFinite(year)) return '';
  if (level === maxLevel && knownCount < 2) {
    return `${Math.floor(year / 100) * 100}s`;
  }
  const centre = Math.round(year / 25) * 25;
  return `c. ${centre - 25}-${centre + 25}`;
}

function restoreHiddenQuestions(svg) {
  svg.querySelectorAll('[data-era-hidden-question="true"]').forEach((text) => {
    const previous = text.getAttribute('data-era-previous-opacity');
    if (previous === null || previous === '') text.removeAttribute('opacity');
    else text.setAttribute('opacity', previous);
    text.removeAttribute('data-era-hidden-question');
    text.removeAttribute('data-era-previous-opacity');
  });
}

function hideQuestionsUnderLabel(rows, startAngle, endAngle) {
  const count = rows.length;
  const step = 360 / count;
  rows.forEach(({ group, slot }) => {
    let centre = (slot + .5) * step;
    if (endAngle > 360 && centre < startAngle) centre += 360;
    if (centre < startAngle || centre > endAngle) return;
    group.querySelectorAll('text').forEach((text) => {
      if (text.textContent?.trim() !== '?') return;
      text.setAttribute('data-era-hidden-question', 'true');
      text.setAttribute('data-era-previous-opacity', text.getAttribute('opacity') || '');
      text.setAttribute('opacity', '0');
    });
  });
}

function addEraLabel(overlay, value, radius, startAngle, endAngle, level, maxLevel) {
  const span = endAngle - startAngle;
  const arcLength = radius * (span * Math.PI / 180);
  const desired = Math.min(44, 20 + level * 4.6);
  const fit = arcLength / Math.max(1, value.length * .62);
  const fontSize = Math.min(desired, fit);
  if (fontSize < 13) return false;

  const mid = (startAngle + endAngle) / 2;
  const reverse = (mid % 360) > 90 && (mid % 360) < 270;
  const from = reverse ? endAngle : startAngle;
  const to = reverse ? startAngle : endAngle;
  const [x1, y1] = polar(radius, from);
  const [x2, y2] = polar(radius, to);
  const pathId = `fan-era-path-${level}-${Math.round(startAngle * 10)}-${Math.round(endAngle * 10)}`;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('id', pathId);
  path.setAttribute('d', `M ${x1} ${y1} A ${radius} ${radius} 0 0 ${reverse ? 0 : 1} ${x2} ${y2}`);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'none');
  overlay.appendChild(path);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('class', 'fan-era-label');
  text.setAttribute('font-family', "'Arial Black',Arial,sans-serif");
  text.setAttribute('font-weight', '900');
  text.setAttribute('font-size', String(fontSize));
  text.setAttribute('fill', '#6f655a');
  text.setAttribute('fill-opacity', level === maxLevel ? '.105' : '.085');
  text.setAttribute('letter-spacing', String(Math.max(.2, fontSize * .015)));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('pointer-events', 'none');

  const textPath = document.createElementNS(SVG_NS, 'textPath');
  textPath.setAttribute('href', `#${pathId}`);
  textPath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${pathId}`);
  textPath.setAttribute('startOffset', '50%');
  textPath.textContent = value;
  text.appendChild(textPath);
  overlay.appendChild(text);
  return true;
}

function applyEraScaffold() {
  if (!treeCanvas) return;
  const svg = treeCanvas.querySelector(':scope > svg');
  if (!svg || treeCanvas.closest('.tree-panel')?.classList.contains('map-view-active')) return;

  restoreHiddenQuestions(svg);
  svg.querySelector(':scope > .fan-era-scaffold')?.remove();

  const levels = groupsByLevel(svg);
  if (!levels.size) return;
  const maxLevel = Math.max(...levels.keys());
  const depth = maxLevel + 1;
  const familyMode = Boolean(svg.querySelector('.family-centre-disc'));
  const innerRadius = familyMode ? 180 : 125;
  const thickness = (OUTER_RADIUS - innerRadius - RING_GAP * (depth - 1)) / depth;
  const yearMedians = new Map();
  const yearsByLevel = new Map();

  levels.forEach((rows, level) => {
    const years = knownYearsForLevel(rows);
    yearsByLevel.set(level, years);
    if (years.length) yearMedians.set(level, median(years));
  });

  const overlay = document.createElementNS(SVG_NS, 'g');
  overlay.setAttribute('class', 'fan-era-scaffold');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('pointer-events', 'none');

  const minimumLevel = maxLevel >= 3 ? 2 : 1;
  for (let level = minimumLevel; level <= maxLevel; level += 1) {
    const rows = levels.get(level) || [];
    if (!rows.length) continue;
    const run = chooseRun(openRuns(rows), rows.length, level);
    if (!run) continue;

    const year = estimatedYear(level, yearMedians, maxLevel);
    const label = eraText(year, level, maxLevel, (yearsByLevel.get(level) || []).length);
    if (!label) continue;

    const target = run.target.angle;
    const preferredStart = run.overlap > 0 ? Math.max(run.start, target - 42) : run.start;
    const preferredEnd = run.overlap > 0 ? Math.min(run.end, target + 42) : run.end;
    const availableStart = run.overlap > 0 && preferredEnd - preferredStart >= 18 ? preferredStart : run.start;
    const availableEnd = run.overlap > 0 && preferredEnd - preferredStart >= 18 ? preferredEnd : run.end;
    const availableSpan = availableEnd - availableStart;
    const pathSpan = Math.min(84, Math.max(20, availableSpan - 4));
    if (pathSpan > availableSpan) continue;

    let centre = run.overlap > 0 ? target : (availableStart + availableEnd) / 2;
    centre = Math.max(availableStart + pathSpan / 2, Math.min(availableEnd - pathSpan / 2, centre));
    const startAngle = centre - pathSpan / 2;
    const endAngle = centre + pathSpan / 2;
    const radius = innerRadius + level * (thickness + RING_GAP) + thickness / 2;

    if (addEraLabel(overlay, label, radius, startAngle, endAngle, level, maxLevel)) {
      hideQuestionsUnderLabel(rows, startAngle, endAngle);
    }
  }

  if (overlay.childNodes.length) svg.appendChild(overlay);
}

function scheduleEraScaffold(delay = 80) {
  if (renderTimer !== null) window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderTimer = null;
    window.requestAnimationFrame(applyEraScaffold);
  }, delay);
}

if (treeCanvas) {
  new MutationObserver(() => scheduleEraScaffold(70))
    .observe(treeCanvas, { childList: true, subtree: false });
}

document.addEventListener('change', (event) => {
  if (['treeViewMode', 'generationDepth', 'centreSelect'].includes(event.target?.id)) scheduleEraScaffold(100);
});
document.addEventListener('genealogy:archive-ready', () => scheduleEraScaffold(100));
document.addEventListener('genealogy:research-frontier-changed', () => scheduleEraScaffold(100));
document.addEventListener('genealogy:tree-suggestions-updated', () => scheduleEraScaffold(120));

scheduleEraScaffold(120);
