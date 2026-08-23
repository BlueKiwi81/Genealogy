import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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
    personDetails.querySelector('.expanded-profile-details')?.remove();
    let person = state.people.get(state.selectedId) || null;
    if (!person && String(state.selectedId).startsWith('pending:')) person = await pendingPerson(state.selectedId);
    if (!hasExtraData(person)) return;
    const rows = renderRows(person);
    if (!rows.length) return;
    const section = document.createElement('div');
    section.className = 'expanded-profile-details';
    section.innerHTML = `<div class="expanded-profile-heading">More about this person</div>${rows.map(([label, value]) => `<div class="detail-line expanded-profile-line"><strong>${esc(label)}</strong>${esc(value)}</div>`).join('')}`;
    personDetails.appendChild(section);
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
  const observer = new MutationObserver(() => {
    if (!state.rendering) scheduleRender(15);
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
