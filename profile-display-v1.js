import { supabase } from './supabase-client-v1.js';


const personDetails = document.getElementById('personDetails');
const personName = document.getElementById('personName');
const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const HISTORY_LABELS = {
  south_african_war: 'South African War / Anglo-Boer War',
  first_world_war: 'First World War',
  second_world_war: 'Second World War',
};
const state = { session: null, selectedId: null, people: new Map(), refreshTimer: null, rendering: false };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function human(value) {
  return String(value || '').replaceAll('_', ' ');
}

function historyItems(context = {}) {
  const rows = [];
  Object.entries(context || {}).forEach(([key, entry]) => {
    if (!entry || typeof entry !== 'object') return;
    const label = HISTORY_LABELS[key] || human(key);
    if (entry.status === 'no_known_information') {
      rows.push([label, 'No information currently known']);
      return;
    }
    if (entry.status === 'known') {
      const parts = [];
      if (entry.details) parts.push(entry.details);
      if (entry.concentration_camp) parts.push(`Concentration camp: ${entry.concentration_camp}`);
      rows.push([label, parts.join(' | ') || 'Family information recorded; details not yet supplied']);
    }
  });
  return rows;
}

async function loadPeople() {
  const { data, error } = await supabase.from('people').select('id, life_status, residence_summary, final_rest_type, final_rest_place, military_service_summary, historical_context');
  if (error) throw error;
  state.people = new Map((data || []).map((person) => [person.id, person]));
}

async function pendingPerson(id) {
  if (!String(id || '').startsWith('pending:')) return null;
  const changeId = String(id).slice('pending:'.length);
  const { data, error } = await supabase.from('tree_change_sets').select('id, payload, status').eq('id', changeId).maybeSingle();
  if (error || !data || data.status !== 'pending') return null;
  const relative = data.payload?.relative || {};
  return {
    id,
    life_status: relative.life_status || 'unknown',
    residence_summary: relative.residence_summary || null,
    final_rest_type: relative.final_rest_type || null,
    final_rest_place: relative.final_rest_place || null,
    military_service_summary: relative.military_service_summary || null,
    historical_context: relative.historical_context || {},
  };
}

function hasExtraData(person) {
  return Boolean(person && (
    person.residence_summary || person.final_rest_type || person.final_rest_place ||
    person.military_service_summary || Object.keys(person.historical_context || {}).length
  ));
}

function renderRows(person) {
  const rows = [];
  if (person.residence_summary) rows.push(['Lived', person.residence_summary]);
  if (person.final_rest_type || person.final_rest_place) {
    const rest = [human(person.final_rest_type), person.final_rest_place].filter(Boolean).join(' - ');
    if (rest) rows.push(['Final resting place', rest]);
  }
  if (person.military_service_summary) rows.push(['Military / other service', person.military_service_summary]);
  rows.push(...historyItems(person.historical_context).map(([label, value]) => [`Historical context - ${label}`, value]));
  return rows;
}

async function appendExtraDetails() {
  if (!state.session || !personDetails || !state.selectedId || state.rendering) return;
  state.rendering = true;
  try {
    const existing = personDetails.querySelector('.expanded-profile-details');
    let person = state.people.get(state.selectedId) || null;
    if (!person && String(state.selectedId).startsWith('pending:')) person = await pendingPerson(state.selectedId);
    if (!hasExtraData(person)) {
      existing?.remove();
      return;
    }
    const rows = renderRows(person);
    if (!rows.length) {
      existing?.remove();
      return;
    }
    const signature = JSON.stringify({ personId: state.selectedId, rows });
    if (existing?.dataset.profileSignature === signature) return;
    const section = existing || document.createElement('div');
    section.className = 'expanded-profile-details';
    section.dataset.profileSignature = signature;
    section.innerHTML = `<div class="expanded-profile-heading">More about this person</div>${rows.map(([label, value]) => `<div class="detail-line expanded-profile-line"><strong>${esc(label)}</strong>${esc(value)}</div>`).join('')}`;
    if (!existing) personDetails.appendChild(section);
  } finally {
    state.rendering = false;
  }
}

