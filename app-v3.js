import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const REGISTRATION_KEY = 'genealogyRegistrationDraft';
const FRONTIER_KEY = 'genealogyShowResearchFrontier';
const RENDER_DEPTH_CAP = 6;
const LOAD_TIMEOUT_MS = 18000;
const SOURCE_RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };
const PALETTE = ['#e7bea0', '#b8d5de', '#cbd6a6', '#d2c2df'];

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);

const ui = {
  authCard: $('authCard'),
  registrationCard: $('registrationCard'),
  appArea: $('appArea'),
  completeRegistrationForm: $('completeRegistrationForm'),
  authMessage: $('authMessage'),
  registrationMessage: $('registrationMessage'),
  registrationFormWrap: $('registrationFormWrap'),
  registrationPending: $('registrationPending'),
  pendingName: $('pendingName'),
  pendingSummary: $('pendingSummary'),
  signOut: $('signOut'),
  centreMe: $('centreMe'),
  centreSelect: $('centreSelect'),
  treeCanvas: $('treeCanvas'),
  treeStatus: $('treeStatus'),
  personName: $('personName'),
  personDetails: $('personDetails'),
  contributionForm: $('contributionForm'),
  contributionMessage: $('contributionMessage'),
  panelHead: document.querySelector('.tree-panel .panel-head'),
  viewTitle: $('viewTitle'),
  viewSummary: $('viewSummary'),
};

const state = {
  session: null,
  profile: null,
  accessRequest: null,
  people: [],
  relationships: [],
  frontier: [],
  peopleById: new Map(),
  parentEdgesByChild: new Map(),
  childIdsByParent: new Map(),
  partnerEdgesByPerson: new Map(),
  directSiblingIdsByPerson: new Map(),
  selectedId: null,
  centreId: null,
  mode: 'family',
  depthMode: 'auto',
  loaded: false,
};

let routeScheduledFor = null;
let routeInFlightFor = null;
let routeCompleteFor = null;
let archiveLoadPromise = null;
let renderFrame = null;

function setMessage(el, text = '', type = '') {
  if (!el) return;
  el.textContent = text;
  el.className = `message${type ? ` ${type}` : ''}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T00:00:00`));
}

function canonicalName(person) {
  if (!person) return 'Unknown';
  return [person.given_names?.trim(), person.surname?.trim()].filter(Boolean).join(' ') || 'Unknown';
}

function firstName(person) {
  if (!person) return 'Unknown';
  const first = String(person.given_names || '').trim().split(/\s+/)[0] || '';
  return [first, person.surname?.trim()].filter(Boolean).join(' ') || canonicalName(person);
}

function preferredName(person) {
  const value = person?.preferred_name?.trim();
  const status = person?.preferred_name_status || 'unresolved';
  if (!value || !['documented', 'strong', 'family_supplied'].includes(status)) return '';
  const first = String(person?.given_names || '').trim().split(/\s+/)[0] || '';
  return value.toLowerCase() === first.toLowerCase() ? '' : value;
}

