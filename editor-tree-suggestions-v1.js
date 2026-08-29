import { supabase } from './supabase-client-v1.js';
import { recordName } from './person-name-v1.js';


const editorArea = document.getElementById('editorArea');
const refreshEditor = document.getElementById('refreshEditor');
const state = { session: null, people: new Map(), users: new Map(), channel: null };
const HISTORY_LABELS = {
  south_african_war: 'South African War / Anglo-Boer War',
  first_world_war: 'First World War',
  second_world_war: 'Second World War',
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function personName(person) {
  return recordName(person, { unknown: 'Unknown person' });
}

function contributorName(id) {
  return state.users.get(id)?.display_name || 'Family contributor';
}

function relationshipSummary(payload = {}) {
  const relative = payload.relative || {};
  const relativeName = recordName(relative, { unknown: 'new relative' });
  return `Add ${relativeName} as ${payload.role || 'relative'}`;
}

function changeSummary(change) {
  const target = state.people.get(change.target_person_id);
  const targetName = target ? personName(target) : 'the selected person';
  if (change.change_type === 'add_relative') return `${relationshipSummary(change.payload)} of ${targetName}`;
  if (change.change_type === 'edit_person') return `Edit details for ${targetName}`;
  if (change.change_type === 'remove_person') return `Remove ${targetName} from the active tree`;
  if (change.change_type === 'remove_relationship') return `Remove a relationship attached to ${targetName}`;
  return change.change_type.replaceAll('_', ' ');
}

function humanValue(value) {
  if (value === null || value === undefined || value === '') return 'blank';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value).replaceAll('_', ' ');
}

function historyRows(context = {}) {
  const rows = [];
  Object.entries(context || {}).forEach(([key, entry]) => {
    if (!entry || typeof entry !== 'object') return;
    const label = HISTORY_LABELS[key] || key.replaceAll('_', ' ');
    if (entry.status === 'no_known_information') {
      rows.push([`Historical context - ${label}`, 'No information currently known']);
      return;
    }
    if (entry.status === 'known') {
      const parts = [];
      if (entry.details) parts.push(entry.details);
      if (entry.concentration_camp) parts.push(`Concentration camp: ${entry.concentration_camp}`);
      rows.push([`Historical context - ${label}`, parts.join(' | ') || 'Contributor says information is known; details not supplied']);
    }
  });
  return rows;
}

function detailRows(change) {
  const rows = [];
  if (change.change_type === 'add_relative') {
    const relative = change.payload?.relative || {};
    rows.push(['Relationship', change.payload?.role || 'relative']);
    rows.push(['Name', recordName(relative, { unknown: 'Not supplied' })]);
    if (relative.birth_surname) rows.push(['Birth / maiden surname', relative.birth_surname]);
    if (relative.current_surname) rows.push(['Married / current surname', relative.current_surname]);
    if (relative.preferred_name) rows.push(['Known as', relative.preferred_name]);
    if (relative.life_status) rows.push(['Life status', humanValue(relative.life_status)]);
    if (relative.birth_date) rows.push(['Birth', relative.birth_date]);
    if (relative.birth_place) rows.push(['Birth place', relative.birth_place]);
    if (relative.residence_summary) rows.push(['Where they lived', relative.residence_summary]);
    if (relative.death_date) rows.push(['Death', relative.death_date]);
    if (relative.death_place) rows.push(['Death place', relative.death_place]);
    if (relative.final_rest_type || relative.final_rest_place) {
      rows.push(['Final resting place', [humanValue(relative.final_rest_type || ''), relative.final_rest_place].filter((value) => value && value !== 'blank').join(' - ') || 'Not supplied']);
    }
    if (relative.occupation_summary) rows.push(['Occupation', relative.occupation_summary]);
    if (relative.military_service_summary) rows.push(['Military / other service', relative.military_service_summary]);
    if (relative.narrative_summary) rows.push(['Family note', relative.narrative_summary]);
    rows.push(...historyRows(relative.historical_context));
    if (['spouse','partner'].includes(change.payload?.role)) rows.push(['Relationship status', change.payload?.relationship_status || 'current']);
  } else if (change.change_type === 'edit_person') {
    const before = change.before_snapshot?.person || {};
    const after = change.payload?.after || {};
    Object.keys(after).forEach((key) => {
      if (key === 'historical_context') {
        rows.push(...historyRows(after.historical_context));
        return;
      }
      const oldValue = before[key] ?? '';
      const newValue = after[key] ?? '';
      if (String(oldValue ?? '') !== String(newValue ?? '')) rows.push([key.replaceAll('_', ' '), `${humanValue(oldValue)} -> ${humanValue(newValue)}`]);
    });
  } else if (change.change_type === 'remove_relationship') {
    const relationship = change.before_snapshot?.relationship || {};
    rows.push(['Relationship type', relationship.relationship_type || 'relationship']);
    if (change.payload?.reason) rows.push(['Reason', change.payload.reason]);
  } else if (change.change_type === 'remove_person') {
    rows.push(['Effect', 'Person and connected relationships disappear from the active tree. The underlying records remain recoverable.']);
    if (change.payload?.reason) rows.push(['Reason', change.payload.reason]);
  }
  return rows;
}

