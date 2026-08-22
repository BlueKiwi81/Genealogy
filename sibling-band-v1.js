import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const personName = document.getElementById('personName');
const state = { people: [], relationships: [], byId: new Map(), loaded: false };
let decorateTimer = null;

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ');
}

function shortName(person) {
  return person?.preferred_name?.trim() || person?.given_names?.trim().split(/\s+/)[0] || canonicalName(person);
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
  close.addEventListener('click', removeSiblingDrawer);
  drawer.appendChild(close);

  treeCanvas.parentElement?.insertBefore(drawer, treeCanvas);
}

function addAncestorBadge(group, person) {
  const siblings = siblingsOf(person.id);
  if (!siblings.length) return;
  const labelGroups = [...group.querySelectorAll('g[transform]')].filter((node) => node.querySelector('text'));
  const labelGroup = labelGroups[labelGroups.length - 1];
  if (!labelGroup) return;

  const ns = 'http://www.w3.org/2000/svg';
  const badge = document.createElementNS(ns, 'text');
  badge.setAttribute('x', '0');
  badge.setAttribute('y', '29');
  badge.setAttribute('class', 'collateral-sibling-badge');
  badge.setAttribute('role', 'button');
  badge.setAttribute('tabindex', '0');
  badge.setAttribute('aria-label', `Show siblings of ${canonicalName(person)}`);
  badge.textContent = `${siblings.length} ${siblings.length === 1 ? 'sibling' : 'siblings'}`;
  const activate = (event) => {
    event.preventDefault();
    event.stopPropagation();
    showSiblingDrawer(person);
  };
  badge.addEventListener('click', activate);
  badge.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
  labelGroup.appendChild(badge);
}

function decorateFan() {
  if (!state.loaded || !treeCanvas) return;
  const svg = treeCanvas.querySelector('svg');
  if (!svg) return;

  svg.querySelectorAll('.collateral-sibling-badge').forEach((node) => node.remove());
  svg.querySelectorAll('.person-node[aria-label]').forEach((group) => {
    const label = group.getAttribute('aria-label') || '';
    const person = uniquePersonByName(label);
    if (person) addAncestorBadge(group, person);
  });
}

function syncDrawerToSelection() {
  if (!state.loaded) return;
  const person = selectedPerson();
  if (!person) return;
  if (siblingsOf(person.id).length) showSiblingDrawer(person);
  else removeSiblingDrawer();
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
    .collateral-sibling-badge{fill:#5e4935;font:700 7px Arial,sans-serif;text-anchor:middle;cursor:pointer;text-decoration:underline}
    .collateral-sibling-badge:hover{font-size:7.5px}
    @media(max-width:760px){.collateral-drawer{align-items:flex-start;flex-direction:column;padding-right:44px}.collateral-drawer-heading{min-width:0}.collateral-drawer-people{width:100%}.collateral-person{flex:1 1 110px}}
  `;
  document.head.appendChild(style);
}

async function loadData() {
  const [peopleResult, relationshipResult] = await Promise.all([
    supabase.from('people').select('id, given_names, preferred_name, surname'),
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
    scheduleDecorate(120);
  });

  // Any click on a person cell updates the Selected person panel in the main
  // renderer. Read that selection immediately afterwards and open the relevant
  // sibling branch automatically.
  treeCanvas.addEventListener('click', () => window.setTimeout(syncDrawerToSelection, 0));
  treeCanvas.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') window.setTimeout(syncDrawerToSelection, 0);
  });

  const nameObserver = new MutationObserver(() => window.setTimeout(syncDrawerToSelection, 0));
  nameObserver.observe(personName, { childList: true, characterData: true, subtree: true });

  const observer = new MutationObserver((mutations) => {
    const svgChanged = mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeName?.toLowerCase() === 'svg'));
    if (svgChanged) scheduleDecorate(80);
  });
  observer.observe(treeCanvas, { childList: true, subtree: false });

  document.addEventListener('genealogy:known-as-updated', async () => {
    try { await loadData(); scheduleDecorate(120); syncDrawerToSelection(); } catch { /* non-destructive enhancement */ }
  });
}

start();