function years(person) {
  const birth = person?.birth_date?.slice(0, 4) || '';
  const death = person?.death_date?.slice(0, 4) || '';
  if (birth && death) return `${birth}-${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return '';
}

function sourceLabel(value) {
  return String(value || 'unresolved').replaceAll('_', ' ');
}

function withTimeout(promise, label, ms = LOAD_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function readRegistrationDraft() {
  try {
    const raw = localStorage.getItem(REGISTRATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearRegistrationDraft() {
  localStorage.removeItem(REGISTRATION_KEY);
}

function registrationName(data) {
  return [data.first_name, data.middle_names, data.last_name]
    .map((value) => String(value || '').trim()).filter(Boolean).join(' ');
}

function registrationFromForm() {
  return {
    first_name: $('completeFirstName').value.trim(),
    middle_names: $('completeMiddleNames').value.trim(),
    last_name: $('completeLastName').value.trim(),
    birth_date: $('completeBirthDate').value || null,
    email_updates_opt_in: $('completeUpdates').checked,
    email: state.session?.user?.email || '',
  };
}

function hideAllMainAreas() {
  ui.authCard?.classList.add('hidden');
  ui.registrationCard?.classList.add('hidden');
  ui.appArea?.classList.add('hidden');
}

function showSignedOut() {
  hideAllMainAreas();
  ui.authCard?.classList.remove('hidden');
  ui.signOut?.classList.add('hidden');
  ui.centreMe?.classList.add('hidden');
}

function showCompletionForm() {
  hideAllMainAreas();
  ui.registrationCard?.classList.remove('hidden');
  ui.registrationFormWrap?.classList.remove('hidden');
  ui.registrationPending?.classList.add('hidden');
  if ($('completeEmail')) $('completeEmail').value = state.session?.user?.email || '';
  setMessage(ui.registrationMessage, 'Your email is verified. Complete these details so the family editor can identify you.');
}

function showPendingRequest(request) {
  hideAllMainAreas();
  ui.registrationCard?.classList.remove('hidden');
  ui.registrationFormWrap?.classList.add('hidden');
  ui.registrationPending?.classList.remove('hidden');
  if (ui.pendingName) ui.pendingName.textContent = request.display_name || 'Family member';
  const dob = request.birth_date ? ` Date of birth supplied: ${formatDate(request.birth_date)}.` : '';
  const updates = request.email_updates_opt_in ? ' You have opted in to relevant family-tree email updates.' : '';
  if (ui.pendingSummary) ui.pendingSummary.textContent = `Your verified email is ${request.email}. Your access request is waiting for the family editor to link you to the correct person in the tree.${dob}${updates}`;
  setMessage(ui.registrationMessage, 'Registration received. You will be able to enter the archive once approved.', 'success');
}

function showAccountLoadError(error) {
  hideAllMainAreas();
  ui.authCard?.classList.remove('hidden');
  ui.signOut?.classList.remove('hidden');
  setMessage(ui.authMessage, `You are signed in, but the family access check could not finish: ${error?.message || 'unknown error'}. Refresh the page to retry.`, 'error');
}

async function loadProfile() {
  const query = supabase.from('app_users')
    .select('user_id, person_id, display_name, role, status')
    .eq('user_id', state.session.user.id)
    .maybeSingle();
  const { data, error } = await withTimeout(query, 'Family access check');
  if (error) throw error;
  state.profile = data;
  return data;
}

async function loadAccessRequest() {
  const query = supabase.from('access_requests')
    .select('id, user_id, display_name, email, first_name, middle_names, last_name, birth_date, email_updates_opt_in, status, created_at')
    .eq('user_id', state.session.user.id)
    .maybeSingle();
  const { data, error } = await withTimeout(query, 'Registration check');
  if (error) throw error;
  state.accessRequest = data;
  return data;
}

async function submitAccessRequest(draft) {
  const payload = {
    user_id: state.session.user.id,
    display_name: registrationName(draft),
    email: state.session.user.email,
    first_name: draft.first_name,
    middle_names: draft.middle_names || null,
    last_name: draft.last_name,
    birth_date: draft.birth_date || null,
    email_updates_opt_in: Boolean(draft.email_updates_opt_in),
    status: 'pending',
  };
  const query = supabase.from('access_requests')
    .upsert(payload, { onConflict: 'user_id' })
    .select('id, user_id, display_name, email, first_name, middle_names, last_name, birth_date, email_updates_opt_in, status, created_at')
    .single();
  const { data, error } = await withTimeout(query, 'Registration submission');
  if (error) throw error;
  state.accessRequest = data;
  clearRegistrationDraft();
  return data;
}

function addMapEntry(map, key, value) {
  const list = map.get(key) || [];
  list.push(value);
  map.set(key, list);
}

function rebuildIndexes() {
  state.peopleById = new Map(state.people.map((person) => [person.id, person]));
  state.parentEdgesByChild = new Map();
  state.childIdsByParent = new Map();
  state.partnerEdgesByPerson = new Map();
  state.directSiblingIdsByPerson = new Map();

  state.relationships.forEach((relationship) => {
    if (relationship?.is_active === false) return;
    const type = relationship.relationship_type;
    if (type === 'parent') {
      addMapEntry(state.parentEdgesByChild, relationship.person2_id, relationship);
      addMapEntry(state.childIdsByParent, relationship.person1_id, relationship.person2_id);
    } else if (['spouse', 'partner', 'former_spouse'].includes(type)) {
      addMapEntry(state.partnerEdgesByPerson, relationship.person1_id, relationship);
      addMapEntry(state.partnerEdgesByPerson, relationship.person2_id, relationship);
    } else if (type === 'sibling') {
      addMapEntry(state.directSiblingIdsByPerson, relationship.person1_id, relationship.person2_id);
      addMapEntry(state.directSiblingIdsByPerson, relationship.person2_id, relationship.person1_id);
    }
  });
}

function person(id) {
  return state.peopleById.get(id) || null;
}

function parentEdgesOf(personId) {
  return (state.parentEdgesByChild.get(personId) || [])
    .map((relationship) => ({ relationship, person: person(relationship.person1_id) }))
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
  return [...new Set(state.childIdsByParent.get(personId) || [])]
    .map(person).filter(Boolean)
    .sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999'));
}

function partnerEdgesOf(personId) {
  return (state.partnerEdgesByPerson.get(personId) || [])
    .map((relationship) => ({
      relationship,
      person: person(relationship.person1_id === personId ? relationship.person2_id : relationship.person1_id),
    }))
    .filter((entry) => entry.person);
}

function currentPartnerOf(personId) {
  const edges = partnerEdgesOf(personId);
  return edges.find(({ relationship }) => relationship.relationship_status === 'current' && relationship.relationship_type !== 'former_spouse')?.person
    || edges.find(({ relationship }) => relationship.relationship_status === 'ended_by_death' && ['spouse', 'partner'].includes(relationship.relationship_type))?.person
    || null;
}

function siblingsOf(personId) {
  const ids = new Set(state.directSiblingIdsByPerson.get(personId) || []);
  parentEdgesOf(personId).forEach(({ person: parent }) => {
    (state.childIdsByParent.get(parent.id) || []).forEach((childId) => {
      if (childId !== personId) ids.add(childId);
    });
  });
  return [...ids].map(person).filter(Boolean).sort((a, b) => canonicalName(a).localeCompare(canonicalName(b)));
}

function coupleChildren(a, b) {
  if (!b) return childrenOf(a.id);
  const left = new Set(childrenOf(a.id).map((child) => child.id));
  const right = new Set(childrenOf(b.id).map((child) => child.id));
  const shared = [...left].filter((id) => right.has(id)).map(person).filter(Boolean);
  if (shared.length) return shared.sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
  return [...new Set([...left, ...right])].map(person).filter(Boolean)
    .sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
}

async function loadFamilyData(force = false) {
  if (archiveLoadPromise && !force) return archiveLoadPromise;

  archiveLoadPromise = (async () => {
    const requests = Promise.all([
      supabase.from('people').select('id,slug,given_names,preferred_name,preferred_name_status,surname,gender,birth_date,death_date,birth_place,death_place,occupation_summary,narrative_summary,source_status,is_active').order('surname').order('given_names'),
      supabase.from('relationships').select('*'),
      supabase.from('research_frontier_candidates').select('id,anchor_person_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active').eq('is_active', true).order('priority'),
    ]);
    const [peopleResult, relationshipsResult, frontierResult] = await withTimeout(requests, 'Family archive');
    if (peopleResult.error) throw peopleResult.error;
    if (relationshipsResult.error) throw relationshipsResult.error;

    state.people = (peopleResult.data || []).filter((item) => item.is_active !== false);
    state.relationships = (relationshipsResult.data || []).filter((item) => item.is_active !== false);
    state.frontier = frontierResult.error ? [] : (frontierResult.data || []);
    state.loaded = true;
    rebuildIndexes();
  })();

  try {
    await archiveLoadPromise;
  } finally {
    archiveLoadPromise = null;
  }
}

function ensureControls() {
  if (!ui.panelHead || $('treeViewMode')) return;
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
      <select id="generationDepth"><option value="auto">Auto</option></select>
    </label>`;
  ui.panelHead.appendChild(controls);
  $('treeViewMode').addEventListener('change', (event) => {
    state.mode = event.target.value;
    scheduleRender();
  });
  $('generationDepth').addEventListener('change', (event) => {
    state.depthMode = event.target.value;
    scheduleRender();
  });
}

