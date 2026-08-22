import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const APPROVED_KNOWN_AS = new Set(['documented', 'strong', 'family_supplied']);
const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const personName = document.getElementById('personName');
const state = { people: [], relationships: [], byId: new Map(), loaded: false };
let decorateTimer = null;

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ');
}

function firstLegalName(person) {
  return (person?.given_names || '').trim().split(/\s+/)[0] || canonicalName(person);
}

function shortName(person) {
  const preferred = person?.preferred_name?.trim();
  if (preferred && APPROVED_KNOWN_AS.has(person?.preferred_name_status || 'unresolved')) return preferred;
  return firstLegalName(person);
}

function getPerson(id) {
  return state.byId.get(id) || null;
}

function parentIdsOf(personId) {
  return state.relationships
    .filter((r) => r.relationship_type === 'parent' && r.person2_id === personId)
    .map((r) => r.person1_id);
}

function siblingsOf(personId) {
  const ids = new Set();
  const parentIds = new Set(parentIdsOf(personId));
  state.relationships.forEach((r) => {
    if (r.relationship_type === 'sibling' && (r.person1_id === personId || r.person2_id === personId)) {
      ids.add(r.person1_id === personId ? r.person2_id : r.person1_id);
    }
    if (r.relationship_type === 'parent' && parentIds.has(r.person1_id) && r.person2_id !== personId) ids.add(r.person2_id);
  });
  return [...ids].map(getPerson).filter(Boolean).sort((a, b) => canonicalName(a).localeCompare(canonicalName(b)));
}

function uniquePersonByName(name) {
  const matches = state.people.filter((person) => canonicalName(person) === name);
  return matches.length === 1 ? matches[0] : null;
}

function selectedPerson() {
  const label = personName?.textContent?.trim();
  if (!label || label === 'Choose a person') return null;
  return uniquePersonByName(label);
}

function recenter(personId) {
  if (!centreSelect || !personId) return;
  const option = [...centreSelect.options].find((item) => item.value === personId);
  if (!option) return;
  centreSelect.value = personId;
  centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function removeSiblingDrawer() {
  document.getElementById('collateralSiblingDrawer')?.remove();
}

function showSiblingDrawer(person) {
  removeSiblingDrawer();
  if (!treeCanvas || !person) return;
  const siblings = siblingsOf(person.id);
  if (!siblings.length) return;

  const drawer = document.createElement('div');
  drawer.id = 'collateralSiblingDrawer';
  drawer.className = 'collateral-drawer';

  const heading = document.createElement('div');
  heading.className = 'collateral-drawer-heading';
  heading.innerHTML = `<span class="collateral-drawer-kicker">Sibling branch</span><strong>Siblings of ${canonicalName(person)}</strong>`;
  drawer.appendChild(heading);

  const people = document.createElement('div');
  people.className = 'collateral-drawer-people';
  siblings.forEach((sibling) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'collateral-person';
    button.innerHTML = `<span>${shortName(sibling)}</span><small>${canonicalName(sibling)}</small>`;
    button.title = `Centre the fan on ${canonicalName(sibling)}`;
    button.addEventListener('click', () => recenter(sibling.id));
    people.appendChild(button);
  });
  drawer.appendChild(people);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'collateral-close';
  close.setAttribute('aria-label', 'Close sibling branch');
  close.textContent = 'x';
  close.addEventListener('click', () => {
    removeSiblingDrawer();
    removeVisualBranch();
  });
  drawer.appendChild(close);

  treeCanvas.parentElement?.insertBefore(drawer, treeCanvas);
}

