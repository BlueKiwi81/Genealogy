import { supabase } from './supabase-client-v1.js';

const treeCanvas = document.getElementById('treeCanvas');
const treePanel = document.querySelector('.tree-panel');
const ns = 'http://www.w3.org/2000/svg';

let deceasedIds = new Set();
let deceasedLoadPromise = null;
let polishTimer = null;

function ensureStyles() {
  if (document.getElementById('familyCentrePolishV4Styles')) return;
  const style = document.createElement('style');
  style.id = 'familyCentrePolishV4Styles';
  style.textContent = `
    .tree-panel.controls-collapsed #treeExplorerControls,
    .tree-panel.controls-collapsed > #treeStatus {
      display:none!important;
    }
    .tree-panel.controls-collapsed > .panel-head {
      margin-bottom:0!important;
    }
    .tree-panel .view-mode-bridge {
      display:none!important;
    }
    .tree-panel .explorer-display-controls {
      grid-template-columns:1fr!important;
    }
    body .tree-panel .explorer-perspective .tree-perspective-switch {
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
    }
    .family-household-connectors {
      pointer-events:none;
    }
    .family-household-line {
      fill:none;
      stroke:#9a8878;
      stroke-width:1.35;
      stroke-linecap:round;
      opacity:.78;
    }
    .family-child-node.is-deceased {
      opacity:.56;
      transition:opacity .15s ease;
    }
    .family-child-node.is-deceased:hover {
      opacity:.74;
    }
    @media(max-width:720px) {
      body .tree-panel .explorer-perspective .tree-perspective-switch {
        grid-template-columns:1fr!important;
      }
    }
    @media print {
      .tree-explorer-controls,
      #treeExplorerControls,
      .tree-panel > #treeStatus {
        display:none!important;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureCentreClip(svg) {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(ns, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  let clip = defs.querySelector('#familyCentreClip');
  if (!clip) {
    clip = document.createElementNS(ns, 'clipPath');
    clip.setAttribute('id', 'familyCentreClip');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '600');
    circle.setAttribute('cy', '600');
    circle.setAttribute('r', '164');
    clip.appendChild(circle);
    defs.appendChild(clip);
  }
  return clip;
}

function childFirstName(labelText) {
  return String(labelText || '').trim().split(/\s+/)[0] || '';
}

function setChildLabel(label, firstName, x) {
  const currentKey = `${firstName}|${x}`;
  if (label.dataset.centrePolishKey === currentKey) return;
  label.dataset.centrePolishKey = currentKey;
  label.textContent = '';
  label.setAttribute('x', String(x));
  label.setAttribute('y', '700');
  label.setAttribute('text-anchor', 'middle');

  if (firstName.includes('-') && firstName.length > 10) {
    const [left, ...rest] = firstName.split('-');
    const right = rest.join('-');
    const line1 = document.createElementNS(ns, 'tspan');
    line1.setAttribute('x', String(x));
    line1.setAttribute('y', '696');
    line1.textContent = `${left}-`;
    label.appendChild(line1);
    const line2 = document.createElementNS(ns, 'tspan');
    line2.setAttribute('x', String(x));
    line2.setAttribute('y', '706');
    line2.textContent = right;
    label.appendChild(line2);
    return;
  }

  label.textContent = firstName;
}

function addConnectorLine(group, x1, y1, x2, y2) {
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('class', 'family-household-line');
  group.appendChild(line);
}

function buildHouseholdConnectors(svg, cards, nodes) {
  svg.querySelector('.family-household-connectors')?.remove();
  if (!nodes.length) return;

  const childPoints = nodes.map((node) => {
    const circle = node.querySelector('.family-child-circle');
    if (!circle) return null;
    const x = Number(circle.getAttribute('cx'));
    const y = Number(circle.getAttribute('cy'));
    const r = Number(circle.getAttribute('r')) || 21;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, top: y - r } : null;
  }).filter(Boolean);
  if (!childPoints.length) return;

  const group = document.createElementNS(ns, 'g');
  group.setAttribute('class', 'family-household-connectors');

  let originY = 596;
  const cardBottoms = cards.map((card) => {
    const rect = card.querySelector('.family-centre-card');
    if (!rect) return null;
    const y = Number(rect.getAttribute('y'));
    const height = Number(rect.getAttribute('height'));
    return Number.isFinite(y) && Number.isFinite(height) ? y + height : null;
  }).filter((value) => value !== null);
  if (cardBottoms.length) originY = Math.max(...cardBottoms);

  const railY = Math.min(...childPoints.map((point) => point.top)) - 18;
  addConnectorLine(group, 600, originY, 600, railY);

  if (childPoints.length > 1) {
    addConnectorLine(group, childPoints[0].x, railY, childPoints[childPoints.length - 1].x, railY);
  }
  childPoints.forEach((point) => addConnectorLine(group, point.x, railY, point.x, point.top));

  const firstCard = cards[0] || null;
  const firstChild = nodes[0] || null;
  const before = firstCard || firstChild;
  if (before?.parentElement === svg) svg.insertBefore(group, before);
  else svg.appendChild(group);
}

function polishCoupleCards() {
  // Couple-card geometry now has exactly one owner: centre-card-fit-v1.js.
  // This module still polishes children, connectors, deceased-state styling and
  // the explorer controls, but it must never move or resize the centre cards.
}

function polishFamilyCentre() {
  const svg = treeCanvas?.querySelector(':scope > svg');
  if (!svg) return;
  const disc = svg.querySelector('.family-centre-disc');
  if (!disc) return;

  const cards = [...svg.querySelectorAll('.family-centre-person')];
  const nodes = [...svg.querySelectorAll('.family-child-node')];

  disc.setAttribute('r', '166');
  ensureCentreClip(svg);
  polishCoupleCards();

  if (nodes.length) {
    const spacing = nodes.length <= 5 ? 52 : 44;
    const startX = 600 - ((nodes.length - 1) * spacing) / 2;

    nodes.forEach((node, index) => {
      const x = startX + index * spacing;
      const circle = node.querySelector('.family-child-circle');
      const initial = node.querySelector('.family-child-initial');
      const label = node.querySelector('.family-child-label');
      if (!circle || !initial || !label) return;

      const firstName = childFirstName(label.textContent);
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', '664');
      circle.setAttribute('r', '21');
      initial.setAttribute('x', String(x));
      initial.setAttribute('y', '668');
      setChildLabel(label, firstName, x);
      node.setAttribute('clip-path', 'url(#familyCentreClip)');
      node.classList.toggle('is-deceased', deceasedIds.has(node.dataset.personId));
    });
  }

  buildHouseholdConnectors(svg, cards, nodes);
}

function setViewButton(button, title, copy) {
  if (!button) return;
  const key = `${title}|${copy}`;
  if (button.dataset.consolidatedViewCopy === key) return;
  button.dataset.consolidatedViewCopy = key;
  button.innerHTML = `<span class="explorer-mode-title">${title}</span><span class="explorer-mode-copy">${copy}</span>`;
}

function syncPerspectiveFromMode() {
  const switcher = document.getElementById('treePerspectiveSwitch');
  const modeSelect = document.getElementById('treeViewMode');
  if (!switcher || !modeSelect || treePanel?.classList.contains('snapshot-active')) return;
  const wanted = modeSelect.value === 'family' ? 'fan' : modeSelect.value;
  switcher.querySelectorAll('[data-tree-perspective]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.treePerspective === wanted));
  });
}

function updatePanelHeading() {
  const title = treePanel?.querySelector('.panel-head h2');
  const modeSelect = document.getElementById('treeViewMode');
  if (!title || !modeSelect) return;
  if (treePanel.classList.contains('snapshot-active')) title.textContent = 'Family snapshot';
  else if (modeSelect.value === 'ancestry') title.textContent = 'Person ancestry';
  else if (modeSelect.value === 'map') title.textContent = 'Family map';
  else title.textContent = 'Family fan';
}

function consolidateViewControls() {
  ensureStyles();
  const switcher = document.getElementById('treePerspectiveSwitch');
  const modeSelect = document.getElementById('treeViewMode');
  if (!switcher || !modeSelect) return false;

  const modeLabel = modeSelect.closest('label');
  if (modeLabel) {
    modeLabel.classList.add('view-mode-bridge');
    modeLabel.setAttribute('aria-hidden', 'true');
  }

  const perspectiveCard = switcher.closest('[data-explorer-perspective]');
  const helper = perspectiveCard?.querySelector('.explorer-helper');
  if (helper) helper.textContent = 'Choose the family fan, one-person ancestry, family snapshot or map around the same centre.';

  const displayCard = modeSelect.closest('[data-explorer-display]') || treePanel?.querySelector('[data-explorer-display]');
  const displayKicker = displayCard?.querySelector('.explorer-kicker');
  if (displayKicker) displayKicker.textContent = 'Generations';

  const fan = switcher.querySelector('[data-tree-perspective="fan"]');
  const snapshot = switcher.querySelector('[data-tree-perspective="snapshot"]');
  let ancestry = switcher.querySelector('[data-tree-perspective="ancestry"]');
  let map = switcher.querySelector('[data-tree-perspective="map"]');

  if (!ancestry) {
    ancestry = document.createElement('button');
    ancestry.type = 'button';
    ancestry.dataset.treePerspective = 'ancestry';
    ancestry.setAttribute('aria-pressed', 'false');
    switcher.insertBefore(ancestry, snapshot || null);
  }
  if (!map) {
    map = document.createElement('button');
    map.type = 'button';
    map.dataset.treePerspective = 'map';
    map.setAttribute('aria-pressed', 'false');
    switcher.appendChild(map);
  }

  setViewButton(fan, 'Family fan', 'Both sides of the couple');
  setViewButton(ancestry, 'Person ancestry', "One person's ancestors");
  setViewButton(snapshot, 'Family snapshot', 'Household and relatives');
  setViewButton(map, 'Map', 'Places and movements');

  if (switcher.dataset.consolidatedViewHandler !== '1') {
    switcher.dataset.consolidatedViewHandler = '1';
    switcher.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tree-perspective]');
      if (!button || !switcher.contains(button)) return;
      const perspective = button.dataset.treePerspective;
      if (perspective !== 'snapshot') {
        const wanted = perspective === 'fan' ? 'family' : perspective;
        if ([...modeSelect.options].some((option) => option.value === wanted)) modeSelect.value = wanted;
      }
      window.setTimeout(() => {
        syncPerspectiveFromMode();
        updatePanelHeading();
      }, 0);
    }, true);
  }

  syncPerspectiveFromMode();
  updatePanelHeading();
  return true;
}

function schedulePolish(delay = 0) {
  window.clearTimeout(polishTimer);
  polishTimer = window.setTimeout(polishFamilyCentre, delay);
}

async function loadDeceasedPeople() {
  if (deceasedLoadPromise) return deceasedLoadPromise;
  deceasedLoadPromise = (async () => {
    const { data, error } = await supabase.from('people').select('id,death_date').not('death_date', 'is', null);
    if (!error) {
      deceasedIds = new Set((data || []).filter((item) => item.death_date).map((item) => item.id));
      schedulePolish(0);
    }
  })().finally(() => { deceasedLoadPromise = null; });
  return deceasedLoadPromise;
}

ensureStyles();

if (treeCanvas) {
  const observer = new MutationObserver((mutations) => {
    const svgChanged = mutations.some((mutation) => [...mutation.addedNodes]
      .some((node) => node.nodeName?.toLowerCase() === 'svg'));
    if (svgChanged) schedulePolish(0);
  });
  observer.observe(treeCanvas, { childList: true, subtree: false });
}

[0, 80, 220, 500, 1000, 2200, 5000].forEach((delay) => {
  window.setTimeout(() => {
    consolidateViewControls();
    schedulePolish(0);
  }, delay);
});

document.addEventListener('change', (event) => {
  if (event.target?.id === 'treeViewMode') {
    window.setTimeout(() => {
      syncPerspectiveFromMode();
      updatePanelHeading();
    }, 0);
  }
});

document.addEventListener('genealogy:archive-ready', () => {
  loadDeceasedPeople();
  window.setTimeout(() => {
    consolidateViewControls();
    schedulePolish(0);
  }, 0);
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) loadDeceasedPeople();
});

const { data: { session } } = await supabase.auth.getSession();
if (session) await loadDeceasedPeople();

window.addEventListener('load', () => {
  window.setTimeout(() => {
    consolidateViewControls();
    schedulePolish(0);
  }, 250);
});