function populateCentreSelect() {
  if (!ui.centreSelect) return;
  const previous = state.centreId || ui.centreSelect.value;
  ui.centreSelect.replaceChildren();
  [...state.people].sort((a, b) => canonicalName(a).localeCompare(canonicalName(b))).forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${canonicalName(item)}${years(item) ? ` (${years(item)})` : ''}`;
    ui.centreSelect.appendChild(option);
  });

  if (previous && person(previous)) state.centreId = previous;
  else if (state.profile?.person_id && person(state.profile.person_id)) state.centreId = state.profile.person_id;
  else state.centreId = state.people.find((item) => item.slug === 'werner')?.id || state.people[0]?.id || null;

  if (state.centreId) ui.centreSelect.value = state.centreId;
}

function researchDepth(roots) {
  let max = 1;
  const depthById = new Map();
  function walk(id, depth, path) {
    if (!id || depth >= 12 || path.has(id)) return;
    depthById.set(id, Math.max(depthById.get(id) ?? -1, depth));
    max = Math.max(max, depth + 1);
    const nextPath = new Set(path);
    nextPath.add(id);
    parentEdgesOf(id).forEach(({ person: parent }) => walk(parent.id, depth + 1, nextPath));
  }
  roots.filter(Boolean).forEach((root) => walk(root.id, 0, new Set()));
  state.frontier.forEach((candidate) => {
    if (candidate.is_active === false) return;
    const depth = depthById.get(candidate.anchor_person_id);
    if (depth !== undefined) max = Math.max(max, depth + 2);
  });
  return max;
}

function refreshDepthControl(researchMax) {
  const select = $('generationDepth');
  if (!select) return;
  const safeMax = Math.min(researchMax, RENDER_DEPTH_CAP);
  const wanted = state.depthMode;
  select.replaceChildren();
  const auto = document.createElement('option');
  auto.value = 'auto';
  auto.textContent = researchMax > safeMax ? `Auto (${safeMax} of ${researchMax})` : `Auto (${safeMax})`;
  select.appendChild(auto);
  for (let depth = 1; depth <= safeMax; depth += 1) {
    const option = document.createElement('option');
    option.value = String(depth);
    option.textContent = String(depth);
    select.appendChild(option);
  }
  if (wanted !== 'auto' && Number(wanted) > safeMax) state.depthMode = String(safeMax);
  select.value = [...select.options].some((option) => option.value === state.depthMode) ? state.depthMode : 'auto';
}

function levelsFor(a, b, depth) {
  const levels = [];
  let current = b ? [...parentPairOf(a.id), ...parentPairOf(b.id)] : parentPairOf(a.id);
  levels.push(current);
  for (let generation = 1; generation < depth; generation += 1) {
    const next = [];
    current.forEach((entry) => {
      if (!entry?.person) { next.push(null, null); return; }
      next.push(...parentPairOf(entry.person.id));
    });
    levels.push(next);
    current = next;
  }
  return levels;
}

function frontierMap(a, b, levels, depth) {
  const output = new Map();
  if (localStorage.getItem(FRONTIER_KEY) !== '1') return output;
  const positions = new Map();
  const addPosition = (id, position) => {
    if (!id) return;
    const list = positions.get(id) || [];
    list.push(position);
    positions.set(id, list);
  };
  addPosition(a.id, { level: -1, base: 0 });
  if (b) addPosition(b.id, { level: -1, base: 2 });
  levels.forEach((entries, level) => entries.forEach((entry, slot) => {
    if (entry?.person) addPosition(entry.person.id, { level, slot });
  }));
  state.frontier.forEach((candidate) => {
    if (candidate.is_active === false) return;
    const side = candidate.parent_slot === 'mother' ? 1 : 0;
    (positions.get(candidate.anchor_person_id) || []).forEach((position) => {
      const level = position.level + 1;
      if (level < 0 || level >= depth) return;
      const slot = position.level === -1 ? position.base + side : position.slot * 2 + side;
      if (levels[level]?.[slot]?.person) return;
      const key = `${level}:${slot}`;
      const list = output.get(key) || [];
      list.push(candidate);
      output.set(key, list);
    });
  });
  output.forEach((items) => items.sort((aItem, bItem) => (aItem.priority ?? 100) - (bItem.priority ?? 100)));
  return output;
}

function polar(radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return [600 + radius * Math.cos(radians), 600 + radius * Math.sin(radians)];
}

function sectorPath(innerRadius, outerRadius, startAngle, endAngle) {
  const p1 = polar(outerRadius, startAngle);
  const p2 = polar(outerRadius, endAngle);
  const p3 = polar(innerRadius, endAngle);
  const p4 = polar(innerRadius, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${p1[0]} ${p1[1]} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`;
}

