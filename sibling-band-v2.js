import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const APPROVED_KNOWN_AS = new Set(['documented', 'strong', 'family_supplied']);
const SOURCE_RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };
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

function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

function lifeDates(person) {
  const birth = formatDate(person?.birth_date);
  const death = formatDate(person?.death_date);
  if (birth && death) return `${birth} - ${death}`;
  if (birth) return `Born ${birth}`;
  if (death) return `Died ${death}`;
  return 'Dates not yet recorded';
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
    .filter((entry) => entry.person)
    .sort((a, b) => {
      const priority = (entry) => {
        if (entry.relationship.relationship_status === 'current' && entry.relationship.relationship_type !== 'former_spouse') return 3;
        if (entry.relationship.relationship_status === 'ended_by_death') return 2;
        return 1;
      };
      return priority(b) - priority(a);
    });
}

function familyPartnerOf(personId) {
  const edges = partnerEdgesOf(personId);
  const current = edges.find((entry) => entry.relationship.relationship_status === 'current'
    && entry.relationship.relationship_type !== 'former_spouse');
  if (current) return current.person;
  return edges.find((entry) => entry.relationship.relationship_status === 'ended_by_death'
    && ['spouse', 'partner'].includes(entry.relationship.relationship_type))?.person || null;
}

function partnerDescription(personId) {
  const edges = partnerEdgesOf(personId).slice(0, 2);
  if (!edges.length) return [];
  return edges.map(({ person, relationship }) => {
    let label = relationship.relationship_type === 'partner' ? 'Partner' : 'Spouse';
    if (relationship.relationship_type === 'former_spouse' || ['ended', 'historical'].includes(relationship.relationship_status)) {
      label = relationship.relationship_type === 'partner' ? 'Former partner' : 'Former spouse';
    }
    const note = relationship.relationship_status === 'ended_by_death'
      ? 'marriage ended by death'
      : relationship.date_note || '';
    return `${label}: ${canonicalName(person)}${note ? ` (${note})` : ''}`;
  });
}

function siblingEvidenceStatus(personId, siblingId) {
  const explicit = state.relationships
    .filter((r) => r.relationship_type === 'sibling'
      && ((r.person1_id === personId && r.person2_id === siblingId)
        || (r.person1_id === siblingId && r.person2_id === personId)))
    .map((r) => r.source_status || 'unresolved')
    .sort((a, b) => (SOURCE_RANK[b] || 0) - (SOURCE_RANK[a] || 0));
  if (explicit.length) return explicit[0];

  const personParents = new Map(parentEdgesOf(personId).map((entry) => [entry.person.id, entry.relationship]));
  const siblingParents = new Map(parentEdgesOf(siblingId).map((entry) => [entry.person.id, entry.relationship]));
  const shared = [...personParents.keys()].filter((id) => siblingParents.has(id));
  if (!shared.length) return 'unresolved';

  const pairStatuses = shared.map((parentId) => {
    const a = personParents.get(parentId)?.source_status || 'unresolved';
    const b = siblingParents.get(parentId)?.source_status || 'unresolved';
    return (SOURCE_RANK[a] || 0) <= (SOURCE_RANK[b] || 0) ? a : b;
  });
  return pairStatuses.sort((a, b) => (SOURCE_RANK[b] || 0) - (SOURCE_RANK[a] || 0))[0] || 'unresolved';
}

function siblingEntries(personId) {
  const ids = new Set();
  const parentIds = new Set(parentEdgesOf(personId).map((entry) => entry.person.id));
  state.relationships.forEach((r) => {
    if (r.relationship_type === 'sibling' && (r.person1_id === personId || r.person2_id === personId)) {
      ids.add(r.person1_id === personId ? r.person2_id : r.person1_id);
    }
    if (r.relationship_type === 'parent' && parentIds.has(r.person1_id) && r.person2_id !== personId) ids.add(r.person2_id);
  });
  return [...ids]
    .map((id) => ({ person: getPerson(id), sourceStatus: siblingEvidenceStatus(personId, id) }))
    .filter((entry) => entry.person)
    .sort((a, b) => canonicalName(a.person).localeCompare(canonicalName(b.person)));
}

