import { supabase } from './supabase-client-v1.js';
import { preferredFamilyPartnerEntry } from './relationship-rules-v1.js';


const ui = {
  centreSelect: document.getElementById('centreSelect'),
  treeCanvas: document.getElementById('treeCanvas'),
  treeStatus: document.getElementById('treeStatus'),
  viewTitle: document.getElementById('viewTitle'),
  viewSummary: document.getElementById('viewSummary'),
  treePanel: document.querySelector('.tree-panel'),
  panelHead: document.querySelector('.tree-panel .panel-head'),
};
const APPROVED_KNOWN_AS = new Set(['documented', 'strong', 'family_supplied']);
const state = { people: [], relationships: [], peopleById: new Map(), active: false };

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function canonicalName(person) { return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ') || 'Unknown'; }
function approvedKnownAs(person) {
  const value = person?.preferred_name?.trim();
  const status = person?.preferred_name_status || 'unresolved';
  if (!value || !APPROVED_KNOWN_AS.has(status)) return '';
  const first = (person?.given_names || '').trim().split(/\s+/)[0] || '';
  return value.toLowerCase() === first.toLowerCase() ? '' : value;
}
function years(person) {
  const b = person?.birth_date?.slice(0, 4) || '';
  const d = person?.death_date?.slice(0, 4) || '';
  if (b && d) return `${b}-${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return '';
}
function getPerson(id) { return state.peopleById.get(id) || null; }
function parentEdgesOf(personId) {
  return state.relationships.filter((r) => r.relationship_type === 'parent' && r.person2_id === personId)
    .map((relationship) => ({ relationship, person: getPerson(relationship.person1_id) })).filter((entry) => entry.person);
}
function parentPairOf(personId) {
  const candidates = parentEdgesOf(personId); const slots = [null, null]; const used = new Set();
  const father = candidates.findIndex((entry) => entry.person.gender === 'male');
  const mother = candidates.findIndex((entry) => entry.person.gender === 'female');
  if (father >= 0) { slots[0] = candidates[father]; used.add(father); }
  if (mother >= 0) { slots[1] = candidates[mother]; used.add(mother); }
  candidates.forEach((entry, index) => { if (!used.has(index)) { const open = slots.findIndex((slot) => slot === null); if (open >= 0) slots[open] = entry; } });
  return slots;
}
function childrenOf(personId) {
  return state.relationships.filter((r) => r.relationship_type === 'parent' && r.person1_id === personId)
    .map((r) => getPerson(r.person2_id)).filter(Boolean).sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999'));
}
function partnerEdgesOf(personId) {
  return state.relationships.filter((r) => ['spouse', 'partner', 'former_spouse'].includes(r.relationship_type) && (r.person1_id === personId || r.person2_id === personId))
    .map((relationship) => ({ relationship, person: getPerson(relationship.person1_id === personId ? relationship.person2_id : relationship.person1_id) })).filter((entry) => entry.person);
}
function currentPartnerEntry(personId) {
  return preferredFamilyPartnerEntry(partnerEdgesOf(personId));
}
function siblingsOf(personId) {
  const ids = new Set(); const parentIds = parentEdgesOf(personId).map((entry) => entry.person.id);
  state.relationships.forEach((r) => {
    if (r.relationship_type === 'sibling' && (r.person1_id === personId || r.person2_id === personId)) ids.add(r.person1_id === personId ? r.person2_id : r.person1_id);
    if (r.relationship_type === 'parent' && parentIds.includes(r.person1_id) && r.person2_id !== personId) ids.add(r.person2_id);
  });
  return [...ids].map(getPerson).filter(Boolean).sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999'));
}
function coupleChildren(person, partner) {
  if (!partner) return childrenOf(person.id);
  const a = new Set(childrenOf(person.id).map((child) => child.id)); const b = new Set(childrenOf(partner.id).map((child) => child.id));
  const shared = [...a].filter((id) => b.has(id)).map(getPerson).filter(Boolean);
  if (shared.length) return shared.sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
  return [...new Set([...a, ...b])].map(getPerson).filter(Boolean).sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
}
function evidenceClass(status) { return status === 'hypothesis' ? ' is-hypothesis' : status === 'probable' ? ' is-probable' : ''; }
function personCard(person, { compact = false, relationStatus = '', role = '' } = {}) {
  if (!person) return '<div class="snapshot-person-card is-empty"><span>Unknown</span></div>';
  const known = approvedKnownAs(person); const pending = person.is_pending || String(person.id).startsWith('pending:');
  return `<button type="button" class="snapshot-person-card${compact ? ' is-compact' : ''}${evidenceClass(relationStatus)}${pending ? ' is-pending' : ''}" data-snapshot-person="${esc(person.id)}">${role ? `<span class="snapshot-role">${esc(role)}</span>` : ''}<strong>${esc(canonicalName(person))}</strong>${known ? `<span class="snapshot-known">known as ${esc(known)}</span>` : ''}${years(person) ? `<span>${esc(years(person))}</span>` : ''}${pending ? '<span class="snapshot-badge">Pending review</span>' : relationStatus === 'probable' ? '<span class="snapshot-badge subtle">Probable</span>' : relationStatus === 'hypothesis' ? '<span class="snapshot-badge subtle">Hypothesis</span>' : ''}</button>`;
}
function partnerLabel(entry) { return entry?.relationship?.relationship_type === 'partner' ? 'Partner' : 'Spouse'; }
function coupleCard(person, partnerEntry, focus = false) {
  const partner = partnerEntry?.person || null;
  return `<div class="snapshot-couple${focus ? ' is-focus' : ''}">${personCard(person, { role: focus ? 'Selected' : '' })}${partner ? `<span class="snapshot-couple-link"></span>${personCard(partner, { role: partnerLabel(partnerEntry) })}` : ''}</div>`;
}
function lineageBranch(person, heading) {
  const parents = parentPairOf(person.id);
  return `<section class="snapshot-lineage-branch"><p class="snapshot-branch-title">${esc(heading)}</p><div class="snapshot-parent-columns">${parents.map((parentEntry) => {
    const parent = parentEntry?.person || null; const grandparents = parent ? parentPairOf(parent.id) : [null, null];
    return `<div class="snapshot-parent-column"><div class="snapshot-grandparents">${grandparents.map((grand) => personCard(grand?.person || null, { compact: true, relationStatus: grand?.relationship?.source_status || '' })).join('')}</div><span class="snapshot-downline"></span>${personCard(parent, { relationStatus: parentEntry?.relationship?.source_status || '', role: 'Parent' })}</div>`;
  }).join('')}</div></section>`;
}
function miniChildList(person, partner) {
  const children = coupleChildren(person, partner);
  return children.length ? `<div class="snapshot-mini-children">${children.map((child) => personCard(child, { compact: true })).join('')}</div>` : '<div class="snapshot-mini-empty">No children recorded</div>';
}
function siblingFamily(person) { const partnerEntry = currentPartnerEntry(person.id); return `<article class="snapshot-family-cluster">${coupleCard(person, partnerEntry)}<div class="snapshot-cluster-stem"></div>${miniChildList(person, partnerEntry?.person || null)}</article>`; }
function descendantFamily(person) {
  const partnerEntry = currentPartnerEntry(person.id); const grandchildren = coupleChildren(person, partnerEntry?.person || null);
  return `<article class="snapshot-family-cluster descendant-cluster">${coupleCard(person, partnerEntry)}${grandchildren.length ? `<div class="snapshot-cluster-stem"></div><div class="snapshot-mini-children">${grandchildren.map((child) => personCard(child, { compact: true })).join('')}</div>` : '<div class="snapshot-mini-empty">No children recorded</div>'}</article>`;
}
function installStyles() {
  if (document.getElementById('familySnapshotStyles')) return;
  const style = document.createElement('style'); style.id = 'familySnapshotStyles';
  style.textContent = `.tree-perspective-switch{display:flex;gap:6px;margin:10px 0 14px;padding:4px;border-radius:12px;background:#efe7dc;width:max-content}.tree-perspective-switch button{border:0;background:transparent;color:#65584d;border-radius:9px;padding:8px 11px;font:inherit;font-size:11px;font-weight:700;cursor:pointer}.tree-perspective-switch button[aria-pressed="true"]{background:#fffaf2;color:#3f3329;box-shadow:0 1px 5px rgba(66,49,35,.14)}.tree-panel.snapshot-active .enhanced-tree-controls{opacity:.34;pointer-events:none}.snapshot-scroll{overflow-x:auto;padding-bottom:8px}.family-snapshot{padding:8px 2px 18px;min-width:820px}.snapshot-section-label{text-align:center;margin:2px 0 10px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:#8a7563}.snapshot-ancestry{display:grid;grid-template-columns:1fr 1fr;gap:18px}.snapshot-lineage-branch{border:1px solid rgba(89,72,57,.13);border-radius:16px;padding:12px;background:rgba(255,250,242,.72)}.snapshot-branch-title{text-align:center;margin:0 0 10px;font-size:10px;font-weight:800;color:#645448}.snapshot-parent-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.snapshot-parent-column{display:flex;flex-direction:column;align-items:center}.snapshot-grandparents{display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%}.snapshot-downline,.snapshot-cluster-stem{display:block;width:1px;height:13px;background:#a89482}.snapshot-hourglass-neck{width:1px;height:24px;background:#9e8876;margin:0 auto}.snapshot-waist{border-top:1px solid rgba(96,77,61,.18);border-bottom:1px solid rgba(96,77,61,.18);padding:14px 8px;background:rgba(245,238,228,.42)}.snapshot-waist-row,.snapshot-descendant-grid{display:flex;gap:12px;align-items:flex-start;justify-content:center}.snapshot-siblings-wrap{display:flex;gap:10px}.snapshot-focus-wrap{min-width:300px}.snapshot-family-cluster{min-width:190px;max-width:250px;text-align:center}.snapshot-couple{display:flex;justify-content:center;align-items:center;gap:5px}.snapshot-couple.is-focus{padding:8px;border:2px solid rgba(84,65,49,.42);border-radius:18px;background:#fffaf2;box-shadow:0 5px 18px rgba(70,52,38,.12)}.snapshot-couple-link{width:14px;height:1px;background:#8f7966}.snapshot-person-card{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:118px;max-width:160px;min-height:58px;padding:8px 9px;border:1px solid rgba(89,72,57,.24);border-radius:12px;background:#fffaf2;color:#3f3329;text-align:center;font:inherit;cursor:pointer}.snapshot-person-card strong{font-size:10.5px;line-height:1.18}.snapshot-person-card span{font-size:8.5px;color:#77695d}.snapshot-person-card.is-compact{min-width:0;width:100%;min-height:48px;padding:6px}.snapshot-person-card.is-compact strong{font-size:9px}.snapshot-person-card.is-empty{border-style:dashed;background:rgba(238,233,226,.36);color:#9c9086;cursor:default}.snapshot-person-card.is-probable,.snapshot-person-card.is-hypothesis{border-style:dashed}.snapshot-person-card.is-hypothesis{opacity:.68}.snapshot-person-card.is-pending{outline:2px solid rgba(166,112,54,.32);background:#fff7e8}.snapshot-role{font-size:7.5px!important;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.snapshot-known{font-style:italic}.snapshot-badge{margin-top:3px;padding:2px 5px;border-radius:999px;background:#f0dcb9;color:#77542c!important;font-weight:700}.snapshot-badge.subtle{background:#eee3d6}.snapshot-mini-children{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:6px}.snapshot-mini-empty{font-size:8.5px;color:#95887c;padding:5px}.snapshot-descendants{padding:14px 6px 2px}.descendant-cluster{min-width:220px}.snapshot-note{text-align:center;font-size:9px;color:#817366;margin:8px auto 0;max-width:720px}.snapshot-selected-label{text-align:center;font-size:10px;font-weight:800;color:#5d4c3e;margin:0 0 7px}@media(max-width:900px){.family-snapshot{min-width:760px}.snapshot-waist-row,.snapshot-descendant-grid{justify-content:flex-start}}`;
  document.head.appendChild(style);
}
function installSwitch() {
  if (!ui.treePanel || document.getElementById('treePerspectiveSwitch')) return;
  const switcher = document.createElement('div'); switcher.id = 'treePerspectiveSwitch'; switcher.className = 'tree-perspective-switch';
  switcher.innerHTML = '<button type="button" data-tree-perspective="fan" aria-pressed="true">Where do I come from?</button><button type="button" data-tree-perspective="snapshot" aria-pressed="false">How does our family look?</button>';
  ui.treePanel.insertBefore(switcher, ui.treeStatus || ui.treePanel.firstChild);
  switcher.addEventListener('click', (event) => { const button = event.target.closest('[data-tree-perspective]'); if (button) setPerspective(button.dataset.treePerspective); });
}
function setPerspective(value) {
  state.active = value === 'snapshot';
  document.querySelectorAll('[data-tree-perspective]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.treePerspective === value)));
  ui.treePanel?.classList.toggle('snapshot-active', state.active);
  const title = ui.panelHead?.querySelector('h2'); if (title) title.textContent = state.active ? 'Family snapshot' : 'Family fan';
  if (state.active) renderSnapshot().catch((error) => { if (ui.treeStatus) ui.treeStatus.textContent = error.message || 'Unable to build family snapshot.'; });
  else document.getElementById('treeViewMode')?.dispatchEvent(new Event('change', { bubbles: true }));
}
async function loadData() {
  const [peopleResult, relationshipResult] = await Promise.all([
    supabase.from('people').select('id, given_names, surname, preferred_name, preferred_name_status, gender, birth_date, death_date, source_status, is_active'),
    supabase.from('relationships').select('*'),
  ]);
  if (peopleResult.error) throw peopleResult.error; if (relationshipResult.error) throw relationshipResult.error;
  state.people = peopleResult.data || []; state.relationships = relationshipResult.data || []; state.peopleById = new Map(state.people.map((person) => [person.id, person]));
}
async function renderSnapshot() {
  if (!state.active || !ui.centreSelect?.value || !ui.treeCanvas) return;
  await loadData(); const focus = getPerson(ui.centreSelect.value); if (!focus) throw new Error('The selected person is not available in this family snapshot.');
  const partnerEntry = currentPartnerEntry(focus.id); const partner = partnerEntry?.person || null; const siblings = siblingsOf(focus.id); const mid = Math.ceil(siblings.length / 2); const children = coupleChildren(focus, partner);
  const ancestry = `<div class="snapshot-ancestry">${lineageBranch(focus, `${canonicalName(focus)} - parents and grandparents`)}${partner ? lineageBranch(partner, `${canonicalName(partner)} - parents and grandparents`) : '<section class="snapshot-lineage-branch"><p class="snapshot-branch-title">Partner ancestry</p><div class="snapshot-mini-empty">No partner is currently linked.</div></section>'}</div>`;
  const waist = `<div class="snapshot-hourglass-neck"></div><section class="snapshot-waist"><p class="snapshot-section-label">Focus generation</p><div class="snapshot-waist-row"><div class="snapshot-siblings-wrap">${siblings.slice(0, mid).map(siblingFamily).join('')}</div><div class="snapshot-focus-wrap"><p class="snapshot-selected-label">${esc(canonicalName(focus))}${partner ? ` &amp; ${esc(canonicalName(partner))}` : ''}</p>${coupleCard(focus, partnerEntry, true)}</div><div class="snapshot-siblings-wrap">${siblings.slice(mid).map(siblingFamily).join('')}</div></div></section>`;
  const descendants = `<div class="snapshot-hourglass-neck"></div><section class="snapshot-descendants"><p class="snapshot-section-label">Children, partners and grandchildren</p>${children.length ? `<div class="snapshot-descendant-grid">${children.map(descendantFamily).join('')}</div>` : '<div class="snapshot-mini-empty">No children are currently recorded for this focus family.</div>'}</section>`;
  ui.treeCanvas.innerHTML = `<div class="snapshot-scroll"><div class="family-snapshot"><p class="snapshot-section-label">Parents and grandparents</p>${ancestry}${waist}${descendants}<p class="snapshot-note">This snapshot intentionally stops at grandparents above and grandchildren below. Select another person to rebuild the same view around them.</p></div></div>`;
  ui.treeCanvas.querySelectorAll('[data-snapshot-person]').forEach((button) => button.addEventListener('click', () => { const option = [...ui.centreSelect.options].find((item) => item.value === button.dataset.snapshotPerson); if (option) { ui.centreSelect.value = option.value; ui.centreSelect.dispatchEvent(new Event('change', { bubbles: true })); } }));
  if (ui.viewTitle) ui.viewTitle.textContent = partner ? `${canonicalName(focus)} & ${canonicalName(partner)} - family snapshot` : `${canonicalName(focus)} - family snapshot`;
  if (ui.viewSummary) ui.viewSummary.textContent = `Family snapshot: ancestors narrow toward ${canonicalName(focus)}${partner ? ` and ${canonicalName(partner)}` : ''}, siblings and their families sit at the same generation, and descendants expand below.`;
  if (ui.treeStatus) ui.treeStatus.textContent = `${siblings.length} sibling${siblings.length === 1 ? '' : 's'} and ${children.length} child${children.length === 1 ? '' : 'ren'} shown around the selected family.`;
}
installStyles(); installSwitch();
ui.centreSelect?.addEventListener('change', () => { if (state.active) setTimeout(() => renderSnapshot().catch(() => {}), 45); });
document.addEventListener('genealogy:tree-suggestions-updated', () => { if (state.active) setTimeout(() => renderSnapshot().catch(() => {}), 50); });
document.addEventListener('genealogy:known-as-updated', () => { if (state.active) setTimeout(() => renderSnapshot().catch(() => {}), 50); });