function readableRotation(angle) {
  return angle > 90 && angle < 270 ? angle + 180 : angle;
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

function branchIndex(slot, level, familyMode) {
  const rootBranches = familyMode ? 4 : 2;
  const slotsAtLevel = rootBranches * (2 ** level);
  return Math.min(rootBranches - 1, Math.floor(slot / (slotsAtLevel / rootBranches)));
}

function addText(group, ns, value, y, className, fontSize) {
  const node = document.createElementNS(ns, 'text');
  node.setAttribute('x', '0');
  node.setAttribute('y', String(y));
  node.setAttribute('class', className);
  if (fontSize) node.setAttribute('font-size', String(fontSize));
  node.textContent = value;
  group.appendChild(node);
}

function renderDetails(item) {
  if (!item || !ui.personName || !ui.personDetails) return;
  state.selectedId = item.id;
  ui.personName.textContent = canonicalName(item);
  const rows = [];
  if (preferredName(item)) rows.push(['Known as', preferredName(item)]);
  const life = [formatDate(item.birth_date), formatDate(item.death_date)].filter(Boolean).join(' - ');
  if (life) rows.push(['Life', life]);
  if (item.birth_place) rows.push(['Birthplace', item.birth_place]);
  if (item.death_place) rows.push(['Death place', item.death_place]);
  if (item.occupation_summary) rows.push(['Occupation', item.occupation_summary]);
  partnerEdgesOf(item.id).forEach(({ person: partner, relationship }) => {
    const label = relationship.relationship_type === 'former_spouse' || relationship.relationship_status === 'ended'
      ? 'Former spouse' : relationship.relationship_type === 'partner' ? 'Partner' : 'Spouse';
    rows.push([label, `${canonicalName(partner)}${relationship.date_note ? ` - ${relationship.date_note}` : ''}`]);
  });
  rows.push(['Source status', sourceLabel(item.source_status)]);
  if (item.narrative_summary) rows.push(['Family note', item.narrative_summary]);
  const children = childrenOf(item.id);
  if (children.length) rows.push(['Children', children.map(canonicalName).join(', ')]);
  const siblings = siblingsOf(item.id);
  if (siblings.length) rows.push(['Siblings', siblings.map(canonicalName).join(', ')]);
  ui.personDetails.innerHTML = rows.map(([label, value]) => `<div class="detail-line"><strong>${esc(label)}</strong>${esc(value)}</div>`).join('');
}

function renderWedge(ns, entry, frontierItems, slot, level, innerRadius, outerRadius, startAngle, endAngle, familyMode) {
  const item = entry?.person || null;
  const candidate = !item && frontierItems?.length ? frontierItems[0] : null;
  const group = document.createElementNS(ns, 'g');
  const path = document.createElementNS(ns, 'path');
  group.dataset.fanLevel = String(level);
  group.dataset.fanSlot = String(slot);
  path.setAttribute('d', sectorPath(innerRadius, outerRadius, startAngle, endAngle));
  path.setAttribute('stroke', '#8c8175');
  path.setAttribute('stroke-width', '1.05');

  if (item) {
    path.setAttribute('fill', PALETTE[branchIndex(slot, level, familyMode) % PALETTE.length]);
    evidenceStyle(path, entry.relationship?.source_status || item.source_status);
    group.classList.add('person-node');
    group.dataset.personId = item.id;
    group.setAttribute('aria-label', canonicalName(item));
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
  } else if (candidate) {
    path.setAttribute('fill', '#b8b8b8');
    path.setAttribute('fill-opacity', '.72');
    path.setAttribute('stroke', '#666');
    path.setAttribute('stroke-width', '1.4');
    path.setAttribute('stroke-dasharray', '4 3');
    group.classList.add('research-frontier-node');
    const title = document.createElementNS(ns, 'title');
    title.textContent = [candidate.label, candidate.year_text, candidate.detail, candidate.evidence_note].filter(Boolean).join(' - ');
    group.appendChild(title);
  } else {
    path.setAttribute('fill', '#e8e3dc');
    path.setAttribute('fill-opacity', '.25');
    path.setAttribute('stroke-dasharray', '5 4');
  }
  group.appendChild(path);

  const mid = (startAngle + endAngle) / 2;
  const [x, y] = polar((innerRadius + outerRadius) / 2, mid);
  const textGroup = document.createElementNS(ns, 'g');
  textGroup.setAttribute('transform', `translate(${x} ${y}) rotate(${readableRotation(mid)})`);
  const count = (familyMode ? 4 : 2) * (2 ** level);
  const size = count >= 128 ? 6.2 : count >= 64 ? 7.2 : count >= 32 ? 8 : count >= 16 ? 9 : 10.5;
  if (item) {
    addText(textGroup, ns, firstName(item), -2, 'fan-label enhanced-fan-label', size);
    if (years(item)) addText(textGroup, ns, years(item), 11, 'fan-date enhanced-fan-date', Math.max(4.8, size - 2));
  } else if (candidate && count <= 128) {
    addText(textGroup, ns, candidate.label || 'Research lead', -3, 'fan-label enhanced-fan-label frontier-fan-label', Math.max(5.6, size));
    addText(textGroup, ns, [candidate.year_text, frontierItems.length > 1 ? `+${frontierItems.length - 1} alternate` : 'FRONTIER'].filter(Boolean).join(' | '), 10, 'fan-date enhanced-fan-date frontier-fan-date', Math.max(4.8, size - 1.5));
  } else if (!candidate && count <= 128) {
    addText(textGroup, ns, '?', -2, 'fan-label enhanced-fan-label', size);
  }
  group.appendChild(textGroup);

  if (item) {
    const activate = () => renderDetails(item);
    group.addEventListener('click', activate);
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    });
  }
  return group;
}

