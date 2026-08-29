import { supabase } from './supabase-client-v1.js';

const canvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const personDetails = document.getElementById('personDetails');
const UNCERTAIN = new Set(['hypothesis', 'probable', 'unresolved']);
const SOURCE_RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };
const state = {
  people: new Map(),
  relationships: [],
  selectedId: null,
  loaded: false,
  renderingDetails: false,
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ') || 'Unknown';
}

function sourceLabel(value) {
  return String(value || 'unresolved').replaceAll('_', ' ');
}

function getPerson(id) {
  return state.people.get(id) || null;
}

function activeRelationship(relationship) {
  return relationship?.is_active !== false;
}

function uncertain(status) {
  return UNCERTAIN.has(status || 'unresolved');
}

function parentEntries(personId) {
  return state.relationships
    .filter((relationship) => activeRelationship(relationship)
      && relationship.relationship_type === 'parent'
      && relationship.person2_id === personId)
    .map((relationship) => ({ relationship, person: getPerson(relationship.person1_id) }))
    .filter((entry) => entry.person)
    .sort((a, b) => (SOURCE_RANK[b.relationship.source_status] || 0) - (SOURCE_RANK[a.relationship.source_status] || 0));
}

function childEntries(personId) {
  return state.relationships
    .filter((relationship) => activeRelationship(relationship)
      && relationship.relationship_type === 'parent'
      && relationship.person1_id === personId)
    .map((relationship) => ({ relationship, person: getPerson(relationship.person2_id) }))
    .filter((entry) => entry.person)
    .sort((a, b) => (a.person.birth_date || '9999').localeCompare(b.person.birth_date || '9999'));
}

function siblingStatus(personId, siblingId) {
  const explicit = state.relationships
    .filter((relationship) => activeRelationship(relationship)
      && relationship.relationship_type === 'sibling'
      && ((relationship.person1_id === personId && relationship.person2_id === siblingId)
        || (relationship.person1_id === siblingId && relationship.person2_id === personId)))
    .sort((a, b) => (SOURCE_RANK[b.source_status] || 0) - (SOURCE_RANK[a.source_status] || 0));
  if (explicit.length) return explicit[0].source_status || 'unresolved';

  const ownParents = new Map(parentEntries(personId).map((entry) => [entry.person.id, entry.relationship]));
  const siblingParents = new Map(parentEntries(siblingId).map((entry) => [entry.person.id, entry.relationship]));
  const shared = [...ownParents.keys()].filter((id) => siblingParents.has(id));
  if (!shared.length) return 'unresolved';
  return shared.map((parentId) => {
    const a = ownParents.get(parentId)?.source_status || 'unresolved';
    const b = siblingParents.get(parentId)?.source_status || 'unresolved';
    return (SOURCE_RANK[a] || 0) <= (SOURCE_RANK[b] || 0) ? a : b;
  }).sort((a, b) => (SOURCE_RANK[b] || 0) - (SOURCE_RANK[a] || 0))[0] || 'unresolved';
}

function siblingEntries(personId) {
  const ids = new Set();
  const parentIds = new Set(parentEntries(personId).map((entry) => entry.person.id));
  state.relationships.forEach((relationship) => {
    if (!activeRelationship(relationship)) return;
    if (relationship.relationship_type === 'sibling'
      && (relationship.person1_id === personId || relationship.person2_id === personId)) {
      ids.add(relationship.person1_id === personId ? relationship.person2_id : relationship.person1_id);
    }
    if (relationship.relationship_type === 'parent'
      && parentIds.has(relationship.person1_id)
      && relationship.person2_id !== personId) {
      ids.add(relationship.person2_id);
    }
  });
  return [...ids].map((id) => ({ person: getPerson(id), sourceStatus: siblingStatus(personId, id) }))
    .filter((entry) => entry.person)
    .sort((a, b) => canonicalName(a.person).localeCompare(canonicalName(b.person)));
}

function splitEvidence(entries, statusGetter) {
  return entries.reduce((groups, entry) => {
    const status = statusGetter(entry) || 'unresolved';
    (uncertain(status) ? groups.uncertain : groups.secure).push({ ...entry, evidenceStatus: status });
    return groups;
  }, { secure: [], uncertain: [] });
}

