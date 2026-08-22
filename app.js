import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  session: null,
  profile: null,
  people: [],
  relationships: [],
  selectedId: null,
  centreId: null,
};

const $ = (id) => document.getElementById(id);
const authCard = $('authCard');
const appArea = $('appArea');
const loginForm = $('loginForm');
const authMessage = $('authMessage');
const signOutButton = $('signOut');
const centreMeButton = $('centreMe');
const centreSelect = $('centreSelect');
const treeCanvas = $('treeCanvas');
const treeStatus = $('treeStatus');
const personName = $('personName');
const personDetails = $('personDetails');
const contributionForm = $('contributionForm');
const contributionMessage = $('contributionMessage');

function setMessage(el, text = '', type = '') {
  el.textContent = text;
  el.className = `message${type ? ` ${type}` : ''}`;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function displayName(person) {
  if (!person) return 'Unknown';
  const preferred = person.preferred_name?.trim();
  const given = person.given_names?.trim() || '';
  const surname = person.surname?.trim() || '';
  return [preferred || given, surname].filter(Boolean).join(' ');
}

function lifeText(person) {
  if (!person) return '';
  const birth = formatDate(person.birth_date);
  const death = formatDate(person.death_date);
  if (birth && death) return `${birth} - ${death}`;
  if (birth) return `Born ${birth}`;
  if (death) return `Died ${death}`;
  return '';
}

async function requestMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.href.split('#')[0],
    },
  });
  if (error) throw error;
}

async function loadProfile() {
  const { data, error } = await supabase
    .from('app_users')
    .select('user_id, person_id, display_name, role, status')
    .eq('user_id', state.session.user.id)
    .maybeSingle();

  if (error) throw error;
  state.profile = data;
  return data;
}