function renderFamilyCentre(svg, ns, a, b) {
  const disc = document.createElementNS(ns, 'circle');
  disc.setAttribute('cx', '600');
  disc.setAttribute('cy', '600');
  disc.setAttribute('r', '160');
  disc.setAttribute('class', 'family-centre-disc');
  svg.appendChild(disc);

  [a, b].filter(Boolean).forEach((item, index) => {
    const x = b ? (index ? 685 : 515) : 600;
    const y = b ? 555 : 570;
    const group = document.createElementNS(ns, 'g');
    group.classList.add('family-centre-person');
    group.dataset.personId = item.id;
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(x - 75));
    rect.setAttribute('y', String(y - 27));
    rect.setAttribute('width', '150');
    rect.setAttribute('height', '54');
    rect.setAttribute('rx', '14');
    rect.setAttribute('class', 'family-centre-card');
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y + 2));
    text.setAttribute('class', 'family-centre-name');
    text.textContent = firstName(item);
    group.append(rect, text);
    group.addEventListener('click', () => renderDetails(item));
    svg.appendChild(group);
  });

  if (b) {
    const link = document.createElementNS(ns, 'line');
    link.setAttribute('x1', '590');
    link.setAttribute('y1', '555');
    link.setAttribute('x2', '610');
    link.setAttribute('y2', '555');
    link.setAttribute('class', 'family-couple-link');
    svg.appendChild(link);
  }

  const children = coupleChildren(a, b);
  const width = Math.min(270, Math.max(170, children.length * 58));
  children.forEach((child, index) => {
    const x = children.length === 1 ? 600 : 600 - width / 2 + width * index / Math.max(1, children.length - 1);
    const group = document.createElementNS(ns, 'g');
    group.classList.add('family-child-node');
    group.dataset.personId = child.id;
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', '668');
    circle.setAttribute('r', '23');
    circle.setAttribute('class', 'family-child-circle');
    const initial = document.createElementNS(ns, 'text');
    initial.setAttribute('x', String(x));
    initial.setAttribute('y', '672');
    initial.setAttribute('class', 'family-child-initial');
    initial.textContent = String(child.given_names || '?')[0];
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(x));
    label.setAttribute('y', '708');
    label.setAttribute('class', 'family-child-label');
    label.textContent = firstName(child);
    group.append(circle, initial, label);
    group.addEventListener('click', () => renderDetails(child));
    svg.appendChild(group);
  });
}