function siblingsOf(personId) {
  return siblingEntries(personId).map((entry) => entry.person);
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

function removeSiblingCard() {
  document.getElementById('collateralSiblingCard')?.remove();
}

function removeFanCue() {
  const svg = treeCanvas?.querySelector('svg');
  svg?.querySelector('.collateral-sibling-cue')?.remove();
  svg?.querySelectorAll('.collateral-source-active').forEach((node) => node.classList.remove('collateral-source-active'));
}

function removeSiblingVisuals() {
  removeSiblingCard();
  removeFanCue();
}

function recenter(personId) {
  if (!centreSelect || !personId) return;
  const option = [...centreSelect.options].find((item) => item.value === personId);
  if (!option) return;
  centreSelect.value = personId;
  centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function evidenceLabel(status) {
  if (status === 'hypothesis') return 'Hypothesis';
  if (status === 'probable') return 'Probable';
  return '';
}

function showSiblingDrawer(person) {
  removeSiblingDrawer();
  if (!treeCanvas || !person) return;
  const entries = siblingEntries(person.id);
  if (!entries.length) return;

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
  entries.forEach(({ person: sibling, sourceStatus }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `collateral-person${['probable', 'hypothesis'].includes(sourceStatus) ? ' is-uncertain' : ''}`;
    const short = document.createElement('span');
    short.textContent = shortName(sibling);
    const full = document.createElement('small');
    full.textContent = canonicalName(sibling);
    button.append(short, full);
    const evidence = evidenceLabel(sourceStatus);
    if (evidence) {
      const badge = document.createElement('em');
      badge.textContent = evidence;
      button.appendChild(badge);
    }
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
    removeSiblingVisuals();
  });
  drawer.appendChild(close);

  treeCanvas.parentElement?.insertBefore(drawer, treeCanvas);
}

function showSiblingDetailCard(person) {
  removeSiblingCard();
  if (!treeCanvas || !person) return;
  const entries = siblingEntries(person.id);
  if (!entries.length) return;

  const card = document.createElement('section');
  card.id = 'collateralSiblingCard';
  card.className = 'collateral-detail-card';
  card.setAttribute('aria-label', `Sibling details for ${canonicalName(person)}`);

  const header = document.createElement('div');
  header.className = 'collateral-detail-header';
  const headingText = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.className = 'collateral-detail-kicker';
  kicker.textContent = 'Collateral family';
  const title = document.createElement('h3');
  title.textContent = `Siblings of ${shortName(person)}`;
  const sub = document.createElement('p');
  sub.textContent = canonicalName(person);
  headingText.append(kicker, title, sub);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'collateral-detail-close';
  close.setAttribute('aria-label', 'Close sibling details');
  close.textContent = 'x';
  close.addEventListener('click', removeSiblingCard);
  header.append(headingText, close);
  card.appendChild(header);

  const list = document.createElement('div');
  list.className = 'collateral-detail-list';

  entries.forEach(({ person: sibling, sourceStatus }) => {
    const item = document.createElement('article');
    item.className = `collateral-detail-person${['probable', 'hypothesis'].includes(sourceStatus) ? ' is-uncertain' : ''}`;

    const top = document.createElement('div');
    top.className = 'collateral-detail-person-top';
    const identity = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = canonicalName(sibling);
    identity.appendChild(name);
    const known = sibling.preferred_name?.trim();
    if (known && APPROVED_KNOWN_AS.has(sibling.preferred_name_status || 'unresolved')) {
      const knownAs = document.createElement('span');
      knownAs.className = 'collateral-known-as';
      knownAs.textContent = `Known as ${known}`;
      identity.appendChild(knownAs);
    }
    const confidence = evidenceLabel(sourceStatus);
    if (confidence) {
      const badge = document.createElement('span');
      badge.className = 'collateral-evidence-badge';
      badge.textContent = confidence;
      top.append(identity, badge);
    } else {
      top.appendChild(identity);
    }
    item.appendChild(top);

    const life = document.createElement('p');
    life.className = 'collateral-detail-meta';
    life.textContent = lifeDates(sibling);
    item.appendChild(life);

    partnerDescription(sibling.id).forEach((description) => {
      const line = document.createElement('p');
      line.className = 'collateral-detail-meta';
      line.textContent = description;
      item.appendChild(line);
    });

    const childCount = childrenOf(sibling.id).length;
    if (childCount) {
      const children = document.createElement('p');
      children.className = 'collateral-detail-meta';
      children.textContent = `${childCount} ${childCount === 1 ? 'child' : 'children'} recorded`;
      item.appendChild(children);
    }

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'collateral-centre-action';
    action.textContent = `Centre fan on ${shortName(sibling)}`;
    action.addEventListener('click', () => recenter(sibling.id));
    item.appendChild(action);
    list.appendChild(item);
  });

  card.appendChild(list);
  treeCanvas.parentElement?.appendChild(card);
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
      centre: true,
    };
  }

  if (group.querySelector('.centre-card')) return { x: 600, y: 600, group, centre: true };

  const textGroup = [...group.querySelectorAll('g[transform]')].find((node) => node.querySelector('text'));
  const point = parseTranslate(textGroup?.getAttribute('transform'));
  if (!point) return null;
  return { ...point, group, centre: false };
}

