import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const APPROVED_KNOWN_AS = new Set(['documented', 'strong', 'family_supplied']);
const SOURCE_RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };
const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const state = { people: [], relationships: [], byId: new Map(), loaded: false };
let renderTimer = null;

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

function activeRelationship(r) {
  return r?.is_active !== false;
}

function parentEdgesOf(personId) {
  return state.relationships
    .filter((r) => activeRelationship(r) && r.relationship_type === 'parent' && r.person2_id === personId)
    .map((relationship) => ({ relationship, person: getPerson(relationship.person1_id) }))
    .filter((entry) => entry.person);
}

function partnerEdgesOf(personId) {
  return state.relationships
    .filter((r) => activeRelationship(r) && ['spouse', 'partner', 'former_spouse'].includes(r.relationship_type)
      && (r.person1_id === personId || r.person2_id === personId))
    .map((relationship) => ({
      relationship,
      person: getPerson(relationship.person1_id === personId ? relationship.person2_id : relationship.person1_id),
    }))
    .filter((entry) => entry.person)
    .sort((a, b) => {
      const priority = (entry) => {
        if (entry.relationship.relationship_status === 'current' && entry.relationship.relationship_type !== 'former_spouse') return 3;
        if (entry.relationship.relationship_status === 'ended_by_death' && ['spouse', 'partner'].includes(entry.relationship.relationship_type)) return 2;
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

function siblingEvidenceStatus(personId, siblingId) {
  const explicit = state.relationships
    .filter((r) => activeRelationship(r) && r.relationship_type === 'sibling'
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
    if (!activeRelationship(r)) return;
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

function evidenceLabel(status) {
  if (status === 'hypothesis') return 'Hypothesis';
  if (status === 'probable') return 'Probable';
  return '';
}

function recenter(personId) {
  if (!centreSelect || !personId) return;
  let option = [...centreSelect.options].find((item) => item.value === personId);
  if (!option) {
    const search = document.getElementById('centreSearch');
    if (search) {
      search.value = canonicalName(getPerson(personId));
      search.dispatchEvent(new Event('input', { bubbles: true }));
      option = [...centreSelect.options].find((item) => item.value === personId);
    }
  }
  if (!option) return;
  centreSelect.value = personId;
  centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function removeSiblingDeck() {
  document.getElementById('collateralSiblingDrawer')?.remove();
  document.getElementById('collateralSiblingCard')?.remove();
  treeCanvas?.querySelectorAll('.collateral-sibling-cue,.collateral-source-active').forEach((node) => {
    if (node.classList.contains('collateral-sibling-cue')) node.remove();
    else node.classList.remove('collateral-source-active');
  });
}

function siblingBubble(person) {
  const entries = siblingEntries(person.id);
  if (!entries.length) return null;

  const bubble = document.createElement('section');
  bubble.className = 'collateral-drawer';
  bubble.setAttribute('aria-label', `Siblings of ${canonicalName(person)}`);

  const heading = document.createElement('div');
  heading.className = 'collateral-drawer-heading';
  const kicker = document.createElement('span');
  kicker.className = 'collateral-drawer-kicker';
  kicker.textContent = 'Sibling branch';
  const title = document.createElement('strong');
  title.textContent = `${shortName(person)}'s siblings`;
  const full = document.createElement('small');
  full.textContent = canonicalName(person);
  heading.append(kicker, title, full);
  bubble.appendChild(heading);

  const people = document.createElement('div');
  people.className = 'collateral-drawer-people';
  entries.forEach(({ person: sibling, sourceStatus }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `collateral-person${['probable', 'hypothesis'].includes(sourceStatus) ? ' is-uncertain' : ''}`;
    const short = document.createElement('span');
    short.textContent = shortName(sibling);
    const name = document.createElement('small');
    name.textContent = canonicalName(sibling);
    button.append(short, name);
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
  bubble.appendChild(people);
  return bubble;
}

function renderCentreSiblingDeck() {
  if (!state.loaded || !treeCanvas || !centreSelect?.value) return;
  removeSiblingDeck();
  const centre = getPerson(centreSelect.value);
  if (!centre) return;

  const mode = document.getElementById('treeViewMode')?.value || 'family';
  const partner = mode === 'family' ? familyPartnerOf(centre.id) : null;
  const members = partner ? [centre, partner] : [centre];
  const bubbles = members.map(siblingBubble).filter(Boolean);
  if (!bubbles.length) return;

  const deck = document.createElement('div');
  deck.id = 'collateralSiblingDrawer';
  deck.className = `collateral-drawer-deck${bubbles.length > 1 ? ' is-couple' : ''}`;
  bubbles.forEach((bubble) => deck.appendChild(bubble));
  treeCanvas.parentElement?.insertBefore(deck, treeCanvas);
}

function scheduleRender(delay = 80) {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderCentreSiblingDeck, delay);
}

function installStyles() {
  if (document.getElementById('collateralBandStyles')) return;
  const style = document.createElement('style');
  style.id = 'collateralBandStyles';
  style.textContent = `
    .tree-panel{position:relative}
    .collateral-drawer-deck{display:grid;grid-template-columns:1fr;gap:10px;margin:12px 0 0;font-family:Arial,sans-serif}
    .collateral-drawer-deck.is-couple{grid-template-columns:repeat(2,minmax(0,1fr))}
    .collateral-drawer{display:flex;align-items:center;gap:14px;padding:11px 14px;border:1px solid rgba(94,73,53,.22);border-radius:14px;background:#fffaf2;box-shadow:0 4px 14px rgba(48,38,29,.07);min-width:0}
    .collateral-drawer-heading{min-width:132px;display:grid;gap:2px;color:#3e3329;font-size:12px}
    .collateral-drawer-heading small{font-size:9px;font-weight:500;color:#817468;overflow:hidden;text-overflow:ellipsis}
    .collateral-drawer-kicker{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#85786b}
    .collateral-drawer-people{display:flex;gap:8px;flex-wrap:wrap;align-items:center;min-width:0}
    .collateral-person{display:grid;gap:1px;min-width:92px;border:1px solid rgba(94,73,53,.22);background:#ece0d1;color:#3e3329;border-radius:10px;padding:7px 10px;cursor:pointer;text-align:left;font-family:Arial,sans-serif}
    .collateral-person span{font-size:12px;font-weight:700}
    .collateral-person small{font-size:9px;color:#706459}
    .collateral-person em{font-size:8px;font-style:normal;text-transform:uppercase;letter-spacing:.06em;color:#8a5d35}
    .collateral-person.is-uncertain{border-style:dashed;background:#f5eee5}
    .collateral-person:hover{filter:brightness(.97)}
    @media(max-width:980px){.collateral-drawer-deck.is-couple{grid-template-columns:1fr}.collateral-drawer{align-items:flex-start}}
    @media(max-width:760px){.collateral-drawer{flex-direction:column}.collateral-drawer-heading{min-width:0}.collateral-drawer-people{width:100%}.collateral-person{flex:1 1 110px}}
  `;
  document.head.appendChild(style);
}

async function loadData() {
  const [peopleResult, relationshipResult] = await Promise.all([
    supabase.from('people').select('id,given_names,preferred_name,preferred_name_status,surname,gender,birth_date,death_date,is_active'),
    supabase.from('relationships').select('person1_id,person2_id,relationship_type,relationship_status,source_status,date_note,is_active'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationshipResult.error) throw relationshipResult.error;
  state.people = (peopleResult.data || []).filter((person) => person.is_active !== false);
  state.relationships = (relationshipResult.data || []).filter(activeRelationship);
  state.byId = new Map(state.people.map((person) => [person.id, person]));
  state.loaded = true;
}

async function start() {
  if (!treeCanvas || !centreSelect) return;
  installStyles();
  try {
    await loadData();
    scheduleRender(180);
  } catch {
    return;
  }

  centreSelect.addEventListener('change', () => scheduleRender(120));
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'treeViewMode') scheduleRender(80);
  });

  const observer = new MutationObserver((mutations) => {
    const svgChanged = mutations.some((mutation) => [...mutation.addedNodes]
      .some((node) => node.nodeName?.toLowerCase() === 'svg'));
    if (svgChanged) scheduleRender(80);
  });
  observer.observe(treeCanvas, { childList: true, subtree: false });

  document.addEventListener('genealogy:known-as-updated', async () => {
    try { await loadData(); scheduleRender(0); } catch { /* non-destructive enhancement */ }
  });
  document.addEventListener('genealogy:tree-suggestions-updated', async () => {
    try { await loadData(); scheduleRender(0); } catch { /* non-destructive enhancement */ }
  });
}

start();