function names(entries, showStatus = false) {
  return entries.map((entry) => `${canonicalName(entry.person)}${showStatus ? ` (${sourceLabel(entry.evidenceStatus)})` : ''}`).join(', ');
}

function directDetailRows() {
  return [...personDetails?.children || []].filter((node) => node.classList?.contains('detail-line'));
}

function removeBaseRelationshipRows() {
  directDetailRows().forEach((row) => {
    const label = row.querySelector('strong')?.textContent?.trim();
    if (['Children', 'Siblings', 'Parents', 'Possible parents', 'Possible children', 'Possible siblings'].includes(label)) row.remove();
  });
}

function relationshipSection(personId) {
  const parents = splitEvidence(parentEntries(personId), (entry) => entry.relationship.source_status);
  const children = splitEvidence(childEntries(personId), (entry) => entry.relationship.source_status);
  const siblings = splitEvidence(siblingEntries(personId), (entry) => entry.sourceStatus);
  const rows = [];

  if (parents.secure.length) rows.push(['Parents', names(parents.secure)]);
  if (parents.uncertain.length) rows.push(['Possible parents', names(parents.uncertain, true)]);
  if (children.secure.length) rows.push(['Children', names(children.secure)]);
  if (children.uncertain.length) rows.push(['Possible children', names(children.uncertain, true)]);
  if (siblings.secure.length) rows.push(['Siblings', names(siblings.secure)]);
  if (siblings.uncertain.length) rows.push(['Possible siblings', names(siblings.uncertain, true)]);
  if (!rows.length) return null;

  const section = document.createElement('div');
  section.className = 'relationship-evidence-details';
  section.innerHTML = rows.map(([label, value]) => `<div class="detail-line"><strong>${esc(label)}</strong>${esc(value)}</div>`).join('');
  return section;
}

function postProcessDetails() {
  if (!state.loaded || !state.selectedId || !personDetails || state.renderingDetails) return;
  if (!getPerson(state.selectedId)) return;
  state.renderingDetails = true;
  try {
    removeBaseRelationshipRows();
    personDetails.querySelector('.relationship-evidence-details')?.remove();
    const section = relationshipSection(state.selectedId);
    if (section) personDetails.appendChild(section);
  } finally {
    state.renderingDetails = false;
  }
}

function uncertainParentLinks(personId) {
  return childEntries(personId).filter((entry) => uncertain(entry.relationship.source_status));
}

function closeDialog() {
  document.getElementById('relationshipEvidenceBackdrop')?.remove();
}

function roleFor(person) {
  if (person?.gender === 'male') return 'father';
  if (person?.gender === 'female') return 'mother';
  return 'parent';
}

function showUncertainty(personId) {
  const person = getPerson(personId);
  if (!person) return;
  const links = uncertainParentLinks(personId);
  if (!links.length) return;
  closeDialog();

  const backdrop = document.createElement('div');
  backdrop.id = 'relationshipEvidenceBackdrop';
  backdrop.className = 'relationship-evidence-backdrop';
  backdrop.innerHTML = `<section class="relationship-evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="relationshipEvidenceTitle">
    <header class="relationship-evidence-head">
      <div><p class="relationship-evidence-kicker">Evidence boundary</p><h3 id="relationshipEvidenceTitle">Why is there a question mark here?</h3></div>
      <button type="button" class="relationship-evidence-close" aria-label="Close explanation">x</button>
    </header>
    <div class="relationship-evidence-body">
      <p class="relationship-evidence-intro">The question mark does not mean that ${esc(canonicalName(person))} is imaginary. It marks an uncertain family link that we are still trying to prove from original records.</p>
      ${links.map(({ relationship, person: child }) => `<section class="relationship-evidence-card">
        <h4>${esc(canonicalName(person))}</h4>
        <div class="relationship-evidence-row"><strong>Working link</strong><span>Possible ${esc(roleFor(person))} of ${esc(canonicalName(child))}</span></div>
        <div class="relationship-evidence-row"><strong>Status</strong><span>${esc(sourceLabel(relationship.source_status))}</span></div>
        ${relationship.notes ? `<div class="relationship-evidence-row"><strong>Evidence boundary</strong><span>${esc(relationship.notes)}</span></div>` : ''}
        <div class="relationship-evidence-row"><strong>What would settle it?</strong><span>An original parent-naming record, such as a birth or baptism entry, estate/death notice, or another comparably direct record that confirms or excludes the relationship.</span></div>
      </section>`).join('')}
      ${person.narrative_summary ? `<p class="relationship-evidence-foot">${esc(person.narrative_summary)}</p>` : ''}
    </div>
  </section>`;
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeDialog(); });
  backdrop.querySelector('.relationship-evidence-close')?.addEventListener('click', closeDialog);
  document.body.appendChild(backdrop);
  backdrop.querySelector('.relationship-evidence-close')?.focus();
}

