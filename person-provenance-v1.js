import { supabase } from './supabase-client-v1.js';

const personDetails = document.getElementById('personDetails');
const personName = document.getElementById('personName');
const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const contributionType = document.getElementById('contributionType');
const state = { session: null, selectedId: null, renderToken: 0, timer: null };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

const ACTIVITY_LABEL = {
  information_supplied: 'Information supplied by',
  correction_suggested: 'Correction suggested by',
  research: 'Research by',
  record_supplied: 'Record or source supplied by',
  photo_added: 'Photo added by',
  relationship_supplied: 'Family relationship information supplied by',
  other: 'Contribution by',
};

function installResearchContributionType() {
  if (!contributionType || [...contributionType.options].some((option) => option.value === 'research')) return;
  const option = document.createElement('option');
  option.value = 'research';
  option.textContent = 'Research finding';
  const source = [...contributionType.options].find((item) => item.value === 'source');
  if (source) contributionType.insertBefore(option, source);
  else contributionType.appendChild(option);
}

function clickedPersonId(event) {
  const node = event.target.closest?.('[data-person-id], [data-snapshot-person]');
  if (!node) return null;
  return node.dataset.personId || node.dataset.snapshotPerson || null;
}

function groupedRows(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = `${row.activity_type}|${row.contributor_label}`;
    const current = groups.get(key) || { ...row, count: 0, latest: row.occurred_at };
    current.count += 1;
    if ((row.occurred_at || '') > (current.latest || '')) current.latest = row.occurred_at;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a,b) => String(b.latest || '').localeCompare(String(a.latest || '')));
}

function renderRows(rows) {
  const grouped = groupedRows(rows);
  if (!grouped.length) return '';
  return grouped.map((row) => {
    const label = ACTIVITY_LABEL[row.activity_type] || ACTIVITY_LABEL.other;
    const count = row.count > 1 ? `<span class="provenance-count">${row.count} contributions</span>` : '';
    return `<div class="provenance-row"><span><strong>${esc(label)}</strong> ${esc(row.contributor_label)}</span>${count}</div>`;
  }).join('');
}

async function renderProvenance() {
  if (!state.session || !personDetails || !state.selectedId || String(state.selectedId).startsWith('pending:')) {
    personDetails?.querySelector('.person-provenance')?.remove();
    return;
  }
  const token = ++state.renderToken;
  const { data, error } = await supabase
    .from('person_provenance')
    .select('id,activity_type,contributor_label,note,occurred_at')
    .eq('person_id', state.selectedId)
    .order('occurred_at', { ascending: false });
  if (token !== state.renderToken) return;
  if (error || !(data || []).length) {
    personDetails.querySelector('.person-provenance')?.remove();
    return;
  }

  const existing = personDetails.querySelector('.person-provenance');
  const section = existing || document.createElement('section');
  section.className = 'person-provenance';
  section.innerHTML = `<div class="provenance-heading">Contributors and research</div><p class="provenance-intro">This acknowledgement is cumulative. Later contributions do not replace earlier contributors.</p>${renderRows(data)}`;
  if (!existing) personDetails.appendChild(section);
}

function schedule(delay = 20) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => renderProvenance().catch(() => {}), delay);
}

function installStyles() {
  if (document.getElementById('personProvenanceStyles')) return;
  const style = document.createElement('style');
  style.id = 'personProvenanceStyles';
  style.textContent = `
    .person-provenance{margin-top:14px;padding-top:11px;border-top:1px solid rgba(91,72,55,.14);display:grid;gap:6px}
    .provenance-heading{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#806f60}
    .provenance-intro{margin:0 0 2px;font-size:.72rem;line-height:1.4;color:#796f65}
    .provenance-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:5px 0;font-size:.78rem;line-height:1.4;color:#51483f}
    .provenance-row strong{font-weight:700;color:#65594e}.provenance-count{flex:0 0 auto;font-size:.66rem;color:#84776b}
  `;
  document.head.appendChild(style);
}

async function start(session) {
  if (!session || !personDetails) return;
  state.session = session;
  installStyles();
  installResearchContributionType();
  state.selectedId = centreSelect?.value || state.selectedId;
  schedule(70);
}

treeCanvas?.addEventListener('click', (event) => {
  const id = clickedPersonId(event);
  if (!id) return;
  state.selectedId = id;
  schedule(20);
}, true);

treeCanvas?.addEventListener('keydown', (event) => {
  if (!['Enter',' '].includes(event.key)) return;
  const id = clickedPersonId(event);
  if (!id) return;
  state.selectedId = id;
  schedule(20);
}, true);

centreSelect?.addEventListener('change', () => {
  state.selectedId = centreSelect.value || null;
  schedule(80);
});

if (personDetails) {
  const observer = new MutationObserver((mutations) => {
    const external = mutations.some((m) => [...m.addedNodes, ...m.removedNodes].some((node) => !(node instanceof Element) || !node.classList.contains('person-provenance')));
    if (external) schedule(30);
  });
  observer.observe(personDetails, { childList:true, subtree:false });
}

personName && new MutationObserver(() => schedule(30)).observe(personName, { childList:true, subtree:true, characterData:true });
document.addEventListener('genealogy:tree-suggestions-updated', () => schedule(50));
document.addEventListener('genealogy:provenance-updated', () => schedule(20));

installResearchContributionType();
supabase.auth.onAuthStateChange((_event, session) => { if (session) start(session).catch(() => {}); });
const { data:{ session } } = await supabase.auth.getSession();
if (session) await start(session);