function polarPoint(radius, angleDegrees) {
  const radians = angleDegrees * Math.PI / 180;
  return { x: 600 + radius * Math.cos(radians), y: 600 + radius * Math.sin(radians) };
}

function renderSiblingCue(person, preferredGroup = selectedAnchorGroup) {
  removeFanCue();
  if (!treeCanvas || !person) return;
  const entries = siblingEntries(person.id);
  if (!entries.length) return;
  const svg = treeCanvas.querySelector('svg');
  if (!svg) return;
  assignPersonIdsToFan();
  const anchor = anchorForPerson(svg, person, preferredGroup);
  if (!anchor || anchor.centre) return;

  anchor.group.classList.add('collateral-source-active');
  const ns = 'http://www.w3.org/2000/svg';
  const cue = document.createElementNS(ns, 'g');
  cue.setAttribute('class', 'collateral-sibling-cue');
  cue.setAttribute('role', 'button');
  cue.setAttribute('tabindex', '0');
  cue.setAttribute('aria-label', `Show ${entries.length} ${entries.length === 1 ? 'sibling' : 'siblings'} of ${canonicalName(person)}`);

  const dx = anchor.x - 600;
  const dy = anchor.y - 600;
  const radius = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const outward = radius < 500;
  const cueRadius = Math.max(155, Math.min(548, radius + (outward ? 30 : -30)));
  const span = Math.min(18, 10 + entries.length * 1.5);
  const start = polarPoint(cueRadius, angle - span / 2);
  const end = polarPoint(cueRadius, angle + span / 2);
  const arc = `M ${start.x} ${start.y} A ${cueRadius} ${cueRadius} 0 0 1 ${end.x} ${end.y}`;

  const halo = document.createElementNS(ns, 'path');
  halo.setAttribute('d', arc);
  halo.setAttribute('class', 'collateral-cue-arc-halo');
  cue.appendChild(halo);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', arc);
  path.setAttribute('class', 'collateral-cue-arc');
  cue.appendChild(path);

  const labelRadius = cueRadius + (outward ? 18 : -18);
  const labelPoint = polarPoint(labelRadius, angle);
  const label = `${entries.length} ${entries.length === 1 ? 'sibling' : 'siblings'}`;
  const width = Math.max(64, 18 + label.length * 6.2);
  const pill = document.createElementNS(ns, 'rect');
  pill.setAttribute('x', String(labelPoint.x - width / 2));
  pill.setAttribute('y', String(labelPoint.y - 12));
  pill.setAttribute('width', String(width));
  pill.setAttribute('height', '24');
  pill.setAttribute('rx', '12');
  pill.setAttribute('class', 'collateral-cue-pill');
  cue.appendChild(pill);
  const text = document.createElementNS(ns, 'text');
  text.setAttribute('x', String(labelPoint.x));
  text.setAttribute('y', String(labelPoint.y + 3.5));
  text.setAttribute('class', 'collateral-cue-label');
  text.textContent = label;
  cue.appendChild(text);

  const activate = (event) => {
    event.preventDefault();
    event.stopPropagation();
    showSiblingDetailCard(person);
  };
  cue.addEventListener('click', activate);
  cue.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
  svg.appendChild(cue);
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
    removeSiblingVisuals();
    return;
  }
  if (siblingEntries(person.id).length) {
    showSiblingDrawer(person);
    showSiblingDetailCard(person);
    window.setTimeout(() => renderSiblingCue(person), 0);
  } else {
    removeSiblingDrawer();
    removeSiblingVisuals();
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
    .tree-panel{position:relative}
    .collateral-drawer{position:relative;display:flex;align-items:center;gap:14px;margin:12px 0 0;padding:11px 46px 11px 14px;border:1px solid rgba(94,73,53,.22);border-radius:14px;background:#fffaf2;box-shadow:0 4px 14px rgba(48,38,29,.07);font-family:Arial,sans-serif}
    .collateral-drawer-heading{min-width:150px;display:grid;gap:2px;color:#3e3329;font-size:12px}
    .collateral-drawer-kicker{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#85786b}
    .collateral-drawer-people{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .collateral-person{display:grid;gap:1px;min-width:92px;border:1px solid rgba(94,73,53,.22);background:#ece0d1;color:#3e3329;border-radius:10px;padding:7px 10px;cursor:pointer;text-align:left;font-family:Arial,sans-serif}
    .collateral-person span{font-size:12px;font-weight:700}
    .collateral-person small{font-size:9px;color:#706459}
    .collateral-person em{font-size:8px;font-style:normal;text-transform:uppercase;letter-spacing:.06em;color:#8a5d35}
    .collateral-person.is-uncertain{border-style:dashed;background:#f5eee5}
    .collateral-person:hover{filter:brightness(.97)}
    .collateral-close{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:1px solid rgba(94,73,53,.2);border-radius:50%;background:#fff;color:#55483c;cursor:pointer}

    .collateral-detail-card{position:absolute;right:22px;top:142px;z-index:12;width:min(360px,calc(100% - 44px));max-height:520px;overflow:auto;border:1px solid rgba(78,62,48,.34);border-radius:18px;background:rgba(255,250,242,.98);box-shadow:0 16px 38px rgba(47,37,28,.18);padding:16px;font-family:Arial,sans-serif;color:#30271f;backdrop-filter:blur(2px)}
    .collateral-detail-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding-bottom:11px;border-bottom:1px solid rgba(94,73,53,.16)}
    .collateral-detail-kicker{display:block;margin-bottom:3px;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#85786b}
    .collateral-detail-header h3{margin:0;font:700 18px/1.15 Georgia,serif;color:#2e261f}
    .collateral-detail-header p{margin:4px 0 0;font-size:10px;color:#766a60}
    .collateral-detail-close{flex:0 0 auto;width:30px;height:30px;border:1px solid rgba(94,73,53,.2);border-radius:50%;background:#fff;color:#55483c;cursor:pointer}
    .collateral-detail-list{display:grid;gap:10px;padding-top:11px}
    .collateral-detail-person{border:1px solid rgba(94,73,53,.2);border-radius:13px;background:#fffdf9;padding:11px}
    .collateral-detail-person.is-uncertain{border-style:dashed;background:#fbf6ef}
    .collateral-detail-person-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
    .collateral-detail-person-top>div{display:grid;gap:2px;min-width:0}
    .collateral-detail-person strong{font:700 13px/1.2 Georgia,serif;color:#30271f}
    .collateral-known-as{font-size:9.5px;color:#786b60}
    .collateral-evidence-badge{flex:0 0 auto;border:1px dashed #9b7657;border-radius:999px;padding:3px 6px;font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#845c39;background:#fff8ef}
    .collateral-detail-meta{margin:5px 0 0;font-size:10.5px;line-height:1.35;color:#65594f}
    .collateral-centre-action{margin-top:9px;border:1px solid rgba(94,73,53,.24);border-radius:9px;background:#ece0d1;color:#3e3329;padding:7px 9px;cursor:pointer;font:700 10px Arial,sans-serif}
    .collateral-centre-action:hover{filter:brightness(.97)}

    .collateral-source-active>path{stroke:#4a3b30!important;stroke-width:3.2!important;filter:drop-shadow(0 0 2px rgba(255,250,242,.98))}
    .collateral-sibling-cue{cursor:pointer;pointer-events:all}
    .collateral-cue-arc-halo,.collateral-cue-arc{fill:none;stroke-linecap:round}
    .collateral-cue-arc-halo{stroke:#fffaf2;stroke-width:9;opacity:.98;pointer-events:none}
    .collateral-cue-arc{stroke:#54463b;stroke-width:3.1;opacity:.98;pointer-events:none}
    .collateral-cue-pill{fill:#fffaf2;stroke:#54463b;stroke-width:1.8;filter:drop-shadow(0 2px 2px rgba(51,39,29,.16))}
    .collateral-cue-label{fill:#30271f;font:700 9.5px Arial,sans-serif;text-anchor:middle;pointer-events:none}
    .collateral-sibling-cue:hover .collateral-cue-pill,.collateral-sibling-cue:focus .collateral-cue-pill{stroke-width:2.6}

    @media(max-width:900px){.collateral-detail-card{right:14px;top:154px;width:min(330px,calc(100% - 28px))}}
    @media(max-width:760px){.collateral-drawer{align-items:flex-start;flex-direction:column;padding-right:44px}.collateral-drawer-heading{min-width:0}.collateral-drawer-people{width:100%}.collateral-person{flex:1 1 110px}.collateral-detail-card{position:relative;right:auto;top:auto;width:auto;max-height:none;margin:12px 0 0}}
  `;
  document.head.appendChild(style);
}

async function loadData() {
  const [peopleResult, relationshipResult] = await Promise.all([
    supabase.from('people').select('id, given_names, preferred_name, preferred_name_status, surname, gender, birth_date, death_date'),
    supabase.from('relationships').select('person1_id, person2_id, relationship_type, relationship_status, source_status, date_note'),
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
    removeSiblingVisuals();
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