function markerHost(node) {
  return node.querySelector('.fan-marker-host') || node;
}

function decorateFanNode(node, personId) {
  const links = uncertainParentLinks(personId);
  const existing = node.querySelector('.relationship-uncertainty-marker');
  if (!links.length) { existing?.remove(); return; }
  if (existing) return;

  const ns = 'http://www.w3.org/2000/svg';
  const marker = document.createElementNS(ns, 'g');
  marker.classList.add('relationship-uncertainty-marker');
  marker.setAttribute('tabindex', '0');
  marker.setAttribute('role', 'button');
  marker.setAttribute('aria-label', `Explain uncertain family link for ${canonicalName(getPerson(personId))}`);

  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '0');
  circle.setAttribute('cy', '18');
  circle.setAttribute('r', '8');
  const text = document.createElementNS(ns, 'text');
  text.setAttribute('x', '0');
  text.setAttribute('y', '21');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('pointer-events', 'none');
  text.textContent = '?';
  marker.append(circle, text);

  const activate = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    showUncertainty(personId);
  };
  marker.addEventListener('click', activate);
  marker.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
  markerHost(node).appendChild(marker);
}

function decorateSnapshotCard(card, personId) {
  const links = uncertainParentLinks(personId);
  const existing = card.querySelector('.relationship-uncertainty-html-marker');
  if (!links.length) { existing?.remove(); return; }
  if (existing) return;
  const marker = document.createElement('span');
  marker.className = 'relationship-uncertainty-html-marker';
  marker.setAttribute('role', 'button');
  marker.setAttribute('tabindex', '0');
  marker.setAttribute('aria-label', `Explain uncertain family link for ${canonicalName(getPerson(personId))}`);
  marker.textContent = '?';
  const activate = (event) => {
    event.preventDefault();
    event.stopPropagation();
    showUncertainty(personId);
  };
  marker.addEventListener('click', activate);
  marker.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
  card.appendChild(marker);
}

function decorateTree() {
  if (!state.loaded || !canvas) return;
  canvas.querySelectorAll('.person-node[data-person-id]').forEach((node) => decorateFanNode(node, node.dataset.personId));
  canvas.querySelectorAll('[data-snapshot-person]').forEach((card) => decorateSnapshotCard(card, card.dataset.snapshotPerson));
}