function renderSingleCentre(svg, ns, item) {
  const group = document.createElementNS(ns, 'g');
  group.classList.add('person-node');
  group.dataset.personId = item.id;
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '600');
  circle.setAttribute('cy', '600');
  circle.setAttribute('r', '105');
  circle.setAttribute('class', 'centre-card');
  const name = document.createElementNS(ns, 'text');
  name.setAttribute('x', '600');
  name.setAttribute('y', '600');
  name.setAttribute('class', 'centre-name');
  name.textContent = canonicalName(item);
  group.append(circle, name);
  group.addEventListener('click', () => renderDetails(item));
  svg.appendChild(group);
}

function renderTree() {
  renderFrame = null;
  if (!state.loaded || !state.centreId || !ui.treeCanvas) return;
  ensureControls();
  const a = person(state.centreId);
  if (!a) return;
  const b = state.mode === 'family' ? currentPartnerOf(a.id) : null;
  const familyMode = Boolean(b && state.mode === 'family');
  const researchMax = researchDepth([a, b].filter(Boolean));
  const safeMax = Math.min(researchMax, RENDER_DEPTH_CAP);
  refreshDepthControl(researchMax);
  const depth = state.depthMode === 'auto' ? safeMax : Math.max(1, Math.min(safeMax, Number(state.depthMode) || safeMax));
  const levels = levelsFor(a, familyMode ? b : null, depth);
  const frontiers = frontierMap(a, familyMode ? b : null, levels, depth);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 1200 1200');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', familyMode ? `Family fan for ${canonicalName(a)} and ${canonicalName(b)}` : `Ancestor fan centred on ${canonicalName(a)}`);

  const inner = familyMode ? 180 : 125;
  const gap = 2;
  const thickness = (575 - inner - gap * (depth - 1)) / depth;
  levels.forEach((entries, level) => {
    const step = 360 / entries.length;
    const innerRadius = inner + level * (thickness + gap);
    const outerRadius = innerRadius + thickness;
    entries.forEach((entry, slot) => {
      svg.appendChild(renderWedge(ns, entry, frontiers.get(`${level}:${slot}`) || [], slot, level, innerRadius, outerRadius, slot * step, (slot + 1) * step, familyMode));
    });
  });

  if (familyMode) renderFamilyCentre(svg, ns, a, b);
  else renderSingleCentre(svg, ns, a);
  ui.treeCanvas.replaceChildren(svg);

  if (ui.viewTitle) ui.viewTitle.textContent = familyMode ? `${firstName(a)} & ${firstName(b)}` : canonicalName(a);
  if (ui.viewSummary) ui.viewSummary.textContent = researchMax > RENDER_DEPTH_CAP
    ? `Research reaches ${researchMax} generations. For responsiveness this view renders ${RENDER_DEPTH_CAP} at a time; re-centre an older ancestor to explore further.`
    : `Generation depth follows the deepest recorded or active research-frontier ancestry (${researchMax} generations).`;
  setMessage(ui.treeStatus, `${state.people.length} people loaded. Showing ${depth} of ${researchMax} research-depth generations.`, 'success');
  renderDetails(a);
}