function scheduleRender(delay = 20) {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(() => appendExtraDetails().catch(() => {}), delay);
}

function clickedPersonId(event) {
  const node = event.target.closest?.('[data-person-id], [data-snapshot-person]');
  if (!node) return null;
  return node.dataset.personId || node.dataset.snapshotPerson || null;
}

function installStyles() {
  if (document.getElementById('expandedProfileStyles')) return;
  const style = document.createElement('style');
  style.id = 'expandedProfileStyles';
  style.textContent = `
    .expanded-profile-details{margin-top:13px;padding-top:11px;border-top:1px solid rgba(91,72,55,.14);display:grid;gap:6px}.expanded-profile-heading{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#806f60;margin-bottom:1px}.expanded-profile-line strong{min-width:116px}.expanded-profile-line{align-items:start;white-space:pre-wrap}
  `;
  document.head.appendChild(style);
}

async function start(session) {
  if (!session || !personDetails) return;
  state.session = session;
  installStyles();
  await loadPeople();
  state.selectedId = centreSelect?.value || state.selectedId;
  scheduleRender(80);
}

treeCanvas?.addEventListener('click', (event) => {
  const id = clickedPersonId(event);
  if (!id) return;
  state.selectedId = id;
  scheduleRender(0);
}, true);

treeCanvas?.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const id = clickedPersonId(event);
  if (!id) return;
  state.selectedId = id;
  scheduleRender(0);
}, true);

centreSelect?.addEventListener('change', () => {
  state.selectedId = centreSelect.value || null;
  scheduleRender(80);
});

if (personDetails) {
  const observer = new MutationObserver((mutations) => {
    const externalChange = mutations.some((mutation) =>
      [...mutation.addedNodes, ...mutation.removedNodes]
        .some((node) => !(node instanceof Element) || !node.classList.contains('expanded-profile-details')));
    if (externalChange && !state.rendering) scheduleRender(15);
  });
  observer.observe(personDetails, { childList: true, subtree: false });
}

if (personName) {
  const observer = new MutationObserver(() => scheduleRender(20));
  observer.observe(personName, { childList: true, characterData: true, subtree: true });
}

document.addEventListener('genealogy:tree-suggestions-updated', async () => {
  if (!state.session) return;
  try { await loadPeople(); scheduleRender(30); } catch { /* best effort */ }
});
document.addEventListener('genealogy:known-as-updated', async () => {
  if (!state.session) return;
  try { await loadPeople(); scheduleRender(30); } catch { /* best effort */ }
});

supabase.auth.onAuthStateChange((_event, session) => { if (session) start(session).catch(() => {}); });
const { data: { session } } = await supabase.auth.getSession();
if (session) await start(session);

// Snapshot presentation tidy-up and print-current-view support.
const treePanel = document.querySelector('.tree-panel');
let snapshotTidyTimer = null;
let previousDocumentTitle = document.title;

function snapshotPerspectiveActive() {
  return document.querySelector('[data-tree-perspective="snapshot"][aria-pressed="true"]') !== null;
}

function selectedCentreLabel() {
  return centreSelect?.selectedOptions?.[0]?.textContent?.trim() || personName?.textContent?.trim() || 'Family tree';
}