async function loadFamilyData() {
  const [peopleResult, relationshipResult] = await Promise.all([
    supabase.from('people').select('*').order('surname').order('given_names'),
    supabase.from('relationships').select('*'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationshipResult.error) throw relationshipResult.error;
  state.people = peopleResult.data || [];
  state.relationships = relationshipResult.data || [];
}

function getPerson(id) {
  return state.people.find((p) => p.id === id) || null;
}

function parentsOf(personId) {
  return state.relationships
    .filter((r) => r.relationship_type === 'parent' && r.person2_id === personId)
    .map((r) => getPerson(r.person1_id))
    .filter(Boolean);
}

function childrenOf(personId) {
  return state.relationships
    .filter((r) => r.relationship_type === 'parent' && r.person1_id === personId)
    .map((r) => getPerson(r.person2_id))
    .filter(Boolean);
}

function partnersOf(personId) {
  return state.relationships
    .filter((r) => ['spouse', 'partner', 'former_spouse'].includes(r.relationship_type) && (r.person1_id === personId || r.person2_id === personId))
    .map((r) => ({
      relationship: r,
      person: getPerson(r.person1_id === personId ? r.person2_id : r.person1_id),
    }))
    .filter((x) => x.person);
}

function siblingsOf(personId) {
  const parentIds = new Set(parentsOf(personId).map((p) => p.id));
  if (!parentIds.size) return [];
  const siblingIds = new Set();
  state.relationships.forEach((r) => {
    if (r.relationship_type === 'parent' && parentIds.has(r.person1_id) && r.person2_id !== personId) siblingIds.add(r.person2_id);
  });
  return [...siblingIds].map(getPerson).filter(Boolean);
}

function ancestorLevels(centreId, depth = 4) {
  const levels = [];
  let current = [getPerson(centreId)].filter(Boolean);
  for (let i = 0; i < depth; i += 1) {
    const next = [];
    current.forEach((p) => parentsOf(p.id).forEach((parent) => next.push(parent)));
    levels.push(next);
    current = next;
  }
  return levels;
}

function polar(cx, cy, r, angle) {
  const t = (angle - 90) * Math.PI / 180;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
}

function sectorPath(cx, cy, r1, r2, a1, a2) {
  const p1 = polar(cx, cy, r2, a1);
  const p2 = polar(cx, cy, r2, a2);
  const p3 = polar(cx, cy, r1, a2);
  const p4 = polar(cx, cy, r1, a1);
  const large = (a2 - a1) > 180 ? 1 : 0;
  return `M ${p1[0]} ${p1[1]} A ${r2} ${r2} 0 ${large} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${r1} ${r1} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`;
}

function labelRotation(mid) {
  let rotation = mid;
  if (mid > 90 && mid < 270) rotation += 180;
  return rotation;
}

function branchColour(index) {
  return ['var(--schroeder)', 'var(--liebenberg)', 'var(--meyer)', 'var(--muller)'][index % 4];
}

function renderTree() {
  const centre = getPerson(state.centreId);
  if (!centre) {
    treeCanvas.innerHTML = '<div class="empty-state">No centre person is available yet. Once the family data migration is loaded, choose a person here and the fan will build itself from shared parent relationships.</div>';
    return;
  }

  const cx = 500;
  const cy = 500;
  const ringRadii = [[112, 190], [192, 280], [282, 375], [377, 470]];
  const levels = ancestorLevels(centre.id, 4);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Ancestor fan centred on ${displayName(centre)}`);

  levels.forEach((people, levelIndex) => {
    const slots = 2 ** (levelIndex + 1);
    const step = 360 / slots;
    for (let slot = 0; slot < slots; slot += 1) {
      const person = people[slot];
      const a1 = slot * step;
      const a2 = (slot + 1) * step;
      const [r1, r2] = ringRadii[levelIndex];
      const group = document.createElementNS(ns, 'g');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', sectorPath(cx, cy, r1, r2, a1, a2));
      path.setAttribute('fill', person ? branchColour(slot) : '#e8e3dc');
      path.setAttribute('fill-opacity', person ? '.86' : '.32');
      path.setAttribute('stroke', '#8c8175');
      path.setAttribute('stroke-width', '1.1');
      if (!person) path.setAttribute('stroke-dasharray', '5 4');
      group.appendChild(path);

      const mid = (a1 + a2) / 2;
      const rm = (r1 + r2) / 2;
      const [tx, ty] = polar(cx, cy, rm, mid);
      const wrap = document.createElementNS(ns, 'g');
      wrap.setAttribute('transform', `translate(${tx} ${ty}) rotate(${labelRotation(mid)})`);
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('class', 'fan-label');
      text.setAttribute('x', '0');
      text.setAttribute('y', '-5');
      text.textContent = person ? displayName(person) : '?';
      wrap.appendChild(text);
      if (person && (person.birth_date || person.death_date)) {
        const dates = document.createElementNS(ns, 'text');
        dates.setAttribute('class', 'fan-date');
        dates.setAttribute('x', '0');
        dates.setAttribute('y', '10');
        dates.textContent = [person.birth_date?.slice(0, 4), person.death_date?.slice(0, 4)].filter(Boolean).join(' - ');
        wrap.appendChild(dates);
      }
      group.appendChild(wrap);
      if (person) {
        group.classList.add('person-node');
        group.addEventListener('click', () => selectPerson(person.id));
      }
      svg.appendChild(group);
    }
  });

  const centreCard = document.createElementNS(ns, 'circle');
  centreCard.setAttribute('cx', cx);
  centreCard.setAttribute('cy', cy);
  centreCard.setAttribute('r', '104');
  centreCard.setAttribute('class', 'centre-card');
  svg.appendChild(centreCard);

  const centreName = document.createElementNS(ns, 'text');
  centreName.setAttribute('x', cx);
  centreName.setAttribute('y', cy - 6);
  centreName.setAttribute('class', 'centre-name');
  centreName.textContent = displayName(centre);
  svg.appendChild(centreName);

  const centreSub = document.createElementNS(ns, 'text');
  centreSub.setAttribute('x', cx);
  centreSub.setAttribute('y', cy + 18);
  centreSub.setAttribute('class', 'centre-sub');
  centreSub.textContent = lifeText(centre) || 'CENTRE PERSON';
  svg.appendChild(centreSub);

  treeCanvas.replaceChildren(svg);
  $('viewTitle').textContent = displayName(centre);
  $('viewSummary').textContent = 'The fan is generated from approved parent relationships in the shared database. Choose any person to recalculate the view.';
}

function renderPersonPanel(person) {
  if (!person) {
    personName.textContent = 'Choose a person';
    personDetails.innerHTML = '';
    return;
  }
  personName.textContent = displayName(person);
  const lines = [];
  if (lifeText(person)) lines.push(['Life', lifeText(person)]);
  if (person.birth_place) lines.push(['Birthplace', person.birth_place]);
  if (person.occupation_summary) lines.push(['Occupation', person.occupation_summary]);
  partnersOf(person.id).forEach(({ person: partner, relationship }) => {
    const label = relationship.relationship_type === 'former_spouse' ? 'Former spouse' : relationship.relationship_type === 'partner' ? 'Partner' : 'Spouse';
    const note = relationship.date_note ? ` (${relationship.date_note})` : '';
    lines.push([label, `${displayName(partner)}${note}`]);
  });
  if (person.source_status) lines.push(['Source status', person.source_status.replaceAll('_', ' ')]);
  if (person.narrative_summary) lines.push(['Story', person.narrative_summary]);
  const children = childrenOf(person.id);
  if (children.length) lines.push(['Children', children.map(displayName).join(', ')]);
  const siblings = siblingsOf(person.id);
  if (siblings.length) lines.push(['Siblings', siblings.map(displayName).join(', ')]);
  personDetails.innerHTML = lines.map(([label, value]) => `<div class="detail-line"><strong>${label}</strong>${value}</div>`).join('');
}

function selectPerson(id) {
  state.selectedId = id;
  renderPersonPanel(getPerson(id));
}

function populateCentreSelect() {
  centreSelect.innerHTML = '';
  state.people.forEach((person) => {
    const option = document.createElement('option');
    option.value = person.id;
    option.textContent = displayName(person);
    centreSelect.appendChild(option);
  });
  if (!state.centreId && state.profile?.person_id) state.centreId = state.profile.person_id;
  if (!state.centreId && state.people.length) state.centreId = state.people[0].id;
  if (state.centreId) centreSelect.value = state.centreId;
}

async function submitContribution(event) {
  event.preventDefault();
  if (!state.session || !state.profile || state.profile.status !== 'approved') {
    setMessage(contributionMessage, 'Your family access must be approved before you can submit information.', 'error');
    return;
  }
  const payload = {
    submitted_by: state.session.user.id,
    target_person_id: state.selectedId || state.centreId || null,
    contribution_type: $('contributionType').value,
    original_language: $('language').value.trim() || 'en',
    narrative_text: $('contributionText').value.trim(),
  };
  const { error } = await supabase.from('contributions').insert(payload);
  if (error) {
    setMessage(contributionMessage, error.message, 'error');
    return;
  }
  contributionForm.reset();
  $('language').value = 'en';
  setMessage(contributionMessage, 'Thank you. Your information has been saved for review.', 'success');
}

async function enterApp() {
  authCard.classList.add('hidden');
  appArea.classList.remove('hidden');
  signOutButton.classList.remove('hidden');
  setMessage(treeStatus, 'Loading family access...');
  try {
    const profile = await loadProfile();
    if (!profile || profile.status !== 'approved') {
      treeCanvas.innerHTML = '<div class="empty-state"><h2>Access awaiting approval</h2><p>Your sign-in works, but this account has not yet been linked to an approved family profile. Once approved, the shared family tree will appear here.</p></div>';
      setMessage(treeStatus, 'Your account is signed in but still awaiting family approval.');
      return;
    }
    await loadFamilyData();
    populateCentreSelect();
    renderTree();
    if (profile.person_id) centreMeButton.classList.remove('hidden');
    if (state.centreId) selectPerson(state.centreId);
    setMessage(treeStatus, `${state.people.length} people loaded from the shared family archive.`, 'success');
  } catch (error) {
    treeCanvas.innerHTML = '<div class="empty-state"><h2>Foundation is connected</h2><p>The web application is signed in, but the database schema or access policy is not yet available. This is expected until the Phase 1 migration is applied.</p></div>';
    setMessage(treeStatus, error.message || 'Unable to load family data yet.', 'error');
  }
}

function leaveApp() {
  appArea.classList.add('hidden');
  authCard.classList.remove('hidden');
  signOutButton.classList.add('hidden');
  centreMeButton.classList.add('hidden');
  state.profile = null;
  state.people = [];
  state.relationships = [];
  state.centreId = null;
  state.selectedId = null;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('email').value.trim();
  setMessage(authMessage, 'Sending secure sign-in link...');
  try {
    await requestMagicLink(email);
    setMessage(authMessage, 'Check your email. The sign-in link is on its way.', 'success');
  } catch (error) {
    setMessage(authMessage, error.message, 'error');
  }
});

signOutButton.addEventListener('click', async () => {
  await supabase.auth.signOut();
  leaveApp();
});

centreSelect.addEventListener('change', () => {
  state.centreId = centreSelect.value;
  selectPerson(state.centreId);
  renderTree();
});

centreMeButton.addEventListener('click', () => {
  if (!state.profile?.person_id) return;
  state.centreId = state.profile.person_id;
  centreSelect.value = state.centreId;
  selectPerson(state.centreId);
  renderTree();
});

contributionForm.addEventListener('submit', submitContribution);

supabase.auth.onAuthStateChange((_event, session) => {
  state.session = session;
  if (session) enterApp();
  else leaveApp();
});

const { data: { session } } = await supabase.auth.getSession();
state.session = session;
if (session) enterApp();
