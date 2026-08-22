import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const SOURCE_RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };
const REGISTRATION_KEY = 'genealogyRegistrationDraft';

const state = {
  session: null,
  profile: null,
  accessRequest: null,
  people: [],
  relationships: [],
  selectedId: null,
  centreId: null,
};

const $ = (id) => document.getElementById(id);
const authCard = $('authCard');
const registrationCard = $('registrationCard');
const appArea = $('appArea');
const loginForm = $('loginForm');
const registerForm = $('registerForm');
const completeRegistrationForm = $('completeRegistrationForm');
const authMessage = $('authMessage');
const registrationMessage = $('registrationMessage');
const registrationFormWrap = $('registrationFormWrap');
const registrationPending = $('registrationPending');
const pendingName = $('pendingName');
const pendingSummary = $('pendingSummary');
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

function registrationName(data) {
  return [data.first_name, data.middle_names, data.last_name].map((v) => (v || '').trim()).filter(Boolean).join(' ');
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

function sourceLabel(value) {
  return (value || 'unresolved').replaceAll('_', ' ');
}

function readRegistrationDraft() {
  try {
    const raw = localStorage.getItem(REGISTRATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveRegistrationDraft(draft) {
  localStorage.setItem(REGISTRATION_KEY, JSON.stringify(draft));
}

function clearRegistrationDraft() {
  localStorage.removeItem(REGISTRATION_KEY);
}

function registrationFromForm(prefix) {
  return {
    first_name: $(`${prefix}FirstName`).value.trim(),
    middle_names: $(`${prefix}MiddleNames`).value.trim(),
    last_name: $(`${prefix}LastName`).value.trim(),
    birth_date: $(`${prefix}BirthDate`).value || null,
    email_updates_opt_in: $(`${prefix}Updates`).checked,
  };
}

async function requestOtp(email, shouldCreateUser) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser,
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

async function loadAccessRequest() {
  const { data, error } = await supabase
    .from('access_requests')
    .select('id, user_id, display_name, email, first_name, middle_names, last_name, birth_date, email_updates_opt_in, status, created_at')
    .eq('user_id', state.session.user.id)
    .maybeSingle();
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
  const { data, error } = await supabase
    .from('access_requests')
    .upsert(payload, { onConflict: 'user_id' })
    .select('id, user_id, display_name, email, first_name, middle_names, last_name, birth_date, email_updates_opt_in, status, created_at')
    .single();
  if (error) throw error;
  state.accessRequest = data;
  clearRegistrationDraft();
  return data;
}

function hideAllMainAreas() {
  authCard.classList.add('hidden');
  registrationCard.classList.add('hidden');
  appArea.classList.add('hidden');
}

function showSignedOut() {
  hideAllMainAreas();
  authCard.classList.remove('hidden');
  signOutButton.classList.add('hidden');
  centreMeButton.classList.add('hidden');
}

function showCompletionForm() {
  hideAllMainAreas();
  registrationCard.classList.remove('hidden');
  registrationFormWrap.classList.remove('hidden');
  registrationPending.classList.add('hidden');
  $('completeEmail').value = state.session.user.email || '';
  setMessage(registrationMessage, 'Your email is verified. Complete these details so the family editor can identify you.');
}

function showPendingRequest(request) {
  hideAllMainAreas();
  registrationCard.classList.remove('hidden');
  registrationFormWrap.classList.add('hidden');
  registrationPending.classList.remove('hidden');
  pendingName.textContent = request.display_name || 'Family member';
  const dob = request.birth_date ? ` Date of birth supplied: ${formatDate(request.birth_date)}.` : '';
  const updates = request.email_updates_opt_in ? ' You have opted in to relevant family-tree email updates.' : '';
  pendingSummary.textContent = `Your verified email is ${request.email}. Your access request is waiting for the family editor to link you to the correct person in the tree.${dob}${updates}`;
  setMessage(registrationMessage, 'Registration received. You will be able to enter the archive once approved.', 'success');
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
  return state.people.find((person) => person.id === id) || null;
}

function parentEdgesOf(personId) {
  return state.relationships
    .filter((relationship) => relationship.relationship_type === 'parent' && relationship.person2_id === personId)
    .map((relationship) => ({ relationship, person: getPerson(relationship.person1_id) }))
    .filter((entry) => entry.person)
    .sort((a, b) => {
      const rankDiff = (SOURCE_RANK[b.relationship.source_status] || 0) - (SOURCE_RANK[a.relationship.source_status] || 0);
      if (rankDiff) return rankDiff;
      return displayName(a.person).localeCompare(displayName(b.person));
    });
}

function parentsOf(personId) {
  return parentEdgesOf(personId).map((entry) => entry.person);
}

function parentPairOf(personId) {
  const candidates = parentEdgesOf(personId);
  const slots = [null, null];
  const used = new Set();
  const fatherIndex = candidates.findIndex((entry) => entry.person.gender === 'male');
  if (fatherIndex >= 0) { slots[0] = candidates[fatherIndex]; used.add(fatherIndex); }
  const motherIndex = candidates.findIndex((entry) => entry.person.gender === 'female');
  if (motherIndex >= 0) { slots[1] = candidates[motherIndex]; used.add(motherIndex); }
  candidates.forEach((entry, index) => {
    if (used.has(index)) return;
    const openSlot = slots.findIndex((slot) => slot === null);
    if (openSlot >= 0) slots[openSlot] = entry;
  });
  return slots;
}

function childrenOf(personId) {
  return state.relationships
    .filter((relationship) => relationship.relationship_type === 'parent' && relationship.person1_id === personId)
    .map((relationship) => getPerson(relationship.person2_id))
    .filter(Boolean)
    .sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999'));
}

function partnersOf(personId) {
  const validTypes = ['spouse', 'partner', 'former_spouse'];
  return state.relationships
    .filter((relationship) => validTypes.includes(relationship.relationship_type)
      && (relationship.person1_id === personId || relationship.person2_id === personId))
    .map((relationship) => ({
      relationship,
      person: getPerson(relationship.person1_id === personId ? relationship.person2_id : relationship.person1_id),
    }))
    .filter((entry) => entry.person);
}

function siblingsOf(personId) {
  const directSiblingIds = new Set(
    state.relationships
      .filter((relationship) => relationship.relationship_type === 'sibling'
        && (relationship.person1_id === personId || relationship.person2_id === personId))
      .map((relationship) => (relationship.person1_id === personId ? relationship.person2_id : relationship.person1_id)),
  );
  const parentIds = new Set(parentsOf(personId).map((parent) => parent.id));
  state.relationships.forEach((relationship) => {
    if (relationship.relationship_type === 'parent'
      && parentIds.has(relationship.person1_id)
      && relationship.person2_id !== personId) directSiblingIds.add(relationship.person2_id);
  });
  return [...directSiblingIds].map(getPerson).filter(Boolean).sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

function ancestorLevels(centreId, depth = 4) {
  const levels = [];
  let current = [{ person: getPerson(centreId), relationship: null }];
  for (let generation = 0; generation < depth; generation += 1) {
    const next = [];
    current.forEach((entry) => {
      if (!entry?.person) { next.push(null, null); return; }
      const [slot1, slot2] = parentPairOf(entry.person.id);
      next.push(slot1, slot2);
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
  const large = (endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${p1[0]} ${p1[1]} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`;
}

function labelRotation(mid) {
  let rotation = mid;
  if (mid > 90 && mid < 270) rotation += 180;
  return rotation;
}

function branchColour(slot, levelIndex) {
  const lineage = Math.floor(slot / (2 ** levelIndex));
  return lineage === 0 ? 'var(--schroeder)' : 'var(--meyer)';
}

function evidenceStyle(path, sourceStatus) {
  if (sourceStatus === 'hypothesis') {
    path.setAttribute('fill-opacity', '.48');
    path.setAttribute('stroke-dasharray', '7 4');
  } else if (sourceStatus === 'probable') {
    path.setAttribute('fill-opacity', '.66');
    path.setAttribute('stroke-dasharray', '5 3');
  } else if (sourceStatus === 'family_supplied') path.setAttribute('fill-opacity', '.82');
  else path.setAttribute('fill-opacity', '.92');
}

function renderTree() {
  const centre = getPerson(state.centreId);
  if (!centre) {
    treeCanvas.innerHTML = '<div class="empty-state">Choose a person to build their ancestor fan.</div>';
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

  levels.forEach((entries, levelIndex) => {
    const slots = 2 ** (levelIndex + 1);
    const step = 360 / slots;
    for (let slot = 0; slot < slots; slot += 1) {
      const entry = entries[slot];
      const person = entry?.person || null;
      const startAngle = slot * step;
      const endAngle = (slot + 1) * step;
      const [innerRadius, outerRadius] = ringRadii[levelIndex];
      const group = document.createElementNS(ns, 'g');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', sectorPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle));
      path.setAttribute('fill', person ? branchColour(slot, levelIndex) : '#e8e3dc');
      path.setAttribute('stroke', '#8c8175');
      path.setAttribute('stroke-width', '1.1');
      if (person) evidenceStyle(path, entry.relationship?.source_status || person.source_status);
      else { path.setAttribute('fill-opacity', '.25'); path.setAttribute('stroke-dasharray', '5 4'); }
      group.appendChild(path);

      const mid = (startAngle + endAngle) / 2;
      const [textX, textY] = polar(cx, cy, (innerRadius + outerRadius) / 2, mid);
      const wrap = document.createElementNS(ns, 'g');
      wrap.setAttribute('transform', `translate(${textX} ${textY}) rotate(${labelRotation(mid)})`);
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
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'button');
        const activate = () => selectPerson(person.id);
        group.addEventListener('click', activate);
        group.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
        });
      }
      svg.appendChild(group);
    }
  });

  const centreGroup = document.createElementNS(ns, 'g');
  centreGroup.classList.add('person-node');
  centreGroup.setAttribute('tabindex', '0');
  centreGroup.setAttribute('role', 'button');
  const centreCard = document.createElementNS(ns, 'circle');
  centreCard.setAttribute('cx', cx); centreCard.setAttribute('cy', cy); centreCard.setAttribute('r', '104'); centreCard.setAttribute('class', 'centre-card');
  centreGroup.appendChild(centreCard);
  const centreName = document.createElementNS(ns, 'text');
  centreName.setAttribute('x', cx); centreName.setAttribute('y', cy - 6); centreName.setAttribute('class', 'centre-name'); centreName.textContent = displayName(centre);
  centreGroup.appendChild(centreName);
  const centreSub = document.createElementNS(ns, 'text');
  centreSub.setAttribute('x', cx); centreSub.setAttribute('y', cy + 18); centreSub.setAttribute('class', 'centre-sub'); centreSub.textContent = lifeText(centre) || 'CENTRE PERSON';
  centreGroup.appendChild(centreSub);
  const activateCentre = () => selectPerson(centre.id);
  centreGroup.addEventListener('click', activateCentre);
  centreGroup.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateCentre(); }
  });
  svg.appendChild(centreGroup);
  treeCanvas.replaceChildren(svg);
  $('viewTitle').textContent = displayName(centre);
  $('viewSummary').textContent = 'This fan is recalculated from the shared relationship graph. Empty wedges stay in place so unknown ancestry remains visible rather than shifting the family line.';
}

function renderPersonPanel(person) {
  if (!person) { personName.textContent = 'Choose a person'; personDetails.innerHTML = ''; return; }
  personName.textContent = displayName(person);
  const lines = [];
  if (lifeText(person)) lines.push(['Life', lifeText(person)]);
  if (person.birth_place) lines.push(['Birthplace', person.birth_place]);
  if (person.occupation_summary) lines.push(['Occupation', person.occupation_summary]);
  partnersOf(person.id).forEach(({ person: partner, relationship }) => {
    const label = relationship.relationship_type === 'former_spouse' ? 'Former spouse' : relationship.relationship_type === 'partner' ? 'Partner' : 'Spouse';
    const statusNote = relationship.date_note ? ` ${relationship.date_note}` : '';
    lines.push([label, `${displayName(partner)}${statusNote}`]);
  });
  lines.push(['Source status', sourceLabel(person.source_status)]);
  if (person.narrative_summary) lines.push(['Family note', person.narrative_summary]);
  const children = childrenOf(person.id);
  if (children.length) lines.push(['Children', children.map(displayName).join(', ')]);
  const siblings = siblingsOf(person.id);
  if (siblings.length) lines.push(['Siblings', siblings.map(displayName).join(', ')]);
  personDetails.innerHTML = lines.map(([label, value]) => `<div class="detail-line"><strong>${esc(label)}</strong>${esc(value)}</div>`).join('');
}

function selectPerson(id) {
  state.selectedId = id;
  renderPersonPanel(getPerson(id));
}

function populateCentreSelect() {
  centreSelect.innerHTML = '';
  [...state.people].sort((a, b) => displayName(a).localeCompare(displayName(b))).forEach((person) => {
    const option = document.createElement('option');
    option.value = person.id;
    option.textContent = displayName(person);
    centreSelect.appendChild(option);
  });
  if (!state.centreId && state.profile?.person_id) state.centreId = state.profile.person_id;
  if (!state.centreId && state.people.length) state.centreId = state.people.find((person) => person.slug === 'werner')?.id || state.people[0].id;
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
  if (error) { setMessage(contributionMessage, error.message, 'error'); return; }
  contributionForm.reset();
  $('language').value = 'en';
  setMessage(contributionMessage, 'Thank you. Your information has been saved for review.', 'success');
}

async function enterArchive() {
  hideAllMainAreas();
  appArea.classList.remove('hidden');
  signOutButton.classList.remove('hidden');
  setMessage(treeStatus, 'Loading family archive...');
  await loadFamilyData();
  populateCentreSelect();
  renderTree();
  if (state.profile?.person_id) centreMeButton.classList.remove('hidden');
  if (state.centreId) selectPerson(state.centreId);
  setMessage(treeStatus, `${state.people.length} people loaded from the shared family archive.`, 'success');
}

async function routeAuthenticatedUser() {
  signOutButton.classList.remove('hidden');
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
    showCompletionForm();
    setMessage(registrationMessage, error.message || 'Unable to complete family registration.', 'error');
  }
}

function resetState() {
  state.profile = null;
  state.accessRequest = null;
  state.people = [];
  state.relationships = [];
  state.centreId = null;
  state.selectedId = null;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('loginEmail').value.trim();
  setMessage(authMessage, 'Sending your secure sign-in link...');
  try {
    await requestOtp(email, false);
    setMessage(authMessage, 'If this email is registered, a secure sign-in link is on its way.', 'success');
  } catch (error) {
    setMessage(authMessage, error.message, 'error');
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const draft = registrationFromForm('register');
  draft.email = $('registerEmail').value.trim();
  saveRegistrationDraft(draft);
  setMessage(authMessage, 'Sending a verification link to your email...');
  try {
    await requestOtp(draft.email, true);
    setMessage(authMessage, 'Check your email. Open the secure link to verify your address and submit your access request.', 'success');
  } catch (error) {
    setMessage(authMessage, error.message, 'error');
  }
});

completeRegistrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const draft = registrationFromForm('complete');
  draft.email = state.session.user.email;
  setMessage(registrationMessage, 'Submitting your family access request...');
  try {
    const request = await submitAccessRequest(draft);
    showPendingRequest(request);
  } catch (error) {
    setMessage(registrationMessage, error.message, 'error');
  }
});

signOutButton.addEventListener('click', async () => {
  await supabase.auth.signOut();
  resetState();
  showSignedOut();
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
  if (session) routeAuthenticatedUser();
  else { resetState(); showSignedOut(); }
});

const { data: { session } } = await supabase.auth.getSession();
state.session = session;
if (session) await routeAuthenticatedUser();
else showSignedOut();
