import { supabase } from './supabase-client-v1.js';
import { preferredFamilyPartnerEntry } from './relationship-rules-v1.js';

const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const treePanel = document.querySelector('.tree-panel');
const SOURCE_RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };
const state = { people: [], relationships: [], byId: new Map(), loadedAt: 0 };
let timer = null;

function active(r) { return r?.is_active !== false; }
function getPerson(id) { return state.byId.get(id) || null; }
function canonicalName(person) { return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ') || 'Unknown'; }
function years(person) {
  const b = person?.birth_date?.slice(0, 4) || '';
  const d = person?.death_date?.slice(0, 4) || '';
  return b && d ? `${b}-${d}` : b ? `b. ${b}` : d ? `d. ${d}` : '';
}
function relationshipBadge(status) {
  if (status === 'hypothesis') return 'Hypothesis';
  if (status === 'probable') return 'Probable';
  return '';
}
function parentEdges(id) {
  return state.relationships.filter(r => active(r) && r.relationship_type === 'parent' && r.person2_id === id);
}
function childIds(id) {
  return state.relationships.filter(r => active(r) && r.relationship_type === 'parent' && r.person1_id === id).map(r => r.person2_id);
}
function partnerEntry(id) {
  const entries = state.relationships
    .filter(r => active(r) && ['spouse', 'partner', 'former_spouse'].includes(r.relationship_type) && (r.person1_id === id || r.person2_id === id))
    .map(relationship => ({
      relationship,
      person: getPerson(relationship.person1_id === id ? relationship.person2_id : relationship.person1_id),
    }))
    .filter(entry => entry.person);
  return preferredFamilyPartnerEntry(entries) || null;
}
function siblingStatus(id, siblingId) {
  const direct = state.relationships
    .filter(r => active(r) && r.relationship_type === 'sibling' && ((r.person1_id === id && r.person2_id === siblingId) || (r.person2_id === id && r.person1_id === siblingId)))
    .map(r => r.source_status || 'unresolved')
    .sort((a, b) => (SOURCE_RANK[b] || 0) - (SOURCE_RANK[a] || 0));
  if (direct.length) return direct[0];
  const a = new Map(parentEdges(id).map(r => [r.person1_id, r.source_status || 'unresolved']));
  const b = new Map(parentEdges(siblingId).map(r => [r.person1_id, r.source_status || 'unresolved']));
  const shared = [...a.keys()].filter(parentId => b.has(parentId));
  if (!shared.length) return 'unresolved';
  return shared.map(parentId => (SOURCE_RANK[a.get(parentId)] || 0) <= (SOURCE_RANK[b.get(parentId)] || 0) ? a.get(parentId) : b.get(parentId))
    .sort((x, y) => (SOURCE_RANK[y] || 0) - (SOURCE_RANK[x] || 0))[0] || 'unresolved';
}
function siblingIds(id) {
  const ids = new Set();
  const parents = new Set(parentEdges(id).map(r => r.person1_id));
  state.relationships.forEach(r => {
    if (!active(r)) return;
    if (r.relationship_type === 'sibling' && (r.person1_id === id || r.person2_id === id)) ids.add(r.person1_id === id ? r.person2_id : r.person1_id);
    if (r.relationship_type === 'parent' && parents.has(r.person1_id) && r.person2_id !== id) ids.add(r.person2_id);
  });
  return [...ids];
}
function coupleChildren(id, partnerId) {
  const a = new Set(childIds(id));
  if (!partnerId) return [...a].map(getPerson).filter(Boolean);
  const b = new Set(childIds(partnerId));
  const shared = [...a].filter(childId => b.has(childId));
  const ids = shared.length ? shared : [...new Set([...a, ...b])];
  return ids.map(getPerson).filter(Boolean).sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
}
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
function personButton(person, role, status = '') {
  const badge = relationshipBadge(status);
  return `<button type="button" class="family-group-person${badge ? ' is-uncertain' : ''}" data-family-group-person="${esc(person.id)}">${role ? `<span class="family-group-role">${esc(role)}</span>` : ''}<strong>${esc(canonicalName(person))}</strong>${years(person) ? `<small>${esc(years(person))}</small>` : ''}${badge ? `<em>${esc(badge)}</em>` : ''}</button>`;
}
function familyCluster(person, focusId) {
  const partner = partnerEntry(person.id);
  const status = person.id === focusId ? 'documented' : siblingStatus(focusId, person.id);
  const children = coupleChildren(person.id, partner?.person?.id || null);
  const pair = `<div class="family-group-couple">${personButton(person, person.id === focusId ? 'Selected' : 'Sibling', status)}${partner?.person ? `<span class="family-group-couple-link"></span>${personButton(partner.person, partner.relationship.relationship_type === 'partner' ? 'Partner' : 'Spouse', partner.relationship.source_status || '')}` : ''}</div>`;
  const childHtml = children.length ? `<div class="family-group-stem"></div><div class="family-group-children">${children.map(child => personButton(child, 'Child')).join('')}</div>` : '<div class="family-group-empty">No children recorded</div>';
  return `<article class="family-group-cluster${person.id === focusId ? ' is-focus' : ''}">${pair}${childHtml}</article>`;
}

async function loadData(force = false) {
  if (!force && state.loadedAt && Date.now() - state.loadedAt < 5000) return;
  const [peopleResult, relationshipsResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,preferred_name,preferred_name_status,gender,birth_date,death_date,is_active'),
    supabase.from('relationships').select('person1_id,person2_id,relationship_type,relationship_status,source_status,is_active'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationshipsResult.error) throw relationshipsResult.error;
  state.people = (peopleResult.data || []).filter(person => person.is_active !== false);
  state.relationships = (relationshipsResult.data || []).filter(active);
  state.byId = new Map(state.people.map(person => [person.id, person]));
  state.loadedAt = Date.now();
}

function installStyles() {
  if (document.getElementById('familyGroupRepairStyles')) return;
  const style = document.createElement('style');
  style.id = 'familyGroupRepairStyles';
  style.textContent = `
    .tree-panel.snapshot-active #collateralSiblingDrawer,
    .tree-panel.snapshot-active #collateralSiblingCard{display:none!important}
    .snapshot-waist.is-family-group-repaired{overflow:visible;padding:16px 10px 18px}
    .family-group-scroll{overflow-x:auto;overflow-y:visible;padding:4px 2px 10px;scrollbar-gutter:stable}
    .family-group-row{display:flex;align-items:flex-start;justify-content:center;gap:14px;width:max-content;min-width:100%;padding:0 8px}
    .family-group-cluster{position:relative;flex:0 0 230px;min-width:230px;padding:10px 10px 12px;border:1px solid rgba(89,72,57,.14);border-radius:15px;background:rgba(255,250,242,.72);text-align:center}
    .family-group-cluster.is-focus{border:2px solid rgba(84,65,49,.46);background:#fffaf2;box-shadow:0 5px 18px rgba(70,52,38,.10)}
    .family-group-couple{display:flex;align-items:center;justify-content:center;gap:5px;min-height:70px}
    .family-group-couple-link{width:12px;height:1px;background:#9a8878;flex:0 0 12px}
    .family-group-person{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:96px;max-width:126px;min-height:56px;padding:7px 8px;border:1px solid rgba(89,72,57,.24);border-radius:11px;background:#fffaf2;color:#3f3329;text-align:center;font:inherit;cursor:pointer}
    .family-group-person strong{font:700 10px/1.18 Georgia,serif}
    .family-group-person small{font:500 8.5px/1.15 Arial,sans-serif;color:#77695d}
    .family-group-person em{font:700 7.5px/1.1 Arial,sans-serif;font-style:normal;text-transform:uppercase;letter-spacing:.06em;color:#8a5d35}
    .family-group-person.is-uncertain{border-style:dashed;background:#f7f0e7}
    .family-group-role{font:800 7px/1.1 Arial,sans-serif!important;text-transform:uppercase;letter-spacing:.08em;color:#817366!important}
    .family-group-stem{width:1px;height:14px;margin:0 auto;background:#a89482}
    .family-group-children{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));gap:6px;padding-top:9px}
    .family-group-children:before{content:"";position:absolute;left:12%;right:12%;top:0;height:1px;background:#b19f8e}
    .family-group-children .family-group-person{position:relative;min-width:0;width:100%;max-width:none;min-height:48px;padding:6px}
    .family-group-children .family-group-person:before{content:"";position:absolute;left:50%;top:-9px;width:1px;height:9px;background:#b19f8e}
    .family-group-empty{padding:10px 4px 0;font:500 8.5px/1.25 Arial,sans-serif;color:#95887c}
    .family-group-note{margin:9px auto 0;max-width:760px;text-align:center;font:500 9px/1.35 Arial,sans-serif;color:#817366}
    @media(max-width:900px){.family-group-row{justify-content:flex-start}.family-group-cluster{flex-basis:215px;min-width:215px}}
  `;
  document.head.appendChild(style);
}

function syncViewLabels() {
  const snapshotButton = document.querySelector('[data-tree-perspective="snapshot"]');
  if (snapshotButton) {
    snapshotButton.innerHTML = '<span class="explorer-mode-title">Family group</span><span class="explorer-mode-copy">Siblings, spouses and children</span>';
  }
  if (treePanel?.classList.contains('snapshot-active')) {
    const heading = treePanel.querySelector('.panel-head h2');
    if (heading) heading.textContent = 'Family group';
  }
}

async function repairFamilyGroup() {
  syncViewLabels();
  if (!treePanel?.classList.contains('snapshot-active') || !treeCanvas || !centreSelect?.value) return;
  const waist = treeCanvas.querySelector('.snapshot-waist');
  if (!waist) return;
  await loadData();
  const focus = getPerson(centreSelect.value);
  if (!focus) return;

  const familyIds = [focus.id, ...siblingIds(focus.id)];
  const family = [...new Map(familyIds.map(id => [id, getPerson(id)]).filter(([, p]) => p)).values()]
    .sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999') || canonicalName(a).localeCompare(canonicalName(b)));

  waist.classList.add('is-family-group-repaired');
  waist.innerHTML = `<p class="snapshot-section-label">Focus generation - sibling family group</p><div class="family-group-scroll"><div class="family-group-row">${family.map(person => familyCluster(person, focus.id)).join('')}</div></div><p class="family-group-note">The selected person stays in the same generation as their siblings. Spouses sit beside each sibling and recorded children sit directly below. Probable and hypothesis relationships remain visibly dashed.</p>`;
  waist.querySelectorAll('[data-family-group-person]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.familyGroupPerson;
    const option = [...centreSelect.options].find(item => item.value === id);
    if (!option) return;
    centreSelect.value = id;
    centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }));
}

