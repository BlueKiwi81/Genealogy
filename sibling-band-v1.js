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
let selectedPersonId = null;
let selectedAnchorGroup = null;

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

function parentEdgesOf(personId) {
  return state.relationships
    .filter((r) => r.relationship_type === 'parent' && r.person2_id === personId)
    .map((relationship) => ({ relationship, person: getPerson(relationship.person1_id) }))
    .filter((entry) => entry.person);
}

function parentPairOf(personId) {
  const candidates = parentEdgesOf(personId);
  const slots = [null, null];
  const used = new Set();
  const father = candidates.findIndex((entry) => entry.person.gender === 'male');
  const mother = candidates.findIndex((entry) => entry.person.gender === 'female');
  if (father >= 0) { slots[0] = candidates[father]; used.add(father); }
  if (mother >= 0) { slots[1] = candidates[mother]; used.add(mother); }
  candidates.forEach((entry, index) => {
    if (used.has(index)) return;
    const open = slots.findIndex((slot) => slot === null);
    if (open >= 0) slots[open] = entry;
  });
  return slots;
}

function childrenOf(personId) {
  return state.relationships
    .filter((r) => r.relationship_type === 'parent' && r.person1_id === personId)
    .map((r) => getPerson(r.person2_id))
    .filter(Boolean)
    .sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999'));
}

function partnerEdgesOf(personId) {
  return state.relationships
    .filter((r) => ['spouse', 'partner', 'former_spouse'].includes(r.relationship_type)
      && (r.person1_id === personId || r.person2_id === personId))
    .map((relationship) => ({
      relationship,
      person: getPerson(relationship.person1_id === personId ? relationship.person2_id : relationship.person1_id),
    }))
    .filter((entry) => entry.person);
}

function familyPartnerOf(personId) {
  const edges = partnerEdgesOf(personId);
  const current = edges.find((entry) => entry.relationship.relationship_status === 'current'
    && entry.relationship.relationship_type !== 'former_spouse');
  if (current) return current.person;
  return edges.find((entry) => entry.relationship.relationship_status === 'ended_by_death'
    && ['spouse', 'partner'].includes(entry.relationship.relationship_type))?.person || null;
}

function siblingsOf(personId) {
  const ids = new Set();
  const parentIds = new Set(parentEdgesOf(personId).map((entry) => entry.person.id));
  state.relationships.forEach((r) => {
    if (r.relationship_type === 'sibling' && (r.person1_id === personId || r.person2_id === personId)) {
      ids.add(r.person1_id === personId ? r.person2_id : r.person1_id);
    }
    if (r.relationship_type === 'parent' && parentIds.has(r.person1_id) && r.person2_id !== personId) ids.add(r.person2_id);
  });
  return [...ids].map(getPerson).filter(Boolean).sort((a, b) => canonicalName(a).localeCompare(canonicalName(b)));
}

function coupleChildren(person, partner) {
  if (!partner) return childrenOf(person.id);
  const a = new Set(childrenOf(person.id).map((child) => child.id));
  const b = new Set(childrenOf(partner.id).map((child) => child.id));
  const shared = [...a].filter((id) => b.has(id)).map(getPerson).filter(Boolean);
  if (shared.length) return shared.sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
  return [...new Set([...a, ...b])].map(getPerson).filter(Boolean)
    .sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
}

function buildAncestryLevels(personId, depth) {
  const levels = [];
  let current = [{ person: getPerson(personId), relationship: null }];
  for (let generation = 0; generation < depth; generation += 1) {
    const next = [];
    current.forEach((entry) => {
      if (!entry?.person) { next.push(null, null); return; }
      const [father, mother] = parentPairOf(entry.person.id);
      next.push(father, mother);
    });
    levels.push(next);
    current = next;
  }
  return levels;
}

function buildCoupleLevels(person, partner, depth) {
  const levels = [];
  const first = [...parentPairOf(person.id), ...(partner ? parentPairOf(partner.id) : [null, null])];
  levels.push(first);
  let current = first;
  for (let generation = 1; generation < depth; generation += 1) {
    const next = [];
    current.forEach((entry) => {
      if (!entry?.person) { next.push(null, null); return; }
      const [father, mother] = parentPairOf(entry.person.id);
      next.push(father, mother);
    });
    levels.push(next);
    current = next;
  }
  return levels;
}

