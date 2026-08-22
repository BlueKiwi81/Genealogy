import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const APPROVED_KNOWN_AS = new Set(['documented', 'strong', 'family_supplied']);
const SOURCE_RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };
const PALETTE = ['#e7bea0', '#b8d5de', '#cbd6a6', '#d2c2df'];

const ui = {
  centreSelect: document.getElementById('centreSelect'),
  centreMe: document.getElementById('centreMe'),
  treeCanvas: document.getElementById('treeCanvas'),
  treeStatus: document.getElementById('treeStatus'),
  personName: document.getElementById('personName'),
  personDetails: document.getElementById('personDetails'),
  viewTitle: document.getElementById('viewTitle'),
  viewSummary: document.getElementById('viewSummary'),
  panelHead: document.querySelector('.tree-panel .panel-head'),
  contributionType: document.getElementById('contributionType'),
};

const state = {
  people: [],
  relationships: [],
  peopleById: new Map(),
  loaded: false,
  mode: 'family',
  depth: 4,
};

function canonicalName(person) {
  if (!person) return 'Unknown';
  return [person.given_names?.trim(), person.surname?.trim()].filter(Boolean).join(' ');
}

function firstLegalName(person) {
  const first = (person?.given_names || '').trim().split(/\s+/)[0] || '';
  return [first, person?.surname?.trim()].filter(Boolean).join(' ');
}

function approvedKnownAs(person) {
  const value = person?.preferred_name?.trim();
  const status = person?.preferred_name_status || 'unresolved';
  if (!value || !APPROVED_KNOWN_AS.has(status)) return '';
  const first = (person?.given_names || '').trim().split(/\s+/)[0] || '';
  if (value.toLowerCase() === first.toLowerCase()) return '';
  return value;
}

function years(person) {
  const b = person?.birth_date?.slice(0, 4) || '';
  const d = person?.death_date?.slice(0, 4) || '';
  if (b && d) return `${b}-${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return '';
}

function selectorName(person) {
  const y = years(person);
  return `${canonicalName(person)}${y ? ` (${y})` : ''}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function sourceLabel(value) {
  return (value || 'unresolved').replaceAll('_', ' ');
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function getPerson(id) {
  return state.peopleById.get(id) || null;
}

function parentEdgesOf(personId) {
  return state.relationships
    .filter((r) => r.relationship_type === 'parent' && r.person2_id === personId)
    .map((relationship) => ({ relationship, person: getPerson(relationship.person1_id) }))
    .filter((entry) => entry.person)
    .sort((a, b) => {
      const rank = (SOURCE_RANK[b.relationship.source_status] || 0) - (SOURCE_RANK[a.relationship.source_status] || 0);
      return rank || canonicalName(a.person).localeCompare(canonicalName(b.person));
    });
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
      const aCurrent = a.relationship.relationship_status === 'current' && a.relationship.relationship_type !== 'former_spouse' ? 1 : 0;
      const bCurrent = b.relationship.relationship_status === 'current' && b.relationship.relationship_type !== 'former_spouse' ? 1 : 0;
      return bCurrent - aCurrent;
    });
}

function currentPartnerOf(personId) {
  return partnerEdgesOf(personId).find((entry) => entry.relationship.relationship_status === 'current' && entry.relationship.relationship_type !== 'former_spouse')?.person || null;
}

function siblingsOf(personId) {
  const ids = new Set();
  const parentIds = parentEdgesOf(personId).map((entry) => entry.person.id);
  state.relationships.forEach((r) => {
    if (r.relationship_type === 'sibling' && (r.person1_id === personId || r.person2_id === personId)) {
      ids.add(r.person1_id === personId ? r.person2_id : r.person1_id);
    }
    if (r.relationship_type === 'parent' && parentIds.includes(r.person1_id) && r.person2_id !== personId) ids.add(r.person2_id);
  });
  return [...ids].map(getPerson).filter(Boolean).sort((a, b) => canonicalName(a).localeCompare(canonicalName(b)));
}