function scheduleRender() {
  if (renderFrame !== null) cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(renderTree);
}

function showArchiveLoadError(error) {
  state.loaded = false;
  setMessage(ui.treeStatus, `The family archive did not finish loading: ${error?.message || 'unknown error'}`, 'error');
  if (ui.treeCanvas) {
    const host = document.createElement('div');
    host.className = 'empty-state fan-load-error';
    const text = document.createElement('p');
    text.textContent = 'The family data could not be loaded. This is usually temporary.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary';
    button.textContent = 'Try loading again';
    button.addEventListener('click', () => enterArchive(true));
    host.append(text, button);
    ui.treeCanvas.replaceChildren(host);
  }
}

async function enterArchive(force = false) {
  hideAllMainAreas();
  ui.appArea?.classList.remove('hidden');
  ui.signOut?.classList.remove('hidden');
  if (state.profile?.person_id) ui.centreMe?.classList.remove('hidden');
  ensureControls();
  setMessage(ui.treeStatus, 'Loading family archive...');
  if (ui.treeCanvas) ui.treeCanvas.replaceChildren();
  try {
    await loadFamilyData(force);
    populateCentreSelect();
    scheduleRender();
    document.dispatchEvent(new CustomEvent('genealogy:archive-ready', {
      detail: { peopleCount: state.people.length, relationshipCount: state.relationships.length },
    }));
  } catch (error) {
    showArchiveLoadError(error);
  }
}

async function routeAuthenticatedUser() {
  try {
    const profile = await loadProfile();
    if (profile?.status === 'approved') {
      clearRegistrationDraft();
      await enterArchive();
      return;
    }

    const existingRequest = await loadAccessRequest();
    if (existingRequest) {
      showPendingRequest(existingRequest);
      return;
    }

    const draft = readRegistrationDraft();
    if (draft && draft.email?.toLowerCase() === state.session.user.email?.toLowerCase()) {
      const request = await submitAccessRequest(draft);
      showPendingRequest(request);
      return;
    }

    showCompletionForm();
  } catch (error) {
    showAccountLoadError(error);
  }
}