function tidyFamilySnapshot() {
  const snapshot = treeCanvas?.querySelector('.family-snapshot');
  if (!snapshot) return;

  snapshot.querySelector('.snapshot-waist-row')?.classList.remove('snapshot-focus-only');
  const siblingCount = snapshot.querySelectorAll('.snapshot-siblings-wrap > .snapshot-family-cluster').length;

  const grid = snapshot.querySelector('.snapshot-descendant-grid');
  const descendants = snapshot.querySelector('.snapshot-descendants');
  if (grid && descendants) {
    grid.classList.add('snapshot-descendant-grid-tidy');
    const count = Math.max(1, grid.children.length);
    grid.dataset.childCount = String(count);
    grid.style.setProperty('--snapshot-branch-inset', `${50 / count}%`);
    if (!descendants.querySelector('.snapshot-parent-rail')) {
      const stem = document.createElement('div');
      stem.className = 'snapshot-parent-rail';
      stem.setAttribute('aria-hidden', 'true');
      grid.insertAdjacentElement('beforebegin', stem);
    }
  }

  if (snapshotPerspectiveActive()) {
    const viewSummary = document.getElementById('viewSummary');
    const treeStatus = document.getElementById('treeStatus');
    if (viewSummary) {
      viewSummary.textContent = `Family snapshot: parents and grandparents above ${selectedCentreLabel()}, siblings at the same generation, with children, partners and grandchildren grouped clearly below.`;
    }
    if (treeStatus) {
      const childCount = grid?.children?.length || 0;
      treeStatus.textContent = `${siblingCount} sibling${siblingCount === 1 ? '' : 's'} and ${childCount} child${childCount === 1 ? '' : 'ren'} shown for this focus family.`;
    }
  }
}

function scheduleSnapshotTidy(delay = 20) {
  window.clearTimeout(snapshotTidyTimer);
  snapshotTidyTimer = window.setTimeout(tidyFamilySnapshot, delay);
}

function installPrintHeader() {
  if (!treePanel || document.getElementById('printTreeHeader')) return;
  const header = document.createElement('div');
  header.id = 'printTreeHeader';
  header.className = 'print-tree-header';
  header.innerHTML = '<p class="print-tree-kicker">Our Family History</p><h1 id="printTreeTitle">Family tree</h1><p id="printTreeSubtitle"></p>';
  treePanel.insertBefore(header, treePanel.firstChild);
}

function installPrintButton() {
  if (!treePanel || document.getElementById('printCurrentTreeView')) return;
  const panelHead = treePanel.querySelector('.panel-head');
  if (!panelHead) return;
  const button = document.createElement('button');
  button.id = 'printCurrentTreeView';
  button.type = 'button';
  button.className = 'button secondary print-view-button';
  button.textContent = 'Print this view';
  button.title = 'Print this family view or save it as a PDF';
  panelHead.appendChild(button);
  button.addEventListener('click', () => {
    updatePrintHeader();
    previousDocumentTitle = document.title;
    const viewName = snapshotPerspectiveActive() ? 'Family snapshot' : 'Ancestry fan';
    document.title = `${selectedCentreLabel()} - ${viewName} - Our Family History`;
    window.print();
  });
}

function updatePrintHeader() {
  installPrintHeader();
  const title = document.getElementById('printTreeTitle');
  const subtitle = document.getElementById('printTreeSubtitle');
  const focus = selectedCentreLabel();
  const view = snapshotPerspectiveActive() ? 'How does our family look?' : 'Where do I come from?';
  if (title) title.textContent = focus;
  if (subtitle) subtitle.textContent = view;
}