function installUi() {
  if (!editorArea || document.getElementById('treeChangeReviewPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'treeChangeReviewPanel';
  panel.className = 'panel tree-change-review-panel';
  const grid = editorArea.querySelector('.editor-grid');
  panel.innerHTML = `
    <div class="tree-change-review-heading">
      <div><p class="eyebrow">Live tree review</p><h2>Proposed tree changes <span id="treeChangeCount" class="tree-change-count">0</span></h2><p class="small">Family members see these changes immediately in their own working tree. Approve to make them canonical; reject to restore their view to the approved tree.</p></div>
      <span id="treeChangeLive" class="tree-change-live">Live</span>
    </div>
    <p id="treeChangeReviewMessage" class="message" aria-live="polite"></p>
    <div id="treeChangeQueue" class="tree-change-queue"><div class="queue-empty">No tree changes are waiting.</div></div>`;
  editorArea.insertBefore(panel, grid || null);
}

function installStyles() {
  if (document.getElementById('treeChangeReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'treeChangeReviewStyles';
  style.textContent = `
    .tree-change-review-panel{margin-bottom:18px}.tree-change-review-heading{display:flex;justify-content:space-between;gap:16px;align-items:start}.tree-change-review-heading h2{display:flex;align-items:center;gap:9px}.tree-change-count{display:inline-flex;min-width:24px;height:24px;padding:0 7px;align-items:center;justify-content:center;border-radius:999px;background:#5e4935;color:white;font-size:11px}.tree-change-live{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:5px 8px;border-radius:999px;background:#edf5ec;color:#4d704f}.tree-change-queue{display:grid;gap:10px;margin-top:12px}.tree-change-card{border:1px solid rgba(91,72,55,.2);border-radius:14px;background:#fffaf2;padding:13px}.tree-change-card.is-conflict{border-color:rgba(164,105,44,.45);background:#fff8ec}.tree-change-top{display:flex;justify-content:space-between;gap:12px;align-items:start}.tree-change-top strong{font-size:13px;color:#3f3329}.tree-change-meta{font-size:10px;color:#74675b;margin:3px 0 0}.tree-change-status{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-radius:999px;padding:4px 7px;background:#f0e4d5;color:#68584a}.tree-change-status.conflict{background:#f7e4bd;color:#7a5725}.tree-change-details{display:grid;grid-template-columns:minmax(115px,.38fr) 1fr;gap:5px 10px;margin:11px 0;font-size:10.5px}.tree-change-details dt{font-weight:700;color:#645548}.tree-change-details dd{margin:0;color:#4c4036;white-space:pre-wrap}.tree-change-note{width:100%;box-sizing:border-box;border:1px solid rgba(91,72,55,.2);border-radius:9px;padding:8px;font:inherit;background:white}.tree-change-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
  `;
  document.head.appendChild(style);
}

function setMessage(text = '', type = '') {
  const node = document.getElementById('treeChangeReviewMessage');
  if (!node) return;
  node.textContent = text;
  node.className = `message${type ? ` ${type}` : ''}`;
}

async function loadReferenceData() {
  const [peopleResult, usersResult] = await Promise.all([
    supabase.from('people').select('id, given_names, surname, birth_surname, current_surname, is_active'),
    supabase.from('app_users').select('user_id, display_name, role, status'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (usersResult.error) throw usersResult.error;
  state.people = new Map((peopleResult.data || []).map((person) => [person.id, person]));
  state.users = new Map((usersResult.data || []).map((user) => [user.user_id, user]));
}

async function loadQueue() {
  await loadReferenceData();
  const { data, error } = await supabase.from('tree_change_sets')
    .select('id, submitted_by, target_person_id, change_type, payload, before_snapshot, base_updated_at, status, review_note, created_at')
    .in('status', ['pending', 'conflict'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  renderQueue(data || []);
}

function renderQueue(changes) {
  const queue = document.getElementById('treeChangeQueue');
  const count = document.getElementById('treeChangeCount');
  if (!queue || !count) return;
  count.textContent = String(changes.filter((change) => change.status === 'pending').length);
  if (!changes.length) {
    queue.innerHTML = '<div class="queue-empty">No tree changes are waiting.</div>';
    return;
  }
  queue.innerHTML = changes.map((change) => {
    const rows = detailRows(change).map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('');
    const conflict = change.status === 'conflict';
    return `<article class="tree-change-card${conflict ? ' is-conflict' : ''}" data-tree-change-id="${esc(change.id)}">
      <div class="tree-change-top"><div><strong>${esc(changeSummary(change))}</strong><p class="tree-change-meta">${esc(contributorName(change.submitted_by))} - ${new Date(change.created_at).toLocaleString()}</p></div><span class="tree-change-status${conflict ? ' conflict' : ''}">${esc(change.status)}</span></div>
      ${rows ? `<dl class="tree-change-details">${rows}</dl>` : ''}
      ${conflict && change.review_note ? `<p class="tree-change-meta">${esc(change.review_note)}</p>` : ''}
      <textarea class="tree-change-note" rows="2" placeholder="Optional review note"></textarea>
      <div class="tree-change-actions">${conflict ? '' : '<button type="button" class="button primary" data-approve-tree-change>Approve and keep</button>'}<button type="button" class="button danger" data-reject-tree-change>Reject and restore</button></div>
    </article>`;
  }).join('');

  queue.querySelectorAll('[data-tree-change-id]').forEach((card) => {
    const id = card.dataset.treeChangeId;
    card.querySelector('[data-approve-tree-change]')?.addEventListener('click', () => approveChange(id, card));
    card.querySelector('[data-reject-tree-change]')?.addEventListener('click', () => rejectChange(id, card));
  });
}

async function approveChange(id, card) {
  const note = card.querySelector('.tree-change-note')?.value.trim() || null;
  setMessage('Applying approved tree change...');
  try {
    if (note) {
      const { error: noteError } = await supabase.from('tree_change_sets').update({ review_note: note }).eq('id', id);
      if (noteError) throw noteError;
    }
    const { data, error } = await supabase.rpc('approve_tree_change_set', { p_change_set_id: id });
    if (error) throw error;
    if (data?.status === 'conflict') setMessage('This proposal conflicts with a newer tree state. It has been moved to conflict review.', 'error');
    else setMessage('Approved. The change is now part of the shared canonical tree.', 'success');
    document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
    document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
    await loadQueue();
  } catch (error) { setMessage(error.message || 'Unable to approve this tree change.', 'error'); }
}

async function rejectChange(id, card) {
  const note = card.querySelector('.tree-change-note')?.value.trim() || 'Rejected by family editor.';
  setMessage('Rejecting proposed tree change...');
  try {
    const { error } = await supabase.from('tree_change_sets').update({
      status: 'rejected', review_note: note, reviewed_by: state.session.user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
    setMessage('Rejected. The contributor will automatically return to the approved tree state.', 'success');
    document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
    document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
    await loadQueue();
  } catch (error) { setMessage(error.message || 'Unable to reject this tree change.', 'error'); }
}

function subscribe() {
  state.channel?.unsubscribe();
  state.channel = supabase.channel('editor-tree-change-review')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tree_change_sets' }, async () => {
      try {
        await loadQueue();
        setMessage('Tree review queue updated automatically.', 'success');
      } catch { /* manual refresh remains available */ }
    })
    .subscribe();
}

async function start(session) {
  if (!session || !editorArea) return;
  state.session = session;
  const { data: profile, error } = await supabase.from('app_users').select('role, status').eq('user_id', session.user.id).maybeSingle();
  if (error || profile?.status !== 'approved' || !['editor','admin'].includes(profile.role)) return;
  installStyles();
  installUi();
  await loadQueue();
  subscribe();
}

refreshEditor?.addEventListener('click', () => {
  if (!state.session) return;
  setMessage('Refreshing tree review queue...');
  loadQueue().then(() => setMessage('Tree review queue refreshed.', 'success')).catch((error) => setMessage(error.message || 'Unable to refresh tree review queue.', 'error'));
});

document.addEventListener('genealogy:tree-suggestions-updated', () => {
  if (state.session) loadQueue().catch(() => {});
});

supabase.auth.onAuthStateChange((_event, session) => { if (session) start(session).catch(() => {}); });
const { data: { session } } = await supabase.auth.getSession();
if (session) await start(session);
