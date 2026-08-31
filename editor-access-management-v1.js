import { supabase } from './supabase-client-v1.js';

const state = {
  rows: [],
  search: '',
  loaded: false,
  loading: false,
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const human = (value) => String(value || '').replaceAll('_', ' ');

function formatTime(value) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

function relativeTime(value) {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return 'unknown';
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} d ago`;
  return formatTime(value);
}

function isActive(row) {
  if (!row.last_seen_at) return false;
  return Date.now() - new Date(row.last_seen_at).getTime() <= 4 * 60_000;
}

function statusLabel(row) {
  if (isActive(row)) return 'Active now';
  if (row.app_status === 'approved') {
    if (row.role === 'admin') return 'Administrator';
    if (row.role === 'editor') return 'Editor';
    return 'Approved';
  }
  if (row.access_request_status === 'pending') return 'Awaiting approval';
  if (row.access_request_status === 'rejected') return 'Access rejected';
  if (!row.app_status) return 'Email verified only';
  return human(row.app_status);
}

function installStyles() {
  if (document.getElementById('editorAccessManagementStyles')) return;
  const style = document.createElement('style');
  style.id = 'editorAccessManagementStyles';
  style.textContent = `
    #editorAccessManagement { margin: 0 0 20px; }
    .editor-access-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:12px; }
    .editor-access-head h3 { margin:2px 0 0; font:600 1.18rem/1.25 Georgia, "Times New Roman", serif; color:var(--ink); }
    .editor-access-tabs { display:flex; flex-wrap:wrap; gap:8px; padding:8px; border:1px solid var(--line); border-radius:14px; background:#f7f1e9; }
    .editor-access-tab { min-height:40px; border:1px solid transparent; border-radius:10px; background:transparent; padding:8px 13px; color:var(--muted); font:700 .84rem/1.2 Arial,sans-serif; cursor:pointer; }
    .editor-access-tab:hover { background:#fffaf3; color:var(--ink); }
    .editor-access-tab.active { border-color:var(--line); background:#fff; color:var(--ink); box-shadow:0 3px 10px rgba(48,38,29,.06); }
    .editor-access-badge { display:inline-grid; place-items:center; min-width:20px; height:20px; margin-left:6px; padding:0 5px; border-radius:999px; background:var(--accent-soft); color:var(--accent); font:700 .72rem/1 Arial,sans-serif; }
    .editor-access-panel { margin-top:12px; }
    .editor-access-panel.hidden { display:none !important; }
    .editor-access-panel > .panel { margin:0; }
    #editorAccessQueuePanel > section.panel { padding:18px; }
    .editor-access-log-panel { border:1px solid var(--line); border-radius:16px; background:var(--panel); padding:18px; }
    .editor-access-log-intro { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; margin-bottom:12px; }
    .editor-access-log-intro h3 { margin:2px 0 5px; font:600 1.1rem/1.3 Georgia,"Times New Roman",serif; }
    .editor-access-log-intro p:last-child { margin:0; color:var(--muted); font:.88rem/1.5 Arial,sans-serif; max-width:720px; }
    .editor-access-toolbar { display:grid; grid-template-columns:minmax(220px,1fr) auto; gap:10px; margin:12px 0; }
    .editor-access-toolbar input { width:100%; min-height:42px; border:1px solid var(--line); border-radius:10px; background:#fff; padding:9px 11px; color:var(--ink); }
    .editor-access-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:12px 0 14px; }
    .editor-access-summary > div { border:1px solid var(--line); border-radius:12px; background:#faf6ef; padding:12px; }
    .editor-access-summary strong { display:block; font:700 1.35rem/1 Arial,sans-serif; color:var(--ink); }
    .editor-access-summary span { display:block; margin-top:5px; color:var(--muted); font:700 .72rem/1.2 Arial,sans-serif; text-transform:uppercase; letter-spacing:.06em; }
    .editor-access-list { display:grid; gap:10px; }
    .editor-access-card { border:1px solid var(--line); border-radius:14px; background:#faf6ef; overflow:hidden; }
    .editor-access-card-main { width:100%; border:0; background:transparent; padding:14px; text-align:left; color:var(--ink); cursor:pointer; }
    .editor-access-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .editor-access-card-head strong { display:block; font:700 .98rem/1.35 Arial,sans-serif; }
    .editor-access-email { display:block; margin-top:3px; color:var(--muted); font:.8rem/1.4 Arial,sans-serif; overflow-wrap:anywhere; }
    .editor-access-status { flex:none; border-radius:999px; padding:6px 8px; background:#eee2d2; color:#65503e; font:800 .68rem/1 Arial,sans-serif; text-transform:uppercase; letter-spacing:.04em; }
    .editor-access-status.live { background:#deeddf; color:#315f38; }
    .editor-access-status.pending { background:#fff0cf; color:#72511d; }
    .editor-access-card-meta { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:11px; }
    .editor-access-card-meta > div { padding:9px 10px; border-radius:10px; background:#fff; }
    .editor-access-card-meta b { display:block; color:var(--muted); font:800 .68rem/1 Arial,sans-serif; text-transform:uppercase; letter-spacing:.05em; }
    .editor-access-card-meta span { display:block; margin-top:4px; color:var(--ink); font:.82rem/1.35 Arial,sans-serif; }
    .editor-access-card-foot { display:flex; justify-content:space-between; gap:10px; margin-top:10px; color:var(--muted); font:.78rem/1.35 Arial,sans-serif; }
    .editor-access-detail { border-top:1px solid var(--line); background:#fffdf9; padding:13px 14px 15px; }
    .editor-access-detail.hidden { display:none; }
    .editor-access-detail-title { margin:0 0 8px; color:var(--muted); font:800 .72rem/1.2 Arial,sans-serif; text-transform:uppercase; letter-spacing:.07em; }
    .editor-access-timeline { display:grid; gap:4px; }
    .editor-access-event { display:grid; grid-template-columns:145px 1fr; gap:12px; padding:9px 0; border-bottom:1px solid #ece3d8; }
    .editor-access-event:last-child { border-bottom:0; }
    .editor-access-event time { color:var(--muted); font:.76rem/1.4 Arial,sans-serif; }
    .editor-access-event strong { display:block; font:.84rem/1.4 Arial,sans-serif; }
    .editor-access-event p { margin:2px 0 0; color:var(--muted); font:.79rem/1.45 Arial,sans-serif; }
    .editor-access-empty { padding:22px 14px; border:1px dashed var(--line); border-radius:12px; text-align:center; color:var(--muted); font:.88rem/1.5 Arial,sans-serif; }
    @media (max-width:700px) {
      .editor-access-head, .editor-access-log-intro { align-items:stretch; flex-direction:column; }
      .editor-access-toolbar, .editor-access-card-meta, .editor-access-summary { grid-template-columns:1fr; }
      .editor-access-event { grid-template-columns:1fr; gap:2px; }
      .editor-access-card-foot { flex-direction:column; }
    }
  `;
  document.head.appendChild(style);
}

function queueCount() {
  return document.querySelectorAll('#accessQueue .queue-card').length;
}

function updateQueueBadge() {
  const badge = document.getElementById('editorAccessQueueBadge');
  if (badge) badge.textContent = String(queueCount());
}

function activateTab(name) {
  document.querySelectorAll('[data-editor-access-tab]').forEach((button) => {
    const active = button.dataset.editorAccessTab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-editor-access-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.editorAccessPanel !== name);
  });
  if (name === 'log') void loadOverview();
}

function installUi() {
  const editorArea = document.getElementById('editorArea');
  const accessQueue = document.getElementById('accessQueue');
  const editorGrid = editorArea?.querySelector('.editor-grid');
  if (!editorArea || !accessQueue || !editorGrid || document.getElementById('editorAccessManagement')) return;

  installStyles();

  const accessSection = accessQueue.closest('section.panel');
  if (!accessSection) return;

  const management = document.createElement('section');
  management.id = 'editorAccessManagement';
  management.innerHTML = `
    <div class="editor-access-head">
      <div><p class="eyebrow">Administrator controls</p><h3>Family access</h3></div>
    </div>
    <div class="editor-access-tabs" role="tablist" aria-label="Family access administration">
      <button class="editor-access-tab active" type="button" role="tab" aria-selected="true" data-editor-access-tab="queue">Access Queue <span id="editorAccessQueueBadge" class="editor-access-badge">0</span></button>
      <button class="editor-access-tab" type="button" role="tab" aria-selected="false" data-editor-access-tab="log">Access Log</button>
    </div>
    <div id="editorAccessQueuePanel" class="editor-access-panel" data-editor-access-panel="queue"></div>
    <div id="editorAccessLogPanel" class="editor-access-panel hidden" data-editor-access-panel="log">
      <div class="editor-access-log-panel">
        <div class="editor-access-log-intro">
          <div><p class="eyebrow">Access and activity</p><h3>Family access log</h3><p>See who has an account, when they last signed in or used the archive, and whether they submitted information.</p></div>
        </div>
        <div class="editor-access-toolbar"><input id="editorAccessSearch" type="search" placeholder="Search family member or email" aria-label="Search access log" /><button id="editorAccessReload" class="button secondary" type="button">Refresh log</button></div>
        <div id="editorAccessSummary" class="editor-access-summary"></div>
        <p id="editorAccessMessage" class="message" aria-live="polite"></p>
        <div id="editorAccessList" class="editor-access-list"></div>
      </div>
    </div>`;

  editorGrid.insertAdjacentElement('beforebegin', management);
  management.querySelector('#editorAccessQueuePanel').appendChild(accessSection);

  management.querySelectorAll('[data-editor-access-tab]').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.editorAccessTab));
  });

  management.querySelector('#editorAccessSearch')?.addEventListener('input', (event) => {
    state.search = event.target.value || '';
    renderOverview();
  });
  management.querySelector('#editorAccessReload')?.addEventListener('click', () => void loadOverview(true));

  const refreshEditor = document.getElementById('refreshEditor');
  refreshEditor?.addEventListener('click', () => {
    state.loaded = false;
    if (!document.getElementById('editorAccessLogPanel')?.classList.contains('hidden')) void loadOverview(true);
  });

  new MutationObserver(updateQueueBadge).observe(accessQueue, { childList: true, subtree: true });
  updateQueueBadge();
  activateTab('queue');
}

async function loadOverview(force = false) {
  if (state.loading || (state.loaded && !force)) return;
  const message = document.getElementById('editorAccessMessage');
  state.loading = true;
  if (message) {
    message.textContent = 'Loading family access activity...';
    message.className = 'message';
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sign in again to view the access log.');
    const { data, error } = await supabase.rpc('admin_access_overview');
    if (error) throw error;
    state.rows = data || [];
    state.loaded = true;
    if (message) message.textContent = '';
    renderOverview();
  } catch (error) {
    if (message) {
      message.textContent = error?.message || 'The access log could not be loaded.';
      message.className = 'message error';
    }
  } finally {
    state.loading = false;
  }
}

function renderOverview() {
  const summary = document.getElementById('editorAccessSummary');
  const list = document.getElementById('editorAccessList');
  if (!summary || !list) return;

  const approved = state.rows.filter((row) => row.app_status === 'approved').length;
  const active = state.rows.filter(isActive).length;
  const submissions = state.rows.reduce((total, row) => total + Number(row.contribution_count || 0) + Number(row.tree_change_count || 0), 0);
  summary.innerHTML = `<div><strong>${approved}</strong><span>Approved</span></div><div><strong>${active}</strong><span>Active now</span></div><div><strong>${submissions}</strong><span>Submissions</span></div>`;

  const needle = state.search.trim().toLowerCase();
  const rows = state.rows.filter((row) => !needle || [row.display_name, row.email, row.linked_person_name].some((value) => String(value || '').toLowerCase().includes(needle)));
  if (!rows.length) {
    list.innerHTML = `<div class="editor-access-empty">${needle ? 'No family account matches that search.' : 'No family accounts are recorded yet.'}</div>`;
    return;
  }

  list.innerHTML = rows.map((row) => {
    const submissionCount = Number(row.contribution_count || 0) + Number(row.tree_change_count || 0);
    const statusClass = isActive(row) ? ' live' : row.access_request_status === 'pending' ? ' pending' : '';
    return `<article class="editor-access-card" data-access-user="${esc(row.user_id)}">
      <button type="button" class="editor-access-card-main" data-access-user-button="${esc(row.user_id)}" aria-expanded="false">
        <div class="editor-access-card-head"><div><strong>${esc(row.display_name || row.linked_person_name || 'Family account')}</strong><span class="editor-access-email">${esc(row.email || '')}</span></div><span class="editor-access-status${statusClass}">${esc(statusLabel(row))}</span></div>
        <div class="editor-access-card-meta"><div><b>Last sign-in</b><span>${esc(relativeTime(row.last_sign_in_at))}</span></div><div><b>Last archive use</b><span>${esc(row.last_seen_at ? relativeTime(row.last_seen_at) : 'Not yet tracked')}</span></div></div>
        <div class="editor-access-card-foot"><span>${submissionCount} submission${submissionCount === 1 ? '' : 's'}; ${Number(row.session_count || 0)} tracked session${Number(row.session_count || 0) === 1 ? '' : 's'}</span><span>Open history</span></div>
      </button>
      <div id="editor-access-detail-${esc(row.user_id)}" class="editor-access-detail hidden"></div>
    </article>`;
  }).join('');

  list.querySelectorAll('[data-access-user-button]').forEach((button) => {
    button.addEventListener('click', () => void toggleDetail(button.dataset.accessUserButton, button));
  });
}

async function toggleDetail(userId, button) {
  const detail = document.getElementById(`editor-access-detail-${userId}`);
  if (!detail) return;
  const opening = detail.classList.contains('hidden');
  detail.classList.toggle('hidden', !opening);
  button.setAttribute('aria-expanded', opening ? 'true' : 'false');
  if (!opening || detail.dataset.loaded === 'true') return;

  detail.innerHTML = '<p class="editor-access-detail-title">Loading history...</p>';
  try {
    const row = state.rows.find((item) => item.user_id === userId);
    const [sessionsRes, contributionsRes, changesRes] = await Promise.all([
      supabase.from('app_access_sessions').select('id,started_at,last_seen_at,ended_at,page_path').eq('user_id', userId).order('started_at', { ascending: false }).limit(20),
      supabase.from('contributions').select('id,contribution_type,status,created_at,reviewed_at').eq('submitted_by', userId).order('created_at', { ascending: false }).limit(40),
      supabase.from('tree_change_sets').select('id,change_type,status,created_at,reviewed_at').eq('submitted_by', userId).order('created_at', { ascending: false }).limit(40),
    ]);
    if (sessionsRes.error) throw sessionsRes.error;
    if (contributionsRes.error) throw contributionsRes.error;
    if (changesRes.error) throw changesRes.error;
    renderDetail(detail, row, sessionsRes.data || [], contributionsRes.data || [], changesRes.data || []);
    detail.dataset.loaded = 'true';
  } catch (error) {
    detail.innerHTML = `<p class="message error">${esc(error?.message || 'History could not be loaded.')}</p>`;
  }
}

function renderDetail(detail, row, sessions, contributions, changes) {
  const events = [];
  const add = (when, title, note = '') => {
    if (when) events.push({ when, title, note });
  };

  add(row?.auth_created_at, 'Email account created', row?.access_request_status ? 'Email verification completed before the family access request.' : 'No family access request is recorded for this account.');
  add(row?.access_requested_at, 'Family access requested', `Status: ${human(row?.access_request_status || 'unknown')}`);
  add(row?.approved_at, 'Family access approved', `${human(row?.role || 'family')} access linked to ${row?.linked_person_name || row?.display_name || 'family profile'}`);
  add(row?.last_sign_in_at, 'Most recent authentication sign-in', 'This is the latest authentication timestamp retained on the account, not a complete historical sign-in list.');

  sessions.forEach((session) => {
    const note = `Last seen ${formatTime(session.last_seen_at)}${session.page_path ? ` - ${session.page_path}` : ''}`;
    add(session.started_at, 'Archive session', note);
  });
  contributions.forEach((item) => add(item.created_at, `Contribution: ${human(item.contribution_type)}`, `Status: ${human(item.status)}`));
  changes.forEach((item) => add(item.created_at, `Tree change: ${human(item.change_type)}`, `Status: ${human(item.status)}`));

  events.sort((a, b) => new Date(b.when) - new Date(a.when));
  detail.innerHTML = `<p class="editor-access-detail-title">Account history</p><div class="editor-access-timeline">${events.length ? events.map((event) => `<div class="editor-access-event"><time>${esc(formatTime(event.when))}</time><div><strong>${esc(event.title)}</strong>${event.note ? `<p>${esc(event.note)}</p>` : ''}</div></div>`).join('') : '<div class="editor-access-empty">No retained activity history is available for this account.</div>'}</div>`;
}

function boot() {
  installUi();
  if (!document.getElementById('editorAccessManagement')) {
    setTimeout(installUi, 250);
    setTimeout(installUi, 1000);
  }
}

boot();