function parseTranslate(value) {
  const match = String(value || '').match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function anchorForPerson(svg, person) {
  const canonical = canonicalName(person);
  const ancestryGroup = [...svg.querySelectorAll('.person-node[aria-label]')]
    .find((group) => group.getAttribute('aria-label') === canonical);
  if (ancestryGroup) {
    const textGroup = [...ancestryGroup.querySelectorAll('g[transform]')]
      .find((node) => node.querySelector('text'));
    const point = parseTranslate(textGroup?.getAttribute('transform'));
    if (point) {
      const path = ancestryGroup.querySelector('path');
      return { ...point, group: ancestryGroup, fill: path?.getAttribute('fill') || '#e7bea0', centre: false };
    }
  }

  const first = firstLegalName(person);
  const familyCard = [...svg.querySelectorAll('.family-centre-person')]
    .find((group) => group.querySelector('.family-centre-name')?.textContent?.trim().startsWith(first));
  if (familyCard) {
    const rect = familyCard.querySelector('.family-centre-card');
    if (rect) {
      const x = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2;
      const y = Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2;
      return { x, y, group: familyCard, fill: rect.getAttribute('fill') || '#fffaf2', centre: true };
    }
  }

  const singleName = [...svg.querySelectorAll('.centre-name')]
    .find((node) => node.textContent?.trim() === canonical);
  if (singleName) return { x: 600, y: 600, group: singleName.parentElement, fill: '#fffaf2', centre: true };

  const childNode = [...svg.querySelectorAll('.family-child-node')]
    .find((group) => {
      const label = group.querySelector('.family-child-label')?.textContent?.trim() || '';
      return label === first || label.startsWith(first);
    });
  if (childNode) {
    const circle = childNode.querySelector('.family-child-circle');
    if (circle) {
      return {
        x: Number(circle.getAttribute('cx')),
        y: Number(circle.getAttribute('cy')),
        group: childNode,
        fill: circle.getAttribute('fill') || '#efe4d5',
        centre: true,
      };
    }
  }
  return null;
}

function removeVisualBranch() {
  const svg = treeCanvas?.querySelector('svg');
  svg?.querySelector('.collateral-visual-branch')?.remove();
  svg?.querySelectorAll('.collateral-source-active').forEach((node) => node.classList.remove('collateral-source-active'));
}

function branchSide(anchor, count) {
  const dx = anchor.x - 600;
  const dy = anchor.y - 600;
  const length = Math.hypot(dx, dy) || 1;
  const rx = dx / length;
  const ry = dy / length;
  const tx = -ry;
  const ty = rx;
  const span = 50 + Math.max(0, count - 1) * 46;
  const candidates = [1, -1].map((sign) => {
    const x = anchor.x + tx * sign * span;
    const y = anchor.y + ty * sign * span;
    const margin = Math.min(x, 1200 - x, y, 1200 - y);
    return { sign, margin };
  });
  candidates.sort((a, b) => b.margin - a.margin);
  return { sign: candidates[0].sign, rx, ry, tx, ty };
}

function addSvgText(ns, parent, x, y, text, className) {
  const node = document.createElementNS(ns, 'text');
  node.setAttribute('x', String(x));
  node.setAttribute('y', String(y));
  node.setAttribute('class', className);
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function renderVisualBranch(person) {
  removeVisualBranch();
  if (!treeCanvas || !person) return;
  const siblings = siblingsOf(person.id);
  if (!siblings.length) return;
  const svg = treeCanvas.querySelector('svg');
  if (!svg) return;
  const anchor = anchorForPerson(svg, person);
  if (!anchor) return;

  // The centre circle is deliberately kept clean. The collateral branch is
  // drawn for people occupying a fan wedge; centre-person siblings remain in
  // the sibling drawer above the fan.
  if (anchor.centre) return;

  anchor.group?.classList.add('collateral-source-active');
  const ns = 'http://www.w3.org/2000/svg';
  const branch = document.createElementNS(ns, 'g');
  branch.setAttribute('class', 'collateral-visual-branch');
  branch.setAttribute('aria-label', `Sibling branch for ${canonicalName(person)}`);

  const visible = siblings.slice(0, 5);
  const hiddenCount = Math.max(0, siblings.length - visible.length);
  const geometry = branchSide(anchor, visible.length + (hiddenCount ? 1 : 0));
  const radialOffset = Math.hypot(anchor.x - 600, anchor.y - 600) > 485 ? -28 : 30;
  const stemX = anchor.x + geometry.rx * radialOffset;
  const stemY = anchor.y + geometry.ry * radialOffset;
  const sideX = stemX + geometry.tx * geometry.sign * 25;
  const sideY = stemY + geometry.ty * geometry.sign * 25;

  const stem = document.createElementNS(ns, 'path');
  stem.setAttribute('d', `M ${anchor.x} ${anchor.y} Q ${stemX} ${stemY} ${sideX} ${sideY}`);
  stem.setAttribute('class', 'collateral-branch-stem');
  branch.appendChild(stem);

  const items = visible.map((sibling) => ({ sibling, label: shortName(sibling), clickable: true }));
  if (hiddenCount) items.push({ sibling: null, label: `+${hiddenCount}`, clickable: false });

  items.forEach((item, index) => {
    const distance = 48 + index * 48;
    const x = sideX + geometry.tx * geometry.sign * distance;
    const y = sideY + geometry.ty * geometry.sign * distance;

    const twig = document.createElementNS(ns, 'line');
    twig.setAttribute('x1', String(sideX));
    twig.setAttribute('y1', String(sideY));
    twig.setAttribute('x2', String(x));
    twig.setAttribute('y2', String(y));
    twig.setAttribute('class', 'collateral-branch-twig');
    branch.appendChild(twig);

    const node = document.createElementNS(ns, 'g');
    node.setAttribute('class', `collateral-branch-node${item.clickable ? ' is-clickable' : ''}`);
    if (item.clickable) {
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', `Centre the fan on ${canonicalName(item.sibling)}`);
    }

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', '17');
    circle.setAttribute('class', 'collateral-branch-circle');
    circle.setAttribute('fill', anchor.fill);
    node.appendChild(circle);

    addSvgText(ns, node, x, y + 3, item.label.slice(0, 10), 'collateral-branch-name');

    if (item.clickable) {
      const activate = (event) => {
        event.preventDefault();
        event.stopPropagation();
        recenter(item.sibling.id);
      };
      node.addEventListener('click', activate);
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') activate(event);
      });
    }
    branch.appendChild(node);
  });

  svg.appendChild(branch);
}