function schedule(delay = 60) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => repairFamilyGroup().catch(() => {}), delay);
}

// Keep the existing behaviour: using a sibling navigation control switches to Family view first.
function siblingNavigationTarget(target) {
  if (!(target instanceof Element)) return null;
  return target.closest('#collateralSiblingDrawer .collateral-person, #collateralSiblingCard .collateral-centre-action');
}
function forceFamilyViewForSiblingNavigation(event) {
  const action = siblingNavigationTarget(event.target);
  if (!action) return;
  const viewMode = document.getElementById('treeViewMode');
  if (!viewMode || viewMode.value === 'family') return;
  viewMode.value = 'family';
  viewMode.dispatchEvent(new Event('change', { bubbles: true }));
}

document.addEventListener('click', forceFamilyViewForSiblingNavigation, true);
installStyles();

if (treeCanvas) {
  const observer = new MutationObserver(() => schedule(30));
  observer.observe(treeCanvas, { childList: true, subtree: false });
}
if (treePanel) {
  const observer = new MutationObserver(() => schedule(40));
  observer.observe(treePanel, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
centreSelect?.addEventListener('change', () => { state.loadedAt = 0; schedule(100); });
document.addEventListener('genealogy:tree-suggestions-updated', () => { state.loadedAt = 0; schedule(80); });
document.addEventListener('genealogy:known-as-updated', () => { state.loadedAt = 0; schedule(80); });
[0, 120, 450, 1000, 2500, 5200].forEach(delay => window.setTimeout(() => schedule(0), delay));
