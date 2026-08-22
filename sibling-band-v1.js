import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
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

function recenter(personId) {
  if (!centreSelect || !personId) return;
  const option = [...centreSelect.options].find((item) => item.value === personId);
  if (!option) return;
  centreSelect.value = personId;
  centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function showSiblingBand(person, persistent = false) {
  if (!treeCanvas || !person) return;
  treeCanvas.querySelector('.collateral-band')?.remove();
  const siblings = siblingsOf(person.id);
  if (!siblings.length) return;

  const band = document.createElement('div');
  band.className = `collateral-band${persistent ? ' centre-collateral-band' : ''}`;
  const label = document.createElement('span');
  label.className = 'collateral-band-label';
  label.textContent = `Siblings of ${shortName(person)}:`;
  band.appendChild(label);

  siblings.forEach((sibling) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'collateral-person';
    button.textContent = shortName(sibling);
    button.title = `Centre the fan on ${canonicalName(sibling)}`;
    button.addEventListener('click', () => recenter(sibling.id));
    band.appendChild(button);
  });

  if (!persistent) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'collateral-close';
    close.setAttribute('aria-label', 'Close sibling band');
    close.textContent = 'x';
    close.addEventListener('click', () => {
      band.remove();
      const centre = getPerson(centreSelect?.value);
      if (centre && siblingsOf(centre.id).length) showSiblingBand(centre, true);
    });
    band.appendChild(close);
  }

  treeCanvas.appendChild(band);
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
    showSiblingBand(person, false);
  };
  badge.addEventListener('click', activate);
  badge.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
  labelGroup.appendChild(badge);
}

function decorateFan() {
  if (!state.loaded || !treeCanvas || !centreSelect?.value) return;
  const svg = treeCanvas.querySelector('svg');
  if (!svg) return;

  svg.querySelectorAll('.collateral-sibling-badge').forEach((node) => node.remove());
  const centre = getPerson(centreSelect.value);
  if (centre && siblingsOf(centre.id).length) showSiblingBand(centre, true);
  else treeCanvas.querySelector('.collateral-band')?.remove();

  svg.querySelectorAll('.person-node[aria-label]').forEach((group) => {
    const label = group.getAttribute('aria-label') || '';
    const person = uniquePersonByName(label);
    if (!person || person.id === centre?.id) return;
    addAncestorBadge(group, person);
  });
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
    .tree-canvas{position:relative}
    .collateral-band{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:7;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;max-width:86%;padding:8px 10px;border:1px solid rgba(94,73,53,.25);border-radius:999px;background:rgba(255,253,248,.94);box-shadow:0 5px 18px rgba(48,38,29,.12);font:700 11px/1.2 Arial,sans-serif}
    .collateral-band-label{color:#6f655c;margin-right:2px}
    .collateral-person,.collateral-close{border:1px solid rgba(94,73,53,.22);background:#ece0d1;color:#3e3329;border-radius:999px;padding:5px 9px;cursor:pointer;font:700 11px Arial,sans-serif}
    .collateral-person:hover{filter:brightness(.97)}
    .collateral-close{width:27px;height:27px;padding:0;background:#fff}
    .collateral-sibling-badge{fill:#5e4935;font:700 7px Arial,sans-serif;text-anchor:middle;cursor:pointer;text-decoration:underline}
    .collateral-sibling-badge:hover{font-size:7.5px}
    @media(max-width:760px){.collateral-band{left:12px;right:12px;bottom:10px;transform:none;max-width:none;border-radius:14px}}
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
  if (!treeCanvas || !centreSelect) return;
  installStyles();
  try {
    await loadData();
    scheduleDecorate(200);
  } catch {
    return;
  }

  centreSelect.addEventListener('change', () => scheduleDecorate(120));
  const observer = new MutationObserver((mutations) => {
    const svgChanged = mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeName?.toLowerCase() === 'svg'));
    if (svgChanged) scheduleDecorate(80);
  });
  observer.observe(treeCanvas, { childList: true, subtree: false });
  document.addEventListener('genealogy:known-as-updated', async () => {
    try { await loadData(); scheduleDecorate(120); } catch { /* non-destructive enhancement */ }
  });
}

start();