function decorateFan() {
  if (!state.loaded || !treeCanvas) return;
  const person = selectedPerson();
  if (person) renderVisualBranch(person);
}

function syncToSelection() {
  if (!state.loaded) return;
  const person = selectedPerson();
  if (!person) {
    removeSiblingDrawer();
    removeVisualBranch();
    return;
  }
  if (siblingsOf(person.id).length) {
    showSiblingDrawer(person);
    window.setTimeout(() => renderVisualBranch(person), 0);
  } else {
    removeSiblingDrawer();
    removeVisualBranch();
  }
}

function scheduleDecorate(delay = 60) {
  window.clearTimeout(decorateTimer);
  decorateTimer = window.setTimeout(decorateFan, delay);
}

function installStyles() {
  if (document.getElementById('collateralBandStyles')) return;
  const style = document.createElement('style');
  style.id = 'collateralBandStyles';
  style.textContent = `
    .collateral-drawer{position:relative;display:flex;align-items:center;gap:14px;margin:12px 0 0;padding:11px 46px 11px 14px;border:1px solid rgba(94,73,53,.22);border-radius:14px;background:#fffaf2;box-shadow:0 4px 14px rgba(48,38,29,.07);font-family:Arial,sans-serif}
    .collateral-drawer-heading{min-width:150px;display:grid;gap:2px;color:#3e3329;font-size:12px}
    .collateral-drawer-kicker{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#85786b}
    .collateral-drawer-people{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .collateral-person{display:grid;gap:1px;min-width:92px;border:1px solid rgba(94,73,53,.22);background:#ece0d1;color:#3e3329;border-radius:10px;padding:7px 10px;cursor:pointer;text-align:left;font-family:Arial,sans-serif}
    .collateral-person span{font-size:12px;font-weight:700}
    .collateral-person small{font-size:9px;color:#706459}
    .collateral-person:hover{filter:brightness(.97)}
    .collateral-close{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:1px solid rgba(94,73,53,.2);border-radius:50%;background:#fff;color:#55483c;cursor:pointer}
    .collateral-source-active>path{stroke:#5e4935!important;stroke-width:2.1!important}
    .collateral-visual-branch{pointer-events:none}
    .collateral-branch-stem,.collateral-branch-twig{fill:none;stroke:#8a7b6e;stroke-width:1.35;stroke-linecap:round;opacity:.82}
    .collateral-branch-twig{stroke-width:.9;opacity:.58}
    .collateral-branch-node{pointer-events:none}
    .collateral-branch-node.is-clickable{pointer-events:all;cursor:pointer}
    .collateral-branch-circle{stroke:#7f7165;stroke-width:1.15;fill-opacity:.88}
    .collateral-branch-name{fill:#3f352d;font:700 7px Arial,sans-serif;text-anchor:middle;dominant-baseline:middle;pointer-events:none}
    .collateral-branch-node.is-clickable:hover .collateral-branch-circle{stroke-width:2}
    @media(max-width:760px){.collateral-drawer{align-items:flex-start;flex-direction:column;padding-right:44px}.collateral-drawer-heading{min-width:0}.collateral-drawer-people{width:100%}.collateral-person{flex:1 1 110px}}
  `;
  document.head.appendChild(style);
}

async function loadData() {
  const [peopleResult, relationshipResult] = await Promise.all([
    supabase.from('people').select('id, given_names, preferred_name, preferred_name_status, surname'),
    supabase.from('relationships').select('person1_id, person2_id, relationship_type'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationshipResult.error) throw relationshipResult.error;
  state.people = peopleResult.data || [];
  state.relationships = relationshipResult.data || [];
  state.byId = new Map(state.people.map((person) => [person.id, person]));
  state.loaded = true;
}

async function start() {
  if (!treeCanvas || !centreSelect || !personName) return;
  installStyles();
  try {
    await loadData();
    scheduleDecorate(200);
  } catch {
    return;
  }

  centreSelect.addEventListener('change', () => {
    removeSiblingDrawer();
    removeVisualBranch();
    scheduleDecorate(140);
  });

  treeCanvas.addEventListener('click', () => window.setTimeout(syncToSelection, 0));
  treeCanvas.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') window.setTimeout(syncToSelection, 0);
  });

  const nameObserver = new MutationObserver(() => window.setTimeout(syncToSelection, 0));
  nameObserver.observe(personName, { childList: true, characterData: true, subtree: true });

  const observer = new MutationObserver((mutations) => {
    const svgChanged = mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeName?.toLowerCase() === 'svg'));
    if (svgChanged) window.setTimeout(syncToSelection, 90);
  });
  observer.observe(treeCanvas, { childList: true, subtree: false });

  document.addEventListener('genealogy:known-as-updated', async () => {
    try { await loadData(); syncToSelection(); } catch { /* non-destructive enhancement */ }
  });
}

start();