function installStyles() {
  if (document.getElementById('relationshipEvidenceStyles')) return;
  const style = document.createElement('style');
  style.id = 'relationshipEvidenceStyles';
  style.textContent = `
    .relationship-evidence-details{display:contents}
    .relationship-uncertainty-marker{cursor:pointer;outline:none}
    .relationship-uncertainty-marker circle{fill:#7f735f;stroke:#554b3d;stroke-width:1.2;stroke-dasharray:3 2}
    .relationship-uncertainty-marker text{fill:#fff;font:800 10px Arial,sans-serif}
    .relationship-uncertainty-marker:hover circle,.relationship-uncertainty-marker:focus circle{stroke:#2f2922;stroke-width:2;filter:drop-shadow(0 1px 2px rgba(0,0,0,.2))}
    .snapshot-person-card{position:relative}
    .relationship-uncertainty-html-marker{position:absolute;top:4px;right:5px;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#7f735f;color:#fff!important;border:1px dashed #554b3d;font:800 11px/1 Arial,sans-serif;cursor:pointer}
    .relationship-evidence-backdrop{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;padding:20px;background:rgba(44,36,30,.38);backdrop-filter:blur(2px)}
    .relationship-evidence-dialog{width:min(650px,calc(100vw - 32px));max-height:min(80vh,780px);overflow:auto;border:1px solid #d6c8ba;border-radius:18px;background:#fffdf9;box-shadow:0 22px 60px rgba(43,31,23,.24);color:#3f342b}
    .relationship-evidence-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:18px 20px 12px;border-bottom:1px solid #eadfd4}
    .relationship-evidence-kicker{margin:0 0 4px;color:#7f7165;font:800 9px/1.1 Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase}
    .relationship-evidence-head h3{margin:0;font-size:22px;line-height:1.15}
    .relationship-evidence-close{border:0;background:#f0e6da;color:#5f5146;border-radius:999px;width:32px;height:32px;font:800 15px/1 Arial,sans-serif;cursor:pointer}
    .relationship-evidence-body{display:grid;gap:12px;padding:16px 20px 20px}
    .relationship-evidence-intro{margin:0;padding:11px 12px;border-radius:12px;background:#f3eee8;color:#665a50;font-size:13px;line-height:1.45}
    .relationship-evidence-card{padding:13px 14px;border:1px solid #e4d9cd;border-radius:13px;background:#fffaf3}
    .relationship-evidence-card h4{margin:0 0 7px;font-size:15px}
    .relationship-evidence-row{display:grid;grid-template-columns:126px 1fr;gap:10px;padding:5px 0;font-size:12px;line-height:1.42}
    .relationship-evidence-row strong{color:#75675b}.relationship-evidence-row span{color:#41372f}
    .relationship-evidence-foot{margin:0;color:#7f7165;font-size:11px;line-height:1.5}
    @media(max-width:560px){.relationship-evidence-row{grid-template-columns:1fr;gap:2px}.relationship-evidence-head h3{font-size:19px}}
  `;
  document.head.appendChild(style);
}

function selectedFromEvent(event) {
  const node = event.target.closest?.('[data-person-id],[data-snapshot-person]');
  return node?.dataset?.personId || node?.dataset?.snapshotPerson || null;
}

async function load() {
  const [peopleResult, relationshipResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,gender,birth_date,source_status,narrative_summary,is_active'),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,source_status,notes,is_active'),
  ]);
  if (peopleResult.error || relationshipResult.error) return;
  state.people = new Map((peopleResult.data || []).filter((person) => person.is_active !== false).map((person) => [person.id, person]));
  state.relationships = (relationshipResult.data || []).filter(activeRelationship);
  state.loaded = true;
  state.selectedId = state.selectedId || centreSelect?.value || null;
  installStyles();
  window.setTimeout(() => { decorateTree(); postProcessDetails(); }, 0);
}

canvas?.addEventListener('click', (event) => {
  const id = selectedFromEvent(event);
  if (!id) return;
  state.selectedId = id;
  window.setTimeout(postProcessDetails, 20);
}, true);

centreSelect?.addEventListener('change', () => {
  state.selectedId = centreSelect.value || null;
  window.setTimeout(() => { decorateTree(); postProcessDetails(); }, 70);
});

if (canvas) {
  const observer = new MutationObserver(() => window.setTimeout(decorateTree, 0));
  observer.observe(canvas, { childList: true, subtree: true });
}

if (personDetails) {
  const observer = new MutationObserver(() => {
    if (!state.renderingDetails) window.setTimeout(postProcessDetails, 15);
  });
  observer.observe(personDetails, { childList: true, subtree: false });
}

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDialog(); });
document.addEventListener('genealogy:tree-suggestions-updated', () => load());
document.addEventListener('genealogy:research-frontier-changed', () => load());

supabase.auth.onAuthStateChange((_event, session) => { if (session) load(); });
const { data: { session } } = await supabase.auth.getSession();
if (session) await load();