function resetState() {
  state.profile = null;
  state.accessRequest = null;
  state.people = [];
  state.relationships = [];
  state.frontier = [];
  state.peopleById = new Map();
  state.parentEdgesByChild = new Map();
  state.childIdsByParent = new Map();
  state.partnerEdgesByPerson = new Map();
  state.directSiblingIdsByPerson = new Map();
  state.centreId = null;
  state.selectedId = null;
  state.loaded = false;
  routeScheduledFor = null;
  routeInFlightFor = null;
  routeCompleteFor = null;
}

function scheduleAuthenticatedRoute(session) {
  const userId = session?.user?.id;
  if (!userId) return;
  if (routeScheduledFor === userId || routeInFlightFor === userId || routeCompleteFor === userId) return;
  routeScheduledFor = userId;

  // Supabase currently warns against making async API calls directly inside
  // onAuthStateChange. Deferring the work lets the auth callback return first.
  window.setTimeout(async () => {
    if (state.session?.user?.id !== userId) {
      if (routeScheduledFor === userId) routeScheduledFor = null;
      return;
    }
    routeScheduledFor = null;
    routeInFlightFor = userId;
    try {
      await routeAuthenticatedUser();
      if (state.session?.user?.id === userId) routeCompleteFor = userId;
    } finally {
      if (routeInFlightFor === userId) routeInFlightFor = null;
    }
  }, 0);
}

ui.completeRegistrationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.session) return;
  const draft = registrationFromForm();
  setMessage(ui.registrationMessage, 'Submitting your family access request...');
  try {
    const request = await submitAccessRequest(draft);
    showPendingRequest(request);
  } catch (error) {
    setMessage(ui.registrationMessage, error?.message || 'Unable to submit registration.', 'error');
  }
});

ui.signOut?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  resetState();
  showSignedOut();
});

ui.centreSelect?.addEventListener('change', () => {
  state.centreId = ui.centreSelect.value;
  renderDetails(person(state.centreId));
  scheduleRender();
});

ui.centreMe?.addEventListener('click', () => {
  if (!state.profile?.person_id || !person(state.profile.person_id)) return;
  state.centreId = state.profile.person_id;
  ui.centreSelect.value = state.centreId;
  renderDetails(person(state.centreId));
  scheduleRender();
});

ui.contributionForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.session || state.profile?.status !== 'approved') {
    setMessage(ui.contributionMessage, 'Your family access must be approved before you can submit information.', 'error');
    return;
  }
  const payload = {
    submitted_by: state.session.user.id,
    target_person_id: state.selectedId || state.centreId || null,
    contribution_type: $('contributionType').value,
    original_language: $('language').value.trim() || 'en',
    narrative_text: $('contributionText').value.trim(),
  };
  try {
    const { error } = await withTimeout(supabase.from('contributions').insert(payload), 'Contribution submission');
    if (error) throw error;
    ui.contributionForm.reset();
    $('language').value = 'en';
    setMessage(ui.contributionMessage, 'Thank you. Your information has been saved for review.', 'success');
  } catch (error) {
    setMessage(ui.contributionMessage, error?.message || 'Unable to save this contribution.', 'error');
  }
});

document.addEventListener('genealogy:research-frontier-changed', () => {
  if (state.loaded) scheduleRender();
});

document.addEventListener('genealogy:tree-suggestions-updated', async () => {
  if (!state.session || state.profile?.status !== 'approved') return;
  try {
    setMessage(ui.treeStatus, 'Refreshing family archive...');
    await loadFamilyData(true);
    populateCentreSelect();
    scheduleRender();
  } catch (error) {
    showArchiveLoadError(error);
  }
});

// Keep this callback synchronous. Any Supabase queries are deliberately deferred
// through scheduleAuthenticatedRoute so the auth client's internal lock is released.
supabase.auth.onAuthStateChange((_event, session) => {
  state.session = session;
  if (session) {
    scheduleAuthenticatedRoute(session);
  } else {
    resetState();
    showSignedOut();
  }
});

const { data: { session: initialSession } } = await supabase.auth.getSession();
state.session = initialSession;
if (initialSession) scheduleAuthenticatedRoute(initialSession);
else showSignedOut();