function installSnapshotAndPrintStyles() {
  if (document.getElementById('snapshotTidyPrintStyles')) return;
  const style = document.createElement('style');
  style.id = 'snapshotTidyPrintStyles';
  style.textContent = `
    .snapshot-waist-row{flex-wrap:wrap}.snapshot-siblings-wrap{display:flex!important;flex-wrap:wrap;justify-content:center}.snapshot-focus-wrap{margin-inline:auto}
    .snapshot-descendant-grid-tidy{position:relative;padding-top:25px!important;align-items:stretch!important}.snapshot-descendant-grid-tidy::before{content:"";position:absolute;top:0;left:var(--snapshot-branch-inset,16.66%);right:var(--snapshot-branch-inset,16.66%);border-top:1.5px solid #a89482}.snapshot-descendant-grid-tidy[data-child-count="1"]::before{display:none}.snapshot-parent-rail{width:1.5px;height:22px;background:#9e8876;margin:0 auto}.snapshot-descendant-grid-tidy>.descendant-cluster{position:relative;padding:17px 9px 9px;border:1px solid rgba(89,72,57,.13);border-radius:14px;background:rgba(255,250,242,.62)}.snapshot-descendant-grid-tidy>.descendant-cluster::before{content:"";position:absolute;top:0;left:50%;height:17px;border-left:1.5px solid #a89482}.snapshot-descendant-grid-tidy>.descendant-cluster .snapshot-cluster-stem{height:15px}
    .print-view-button{white-space:nowrap}.print-tree-header{display:none}
    @media print{
      @page{size:A4 landscape;margin:8mm}
      html,body{background:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      body *{visibility:hidden!important}
      .tree-panel,.tree-panel *{visibility:visible!important}
      .tree-panel{position:absolute!important;left:0!important;top:0!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;background:#fff!important}
      .tree-panel>.panel-head,.tree-panel>.tree-perspective-switch,.tree-panel>#treeStatus,.tree-panel .enhanced-tree-controls,.tree-panel .print-view-button,.tree-panel [class*="sibling-drawer"],.tree-panel [class*="collateral-card"]{display:none!important}
      .print-tree-header{display:block!important;visibility:visible!important;text-align:center;margin:0 0 4mm;color:#352c25}.print-tree-kicker{margin:0 0 1mm;font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase}.print-tree-header h1{margin:0;font-size:15pt;line-height:1.15}.print-tree-header p:last-child{margin:1.5mm 0 0;font-size:9pt;color:#66584b}
      #treeCanvas{visibility:visible!important;overflow:visible!important;width:100%!important;min-height:0!important;padding:0!important;margin:0!important;background:#fff!important}
      #treeCanvas>svg{display:block!important;width:auto!important;height:172mm!important;max-width:100%!important;margin:0 auto!important;overflow:visible!important}
      .snapshot-scroll{overflow:visible!important;width:100%!important}.family-snapshot{min-width:0!important;width:100%!important;padding:0!important}.snapshot-ancestry{gap:7mm!important}.snapshot-lineage-branch{padding:3mm!important}.snapshot-waist{padding:3mm 2mm!important}.snapshot-siblings-wrap{display:flex!important;gap:2mm!important}.snapshot-descendants{padding:3mm 1mm 0!important}.snapshot-descendant-grid{gap:3mm!important;justify-content:center!important}.snapshot-family-cluster{min-width:0!important;max-width:none!important;flex:1 1 0!important}.snapshot-person-card{min-width:0!important;max-width:none!important;padding:2mm!important;min-height:11mm!important}.snapshot-person-card strong{font-size:7.5pt!important}.snapshot-person-card span{font-size:6.4pt!important}.snapshot-section-label,.snapshot-note{font-size:6.5pt!important}.snapshot-note{margin-top:2mm!important}.snapshot-descendant-grid-tidy>.descendant-cluster{padding:4mm 2mm 2mm!important;break-inside:avoid!important}
    }
  `;
  document.head.appendChild(style);
}

installSnapshotAndPrintStyles();
installPrintHeader();
installPrintButton();
scheduleSnapshotTidy(120);

if (treeCanvas) {
  const snapshotObserver = new MutationObserver(() => scheduleSnapshotTidy(15));
  snapshotObserver.observe(treeCanvas, { childList: true, subtree: true });
}

document.addEventListener('genealogy:tree-suggestions-updated', () => scheduleSnapshotTidy(40));
document.addEventListener('genealogy:known-as-updated', () => scheduleSnapshotTidy(40));
centreSelect?.addEventListener('change', () => scheduleSnapshotTidy(70));
window.addEventListener('beforeprint', updatePrintHeader);
window.addEventListener('afterprint', () => { document.title = previousDocumentTitle; });