function removeSiblingDrawer() {
  document.getElementById('collateralSiblingDrawer')?.remove();
}

function recenter(personId) {
  if (!centreSelect || !personId) return;
  const option = [...centreSelect.options].find((item) => item.value === personId);
  if (!option) return;
  centreSelect.value = personId;
  centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
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
  const kicker = document.createElement('span');
  kicker.className = 'collateral-drawer-kicker';
  kicker.textContent = 'Sibling branch';
  const title = document.createElement('strong');
  title.textContent = `Siblings of ${canonicalName(person)}`;
  heading.append(kicker, title);
  drawer.appendChild(heading);

  const people = document.createElement('div');
  people.className = 'collateral-drawer-people';
  siblings.forEach((sibling) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'collateral-person';
    const short = document.createElement('span');
    short.textContent = shortName(sibling);
    const full = document.createElement('small');
    full.textContent = canonicalName(sibling);
    button.append(short, full);
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

function assignPersonIdsToFan() {
  if (!state.loaded || !treeCanvas || !centreSelect?.value) return;
  const svg = treeCanvas.querySelector('svg');
  const centre = getPerson(centreSelect.value);
  if (!svg || !centre) return;

  svg.querySelectorAll('[data-person-id]').forEach((node) => node.removeAttribute('data-person-id'));

  const mode = document.getElementById('treeViewMode')?.value || 'family';
  const depth = Number(document.getElementById('generationDepth')?.value || 4);
  const partner = mode === 'family' ? familyPartnerOf(centre.id) : null;
  const familyMode = mode === 'family' && Boolean(partner);
  const levels = familyMode ? buildCoupleLevels(centre, partner, depth) : buildAncestryLevels(centre.id, depth);
  const wedgeIds = levels.flat().filter((entry) => entry?.person).map((entry) => entry.person.id);
  const wedgeGroups = [...svg.querySelectorAll('.person-node')].filter((group) => group.querySelector('path'));
  wedgeGroups.forEach((group, index) => {
    if (wedgeIds[index]) group.dataset.personId = wedgeIds[index];
  });

  if (familyMode) {
    const cards = [...svg.querySelectorAll('.family-centre-person')];
    if (cards[0]) cards[0].dataset.personId = centre.id;
    if (cards[1] && partner) cards[1].dataset.personId = partner.id;
    const children = coupleChildren(centre, partner);
    [...svg.querySelectorAll('.family-child-node')].forEach((group, index) => {
      if (children[index]) group.dataset.personId = children[index].id;
    });
  } else {
    const singleCentre = [...svg.querySelectorAll('.person-node')].find((group) => group.querySelector('.centre-card'));
    if (singleCentre) singleCentre.dataset.personId = centre.id;
  }
}

function parseTranslate(value) {
  const match = String(value || '').match(/translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function groupForPerson(svg, person, preferredGroup = null) {
  if (preferredGroup?.isConnected && preferredGroup.dataset?.personId === person.id) return preferredGroup;
  return [...svg.querySelectorAll('[data-person-id]')].find((group) => group.dataset.personId === person.id) || null;
}

function anchorForPerson(svg, person, preferredGroup = null) {
  const group = groupForPerson(svg, person, preferredGroup);
  if (!group) return null;

  if (group.classList.contains('family-centre-person')) {
    const rect = group.querySelector('.family-centre-card');
    if (!rect) return null;
    return {
      x: Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2,
      y: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2,
      group,
      fill: '#e7bea0',
      centre: true,
    };
  }

  if (group.classList.contains('family-child-node')) {
    const circle = group.querySelector('.family-child-circle');
    if (!circle) return null;
    return {
      x: Number(circle.getAttribute('cx')),
      y: Number(circle.getAttribute('cy')),
      group,
      fill: circle.getAttribute('fill') || '#efe4d5',
      centre: true,
    };
  }

  if (group.querySelector('.centre-card')) {
    return { x: 600, y: 600, group, fill: '#fffaf2', centre: true };
  }

  const textGroup = [...group.querySelectorAll('g[transform]')].find((node) => node.querySelector('text'));
  const point = parseTranslate(textGroup?.getAttribute('transform'));
  if (!point) return null;
  const path = group.querySelector('path');
  return { ...point, group, fill: path?.getAttribute('fill') || '#e7bea0', centre: false };
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
  const span = 66 + Math.max(0, count - 1) * 60;
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

function addBranchPath(ns, branch, d, kind) {
  const halo = document.createElementNS(ns, 'path');
  halo.setAttribute('d', d);
  halo.setAttribute('class', `collateral-${kind}-halo`);
  branch.appendChild(halo);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', `collateral-${kind}`);
  branch.appendChild(path);
}

function renderVisualBranch(person, preferredGroup = selectedAnchorGroup) {
  removeVisualBranch();
  if (!treeCanvas || !person) return;
  const siblings = siblingsOf(person.id);
  if (!siblings.length) return;
  const svg = treeCanvas.querySelector('svg');
  if (!svg) return;
  assignPersonIdsToFan();
  const anchor = anchorForPerson(svg, person, preferredGroup);
  if (!anchor || anchor.centre) return;

  anchor.group?.classList.add('collateral-source-active');
  const ns = 'http://www.w3.org/2000/svg';
  const branch = document.createElementNS(ns, 'g');
  branch.setAttribute('class', 'collateral-visual-branch');
  branch.setAttribute('aria-label', `Sibling branch for ${canonicalName(person)}`);

  const visible = siblings.slice(0, 5);
  const hiddenCount = Math.max(0, siblings.length - visible.length);
  const geometry = branchSide(anchor, visible.length + (hiddenCount ? 1 : 0));
  const radialOffset = Math.hypot(anchor.x - 600, anchor.y - 600) > 485 ? -38 : 42;
  const stemX = anchor.x + geometry.rx * radialOffset;
  const stemY = anchor.y + geometry.ry * radialOffset;
  const sideX = stemX + geometry.tx * geometry.sign * 34;
  const sideY = stemY + geometry.ty * geometry.sign * 34;

  addBranchPath(ns, branch, `M ${anchor.x} ${anchor.y} Q ${stemX} ${stemY} ${sideX} ${sideY}`, 'branch-stem');

  const items = visible.map((sibling) => ({ sibling, label: shortName(sibling), clickable: true }));
  if (hiddenCount) items.push({ sibling: null, label: `+${hiddenCount}`, clickable: false });

  items.forEach((item, index) => {
    const distance = 62 + index * 62;
    const x = sideX + geometry.tx * geometry.sign * distance;
    const y = sideY + geometry.ty * geometry.sign * distance;
    addBranchPath(ns, branch, `M ${sideX} ${sideY} L ${x} ${y}`, 'branch-twig');

    const node = document.createElementNS(ns, 'g');
    node.setAttribute('class', `collateral-branch-node${item.clickable ? ' is-clickable' : ''}`);
    if (item.clickable) {
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', `Centre the fan on ${canonicalName(item.sibling)}`);
    }

    const halo = document.createElementNS(ns, 'circle');
    halo.setAttribute('cx', String(x));
    halo.setAttribute('cy', String(y));
    halo.setAttribute('r', '24');
    halo.setAttribute('class', 'collateral-branch-node-halo');
    node.appendChild(halo);

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', '20');
    circle.setAttribute('class', 'collateral-branch-circle');
    node.appendChild(circle);

    const accent = document.createElementNS(ns, 'circle');
    accent.setAttribute('cx', String(x));
    accent.setAttribute('cy', String(y - 12));
    accent.setAttribute('r', '4');
    accent.setAttribute('fill', anchor.fill);
    accent.setAttribute('class', 'collateral-branch-accent');
    node.appendChild(accent);

    addSvgText(ns, node, x, y + 5, item.label.slice(0, 11), 'collateral-branch-name');

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

function currentSelectedPerson() {
  return getPerson(selectedPersonId || centreSelect?.value) || null;
}

function syncToSelection() {
  if (!state.loaded) return;
  assignPersonIdsToFan();
  const person = currentSelectedPerson();
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
  decorateTimer = window.setTimeout(syncToSelection, delay);
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
    .collateral-source-active>path{stroke:#4f4034!important;stroke-width:3!important;filter:drop-shadow(0 0 2px rgba(255,250,242,.95))}
    .collateral-visual-branch{pointer-events:none}
    .collateral-branch-stem-halo,.collateral-branch-twig-halo,.collateral-branch-stem,.collateral-branch-twig{fill:none;stroke-linecap:round;stroke-linejoin:round}
    .collateral-branch-stem-halo{stroke:#fffaf2;stroke-width:8;opacity:.98}
    .collateral-branch-stem{stroke:#55473c;stroke-width:2.7;opacity:.98}
    .collateral-branch-twig-halo{stroke:#fffaf2;stroke-width:6;opacity:.96}
    .collateral-branch-twig{stroke:#65564a;stroke-width:1.9;opacity:.94}
    .collateral-branch-node{pointer-events:none}
    .collateral-branch-node.is-clickable{pointer-events:all;cursor:pointer}
    .collateral-branch-node-halo{fill:#fffaf2;stroke:#fff;stroke-width:4;opacity:.98}
    .collateral-branch-circle{fill:#fffaf2;stroke:#55473c;stroke-width:2.2}
    .collateral-branch-accent{stroke:#55473c;stroke-width:.7}
    .collateral-branch-name{fill:#30271f;font:700 9.5px Arial,sans-serif;text-anchor:middle;dominant-baseline:middle;pointer-events:none;paint-order:stroke;stroke:#fffaf2;stroke-width:2.2px;stroke-linejoin:round}
    .collateral-branch-node.is-clickable:hover .collateral-branch-circle{stroke-width:3.2}
    .collateral-branch-node.is-clickable:focus .collateral-branch-circle{stroke-width:3.2}
    @media(max-width:760px){.collateral-drawer{align-items:flex-start;flex-direction:column;padding-right:44px}.collateral-drawer-heading{min-width:0}.collateral-drawer-people{width:100%}.collateral-person{flex:1 1 110px}}
  `;
  document.head.appendChild(style);
}

async function loadData() {
  const [peopleResult, relationshipResult] = await Promise.all([
    supabase.from('people').select('id, given_names, preferred_name, preferred_name_status, surname, gender, birth_date'),
    supabase.from('relationships').select('person1_id, person2_id, relationship_type, relationship_status, source_status'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationshipResult.error) throw relationshipResult.error;
  state.people = peopleResult.data || [];
  state.relationships = relationshipResult.data || [];
  state.byId = new Map(state.people.map((person) => [person.id, person]));
  state.loaded = true;
}

function capturePersonInteraction(event) {
  assignPersonIdsToFan();
  const target = event.target.closest?.('[data-person-id]');
  if (!target || !treeCanvas?.contains(target)) return;
  selectedPersonId = target.dataset.personId;
  selectedAnchorGroup = target;
  window.setTimeout(syncToSelection, 0);
}

async function start() {
  if (!treeCanvas || !centreSelect || !personName) return;
  installStyles();
  try {
    await loadData();
    selectedPersonId = centreSelect.value || null;
    scheduleDecorate(200);
  } catch {
    return;
  }

  centreSelect.addEventListener('change', () => {
    selectedPersonId = centreSelect.value || null;
    selectedAnchorGroup = null;
    removeSiblingDrawer();
    removeVisualBranch();
    scheduleDecorate(150);
  });

  treeCanvas.addEventListener('click', capturePersonInteraction, true);
  treeCanvas.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') capturePersonInteraction(event);
  }, true);

  const observer = new MutationObserver((mutations) => {
    const svgChanged = mutations.some((mutation) => [...mutation.addedNodes]
      .some((node) => node.nodeName?.toLowerCase() === 'svg'));
    if (!svgChanged) return;
    selectedPersonId = centreSelect.value || selectedPersonId;
    selectedAnchorGroup = null;
    window.setTimeout(syncToSelection, 90);
  });
  observer.observe(treeCanvas, { childList: true, subtree: false });

  document.addEventListener('genealogy:known-as-updated', async () => {
    try { await loadData(); syncToSelection(); } catch { /* non-destructive enhancement */ }
  });
}

start();