function coupleChildren(person, partner) {
  if (!partner) return childrenOf(person.id);
  const a = new Set(childrenOf(person.id).map((child) => child.id));
  const b = new Set(childrenOf(partner.id).map((child) => child.id));
  const shared = [...a].filter((id) => b.has(id)).map(getPerson).filter(Boolean);
  if (shared.length) return shared.sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
  return [...new Set([...a, ...b])].map(getPerson).filter(Boolean).sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
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
  const first = [
    ...parentPairOf(person.id),
    ...(partner ? parentPairOf(partner.id) : [null, null]),
  ];
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

function polar(cx, cy, radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

function sectorPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  const p1 = polar(cx, cy, outerRadius, startAngle);
  const p2 = polar(cx, cy, outerRadius, endAngle);
  const p3 = polar(cx, cy, innerRadius, endAngle);
  const p4 = polar(cx, cy, innerRadius, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${p1[0]} ${p1[1]} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`;
}

function readableRotation(angle) {
  let rotation = angle;
  if (angle > 90 && angle < 270) rotation += 180;
  return rotation;
}

function branchIndex(slot, levelIndex, familyMode) {
  const rootBranches = familyMode ? 4 : 2;
  const slotsAtLevel = rootBranches * (2 ** levelIndex);
  const perBranch = slotsAtLevel / rootBranches;
  return Math.min(rootBranches - 1, Math.floor(slot / perBranch));
}

function evidenceStyle(path, status) {
  if (status === 'hypothesis') {
    path.setAttribute('fill-opacity', '.42');
    path.setAttribute('stroke-dasharray', '8 5');
  } else if (status === 'probable') {
    path.setAttribute('fill-opacity', '.62');
    path.setAttribute('stroke-dasharray', '5 4');
  } else if (status === 'family_supplied') {
    path.setAttribute('fill-opacity', '.82');
  } else {
    path.setAttribute('fill-opacity', '.94');
  }
}

function addTextLine(group, ns, text, y, className, fontSize = null) {
  const node = document.createElementNS(ns, 'text');
  node.setAttribute('x', '0');
  node.setAttribute('y', String(y));
  node.setAttribute('class', className);
  if (fontSize) node.setAttribute('font-size', String(fontSize));
  node.textContent = text;
  group.appendChild(node);
}

function renderDetails(person) {
  if (!person || !ui.personName || !ui.personDetails) return;
  ui.personName.textContent = canonicalName(person);
  const lines = [];
  const known = approvedKnownAs(person);
  if (known) lines.push(['Known as', known]);
  const life = [formatDate(person.birth_date), formatDate(person.death_date)].filter(Boolean).join(' - ');
  if (life) lines.push(['Life', life]);
  if (person.birth_place) lines.push(['Birthplace', person.birth_place]);
  if (person.death_place) lines.push(['Death place', person.death_place]);
  if (person.occupation_summary) lines.push(['Occupation', person.occupation_summary]);
  partnerEdgesOf(person.id).forEach(({ person: partner, relationship }) => {
    const label = relationship.relationship_type === 'former_spouse' || relationship.relationship_status === 'ended'
      ? 'Former spouse'
      : relationship.relationship_type === 'partner' ? 'Partner' : 'Spouse';
    lines.push([label, `${canonicalName(partner)}${relationship.date_note ? ` - ${relationship.date_note}` : ''}`]);
  });
  lines.push(['Source status', sourceLabel(person.source_status)]);
  if (person.narrative_summary) lines.push(['Family note', person.narrative_summary]);
  const children = childrenOf(person.id);
  if (children.length) lines.push(['Children', children.map(canonicalName).join(', ')]);
  const siblings = siblingsOf(person.id);
  if (siblings.length) lines.push(['Siblings', siblings.map(canonicalName).join(', ')]);
  ui.personDetails.innerHTML = lines.map(([label, value]) => `<div class="detail-line"><strong>${esc(label)}</strong>${esc(value)}</div>`).join('');
}

function personNode(ns, person, relationship, slot, levelIndex, innerRadius, outerRadius, startAngle, endAngle, familyMode) {
  const group = document.createElementNS(ns, 'g');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', sectorPath(600, 600, innerRadius, outerRadius, startAngle, endAngle));
  path.setAttribute('stroke', '#8c8175');
  path.setAttribute('stroke-width', '1.05');
  if (person) {
    path.setAttribute('fill', PALETTE[branchIndex(slot, levelIndex, familyMode) % PALETTE.length]);
    evidenceStyle(path, relationship?.source_status || person.source_status);
  } else {
    path.setAttribute('fill', '#e8e3dc');
    path.setAttribute('fill-opacity', '.25');
    path.setAttribute('stroke-dasharray', '5 4');
  }
  group.appendChild(path);

  const mid = (startAngle + endAngle) / 2;
  const [x, y] = polar(600, 600, (innerRadius + outerRadius) / 2, mid);
  const textGroup = document.createElementNS(ns, 'g');
  textGroup.setAttribute('transform', `translate(${x} ${y}) rotate(${readableRotation(mid)})`);
  const slotCount = familyMode ? 4 * (2 ** levelIndex) : 2 * (2 ** levelIndex);
  const fontSize = slotCount >= 64 ? 7.2 : slotCount >= 32 ? 8 : slotCount >= 16 ? 9 : 10.5;
  addTextLine(textGroup, ns, person ? firstLegalName(person) : '?', person && approvedKnownAs(person) ? -8 : -2, 'fan-label enhanced-fan-label', fontSize);
  if (person && approvedKnownAs(person)) addTextLine(textGroup, ns, `known as ${approvedKnownAs(person)}`, 5, 'fan-known-as', Math.max(6.5, fontSize - 1.5));
  if (person && years(person)) addTextLine(textGroup, ns, years(person), person && approvedKnownAs(person) ? 17 : 11, 'fan-date enhanced-fan-date', Math.max(6, fontSize - 2));
  group.appendChild(textGroup);

  if (person) {
    group.classList.add('person-node');
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', canonicalName(person));
    const activate = () => renderDetails(person);
    group.addEventListener('click', activate);
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    });
  }
  return group;
}

function renderSingleCentre(svg, ns, person) {
  const group = document.createElementNS(ns, 'g');
  group.classList.add('person-node');
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '600'); circle.setAttribute('cy', '600'); circle.setAttribute('r', '105'); circle.setAttribute('class', 'centre-card');
  group.appendChild(circle);
  const name = document.createElementNS(ns, 'text');
  name.setAttribute('x', '600'); name.setAttribute('y', '592'); name.setAttribute('class', 'centre-name'); name.textContent = canonicalName(person);
  group.appendChild(name);
  const known = approvedKnownAs(person);
  const sub = document.createElementNS(ns, 'text');
  sub.setAttribute('x', '600'); sub.setAttribute('y', '616'); sub.setAttribute('class', 'centre-sub'); sub.textContent = known ? `KNOWN AS ${known.toUpperCase()}` : (years(person) || 'CENTRE PERSON');
  group.appendChild(sub);
  group.addEventListener('click', () => renderDetails(person));
  svg.appendChild(group);
}

function renderFamilyCentre(svg, ns, person, partner) {
  const base = document.createElementNS(ns, 'circle');
  base.setAttribute('cx', '600'); base.setAttribute('cy', '600'); base.setAttribute('r', '160'); base.setAttribute('class', 'family-centre-disc');
  svg.appendChild(base);

  const people = partner ? [person, partner] : [person];
  const y = partner ? 555 : 570;
  people.forEach((member, index) => {
    const x = partner ? (index === 0 ? 515 : 685) : 600;
    const card = document.createElementNS(ns, 'g');
    card.classList.add('family-centre-person');
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(x - 75)); rect.setAttribute('y', String(y - 27)); rect.setAttribute('width', '150'); rect.setAttribute('height', '54'); rect.setAttribute('rx', '14'); rect.setAttribute('class', 'family-centre-card');
    card.appendChild(rect);
    const name = document.createElementNS(ns, 'text');
    name.setAttribute('x', String(x)); name.setAttribute('y', String(y - 3)); name.setAttribute('class', 'family-centre-name'); name.textContent = firstLegalName(member);
    card.appendChild(name);
    const sub = document.createElementNS(ns, 'text');
    sub.setAttribute('x', String(x)); sub.setAttribute('y', String(y + 14)); sub.setAttribute('class', 'family-centre-sub'); sub.textContent = approvedKnownAs(member) ? `known as ${approvedKnownAs(member)}` : (years(member) || '');
    card.appendChild(sub);
    card.addEventListener('click', () => renderDetails(member));
    svg.appendChild(card);
  });

  if (partner) {
    const link = document.createElementNS(ns, 'line');
    link.setAttribute('x1', '590'); link.setAttribute('y1', String(y)); link.setAttribute('x2', '610'); link.setAttribute('y2', String(y)); link.setAttribute('class', 'family-couple-link');
    svg.appendChild(link);
  }

  const children = coupleChildren(person, partner);
  if (!children.length) return;
  const width = Math.min(270, Math.max(170, children.length * 58));
  children.forEach((child, index) => {
    const x = children.length === 1 ? 600 : 600 - width / 2 + (width * index / (children.length - 1));
    const yChild = 668;
    const node = document.createElementNS(ns, 'g');
    node.classList.add('family-child-node');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', String(x)); circle.setAttribute('cy', String(yChild)); circle.setAttribute('r', '23'); circle.setAttribute('class', 'family-child-circle');
    node.appendChild(circle);
    const initials = document.createElementNS(ns, 'text');
    initials.setAttribute('x', String(x)); initials.setAttribute('y', String(yChild + 4)); initials.setAttribute('class', 'family-child-initial'); initials.textContent = (child.given_names || '?').trim().slice(0, 1);
    node.appendChild(initials);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(x)); label.setAttribute('y', String(yChild + 40)); label.setAttribute('class', 'family-child-label'); label.textContent = firstLegalName(child);
    node.appendChild(label);
    node.addEventListener('click', () => renderDetails(child));
    svg.appendChild(node);
  });
}

function renderEnhancedTree() {
  if (!state.loaded || !ui.treeCanvas || !ui.centreSelect?.value) return;
  const person = getPerson(ui.centreSelect.value);
  if (!person) return;
  const partner = state.mode === 'family' ? currentPartnerOf(person.id) : null;
  const familyMode = state.mode === 'family' && Boolean(partner);
  const depth = state.depth;
  const levels = familyMode ? buildCoupleLevels(person, partner, depth) : buildAncestryLevels(person.id, depth);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 1200 1200');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', familyMode ? `Family fan for ${canonicalName(person)} and ${canonicalName(partner)}` : `Ancestor fan centred on ${canonicalName(person)}`);

  const innerStart = familyMode ? 180 : 125;
  const outerLimit = 575;
  const gap = 2;
  const thickness = (outerLimit - innerStart - gap * (depth - 1)) / depth;

  levels.forEach((entries, levelIndex) => {
    const slots = entries.length;
    const step = 360 / slots;
    const innerRadius = innerStart + levelIndex * (thickness + gap);
    const outerRadius = innerRadius + thickness;
    entries.forEach((entry, slot) => {
      svg.appendChild(personNode(ns, entry?.person || null, entry?.relationship || null, slot, levelIndex, innerRadius, outerRadius, slot * step, (slot + 1) * step, familyMode));
    });
  });

  if (familyMode) renderFamilyCentre(svg, ns, person, partner);
  else renderSingleCentre(svg, ns, person);

  ui.treeCanvas.replaceChildren(svg);
  if (ui.viewTitle) ui.viewTitle.textContent = familyMode ? `${firstLegalName(person)} & ${firstLegalName(partner)}` : canonicalName(person);
  if (ui.viewSummary) {
    ui.viewSummary.textContent = familyMode
      ? `Family view: ${canonicalName(person)} and ${canonicalName(partner)} share the centre, with their children visible and ${depth} ancestor generations radiating outward.`
      : `Person-centred ancestry view with ${depth} ancestor generations. Unknown parents retain their own empty wedges.`;
  }
  if (ui.treeStatus) ui.treeStatus.textContent = `${state.people.length} people loaded. Showing ${depth} ancestor generations.`;
  renderDetails(person);
}

function ensureControls() {
  if (!ui.panelHead || document.getElementById('treeViewMode')) return;
  const controls = document.createElement('div');
  controls.className = 'enhanced-tree-controls';
  controls.innerHTML = `
    <label class="select-label enhanced-select-label">View
      <select id="treeViewMode">
        <option value="family">Family view</option>
        <option value="ancestry">Person ancestry</option>
      </select>
    </label>
    <label class="select-label enhanced-select-label">Generations
      <select id="generationDepth">
        <option value="4">4</option>
        <option value="5">5</option>
        <option value="6">6</option>
      </select>
    </label>`;
  ui.panelHead.appendChild(controls);
  document.getElementById('treeViewMode').addEventListener('change', (event) => { state.mode = event.target.value; renderEnhancedTree(); });
  document.getElementById('generationDepth').addEventListener('change', (event) => { state.depth = Number(event.target.value) || 4; renderEnhancedTree(); });
}

function ensureNicknameContributionOption() {
  if (!ui.contributionType || [...ui.contributionType.options].some((option) => option.value === 'nickname')) return;
  const option = document.createElement('option');
  option.value = 'nickname';
  option.textContent = 'Nickname / known as';
  const correction = [...ui.contributionType.options].find((item) => item.value === 'correction');
  ui.contributionType.insertBefore(option, correction || ui.contributionType.firstChild);
}

function rewriteCentreOptions() {
  if (!state.loaded || !ui.centreSelect) return;
  [...ui.centreSelect.options].forEach((option) => {
    const person = getPerson(option.value);
    if (person) option.textContent = selectorName(person);
  });
}

async function loadData() {
  const [peopleResult, relationshipsResult] = await Promise.all([
    supabase.from('people').select('id, slug, given_names, preferred_name, preferred_name_status, surname, gender, birth_date, death_date, birth_place, death_place, occupation_summary, narrative_summary, source_status'),
    supabase.from('relationships').select('*'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationshipsResult.error) throw relationshipsResult.error;
  state.people = peopleResult.data || [];
  state.relationships = relationshipsResult.data || [];
  state.peopleById = new Map(state.people.map((person) => [person.id, person]));
  state.loaded = true;
  rewriteCentreOptions();
}

async function activateIfSignedIn(session) {
  if (!session) return;
  try {
    ensureControls();
    ensureNicknameContributionOption();
    await loadData();
    setTimeout(() => { rewriteCentreOptions(); renderEnhancedTree(); }, 120);
  } catch {
    // The base app will show its own auth/data error. This enhancement remains non-destructive.
  }
}

ui.centreSelect?.addEventListener('change', () => setTimeout(() => { rewriteCentreOptions(); renderEnhancedTree(); }, 0));
ui.centreMe?.addEventListener('click', () => setTimeout(() => { rewriteCentreOptions(); renderEnhancedTree(); }, 40));

if (ui.centreSelect) {
  const observer = new MutationObserver(() => {
    if (!state.loaded) return;
    rewriteCentreOptions();
  });
  observer.observe(ui.centreSelect, { childList: true });
}

document.addEventListener('genealogy:known-as-updated', async () => {
  try { await loadData(); renderEnhancedTree(); } catch { /* ignore */ }
});

ensureControls();
ensureNicknameContributionOption();
supabase.auth.onAuthStateChange((_event, session) => activateIfSignedIn(session));
const { data: { session } } = await supabase.auth.getSession();
await activateIfSignedIn(session);
