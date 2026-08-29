import { supabase } from './supabase-client-v1.js';

const details = document.getElementById('personDetails');
const canvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const UNCERTAIN = new Set(['hypothesis', 'probable', 'unresolved']);
const RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };
const state = { people: new Map(), relationships: [], selectedId: null, loaded: false, timer: null, rendering: false };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

function name(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ') || 'Unknown';
}

function active(row) {
  return row?.is_active !== false;
}

function uncertain(status) {
  return UNCERTAIN.has(status || 'unresolved');
}

function weakest(a, b) {
  const aa = a || 'unresolved';
  const bb = b || 'unresolved';
  return (RANK[aa] || 0) <= (RANK[bb] || 0) ? aa : bb;
}

function childLinks(personId) {
  return state.relationships.filter((row) => active(row)
    && row.relationship_type === 'parent'
    && row.person1_id === personId);
}

function otherParentLinks(childId, selectedId) {
  return state.relationships
    .filter((row) => active(row)
      && row.relationship_type === 'parent'
      && row.person2_id === childId
      && row.person1_id !== selectedId)
    .sort((a, b) => (RANK[b.source_status] || 0) - (RANK[a.source_status] || 0));
}

function groupedChildren(personId) {
  const groups = new Map();
  childLinks(personId).forEach((selectedLink) => {
    const child = state.people.get(selectedLink.person2_id);
    if (!child) return;
    const others = otherParentLinks(child.id, personId);
    const otherLink = others[0] || null;
    const otherParent = otherLink ? state.people.get(otherLink.person1_id) : null;
    const status = otherLink ? weakest(selectedLink.source_status, otherLink.source_status) : (selectedLink.source_status || 'unresolved');
    const kind = uncertain(status) ? 'possible' : 'secure';
    const key = `${kind}:${otherParent?.id || 'unknown'}`;
    const current = groups.get(key) || { kind, otherParent, items: [] };
    current.items.push({ child, status });
    groups.set(key, current);
  });

  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((a, b) => (a.child.birth_date || '9999').localeCompare(b.child.birth_date || '9999') || name(a.child).localeCompare(name(b.child))),
  })).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'secure' ? -1 : 1;
    return name(a.otherParent).localeCompare(name(b.otherParent));
  });
}

function labelFor(group) {
  if (group.otherParent) {
    return group.kind === 'possible'
      ? `Possible children with ${name(group.otherParent)}`
      : `Children with ${name(group.otherParent)}`;
  }
  return group.kind === 'possible'
    ? 'Possible children — other parent not recorded'
    : 'Children — other parent not recorded';
}

function valueFor(group) {
  return group.items.map(({ child, status }) => {
    const suffix = group.kind === 'possible' ? ` (${String(status || 'unresolved').replaceAll('_', ' ')})` : '';
    return `${name(child)}${suffix}`;
  }).join(', ');
}

function relationshipSection() {
  return details?.querySelector('.relationship-evidence-details') || null;
}

function stripChildRows(section) {
  [...section.children].forEach((row) => {
    const label = row.querySelector('strong')?.textContent?.trim() || '';
    if (row.dataset.childPartnerGroup === '1'
      || label === 'Children'
      || label === 'Possible children'
      || label.startsWith('Children with ')
      || label.startsWith('Possible children with ')
      || label.startsWith('Children — ')
      || label.startsWith('Possible children — ')) row.remove();
  });
}

function insertBeforeSiblingRows(section, row) {
  const sibling = [...section.children].find((candidate) => {
    const label = candidate.querySelector('strong')?.textContent?.trim() || '';
    return label === 'Siblings' || label === 'Possible siblings';
  });
  if (sibling) section.insertBefore(row, sibling);
  else section.appendChild(row);
}

function render() {
  state.timer = null;
  if (!state.loaded || !state.selectedId || !details || state.rendering) return;
  const section = relationshipSection();
  if (!section) return;
  const groups = groupedChildren(state.selectedId);
  const signature = JSON.stringify(groups.map((group) => [
    group.kind,
    group.otherParent?.id || null,
    group.items.map((item) => [item.child.id, item.status]),
  ]));
  if (section.dataset.childPartnerSignature === signature && section.querySelector('[data-child-partner-group="1"]')) return;

  state.rendering = true;
  try {
    stripChildRows(section);
    groups.forEach((group) => {
      const row = document.createElement('div');
      row.className = 'detail-line';
      row.dataset.childPartnerGroup = '1';
      row.innerHTML = `<strong>${esc(labelFor(group))}</strong>${esc(valueFor(group))}`;
      insertBeforeSiblingRows(section, row);
    });
    section.dataset.childPartnerSignature = signature;
  } finally {
    state.rendering = false;
  }
}

function schedule(delay = 30) {
  clearTimeout(state.timer);
  state.timer = setTimeout(render, delay);
}

function selectedFromEvent(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest('.research-frontier-node')) return null;
  const node = target.closest('[data-person-id],[data-snapshot-person]');
  return node?.dataset?.personId || node?.dataset?.snapshotPerson || null;
}

async function load() {
  const [peopleResult, relationshipsResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,birth_date,is_active'),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,source_status,is_active'),
  ]);
  if (peopleResult.error || relationshipsResult.error) return;
  state.people = new Map((peopleResult.data || []).filter(active).map((person) => [person.id, person]));
  state.relationships = (relationshipsResult.data || []).filter(active);
  state.selectedId ||= centreSelect?.value || null;
  state.loaded = true;
  schedule(0);
}

canvas?.addEventListener('click', (event) => {
  const id = selectedFromEvent(event);
  if (!id) return;
  state.selectedId = id;
  schedule(40);
}, true);

canvas?.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const id = selectedFromEvent(event);
  if (!id) return;
  state.selectedId = id;
  schedule(40);
}, true);

centreSelect?.addEventListener('change', () => {
  state.selectedId = centreSelect.value || null;
  schedule(100);
});

if (details) {
  new MutationObserver(() => {
    if (!state.rendering) schedule(25);
  }).observe(details, { childList: true, subtree: true });
}

document.addEventListener('genealogy:tree-suggestions-updated', () => load());
document.addEventListener('genealogy:research-frontier-changed', () => load());

supabase.auth.onAuthStateChange((_event, session) => { if (session) load().catch(() => {}); });
const { data: { session } } = await supabase.auth.getSession();
if (session) await load();
