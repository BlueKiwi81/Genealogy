import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
});

const state = { rows: [], search: '', loaded: false, loading: false };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
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
  if (row.app_status === 'approved') return row.role === 'admin' ? 'Administrator' : row.role === 'editor' ? 'Editor' : 'Approved';
  if (row.access_request_status === 'pending') return 'Awaiting approval';
  if (row.access_request_status === 'rejected') return 'Access rejected';
  if (!row.app_status) return 'Email verified only';
  return human(row.app_status);
}

function installStyles() {
  if (document.getElementById('accessActivityStyles')) return;
  const style = document.createElement('style');
  style.id = 'accessActivityStyles';
  style.textContent = `
    .bottom-nav{grid-template-columns:repeat(5,1fr)}
    .activity-intro{margin-bottom:12px}.activity-intro p:last-child{margin:7px 0 0;font:13px/1.5 Arial,sans-serif;color:var(--muted)}
    .activity-toolbar{display:grid;grid-template-columns:1fr auto;gap:8px;margin:10px 0 12px}.activity-toolbar input{width:100%;border:1px solid #cec2b5;border-radius:12px;background:#fff;color:#251f1a;padding:11px 12px;font-size:16px;outline:none}.activity-toolbar button{min-height:44px}
    .activity-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}.activity-summary>div{padding:11px 9px;border:1px solid var(--line);border-radius:15px;background:var(--panel);text-align:center}.activity-summary strong{display:block;font-size:22px}.activity-summary span{font:800 9px/1.2 Arial,sans-serif;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
    .activity-list{display:grid;gap:9px}.activity-card{border:1px solid var(--line);border-radius:18px;background:var(--panel);box-shadow:0 6px 18px rgba(48,38,29,.06);overflow:hidden}.activity-card-main{width:100%;border:0;background:transparent;padding:14px;text-align:left;color:var(--ink)}.activity-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.activity-card-head strong{display:block;font-size:15px;line-height:1.25}.activity-card-email{display:block;margin-top:3px;font:11px/1.35 Arial,sans-serif;color:var(--muted);overflow-wrap:anywhere}.activity-status{flex:none;border-radius:999px;padding:5px 8px;background:#eee2d2;color:#65503e;font:800 9px/1 Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em}.activity-status.live{background:#deeddf;color:#315f38}.activity-status.pending{background:#fff0cf;color:#72511d}.activity-card-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.activity-card-meta div{padding:8px 9px;border-radius:11px;background:#f8f3ec}.activity-card-meta b{display:block;font:800 9px Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#796d61}.activity-card-meta span{display:block;margin-top:3px;font:12px/1.3 Arial,sans-serif;color:#413930}.activity-card-foot{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:11px;font:11px/1.3 Arial,sans-serif;color:var(--muted)}
    .activity-detail{border-top:1px solid #e5dbcf;padding:12px 14px 14px;background:#faf6ef}.activity-detail.hidden{display:none}.activity-detail-title{margin:0 0 8px;font:800 10px Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#75685c}.activity-timeline{display:grid;gap:7px}.activity-event{display:grid;grid-template-columns:92px 1fr;gap:9px;padding:8px 0;border-bottom:1px solid #e8dfd4}.activity-event:last-child{border-bottom:0}.activity-event time{font:10px/1.35 Arial,sans-serif;color:var(--muted)}.activity-event strong{display:block;font:700 12px/1.35 Arial,sans-serif}.activity-event p{margin:2px 0 0;font:11px/1.4 Arial,sans-serif;color:#665b51}.activity-empty{padding:26px 15px;text-align:center;border:1px dashed var(--line);border-radius:18px;color:var(--muted);font:13px/1.45 Arial,sans-serif}
    @media(max-width:430px){.activity-card-meta{grid-template-columns:1fr}.activity-event{grid-template-columns:78px 1fr}.activity-summary strong{font-size:19px}}
  `;
  document.head.appendChild(style);
}

function activateActivity() {
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === 'activity'));
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.tab === 'activity'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  void loadOverview();
}

function installUi() {
  if (document.getElementById('activityPanel')) return;
  installStyles();

  const panels = document.querySelector('.tab-panels');
  const nav = document.querySelector('.bottom-nav');
  if (!panels || !nav) return;

  const panel = document.createElement('section');
  panel.id = 'activityPanel';
  panel.className = 'tab-panel';
  panel.dataset.panel = 'activity';
  panel.innerHTML = `
    <div class="section-heading activity-intro"><div><p class="eyebrow">Access and activity</p><h2>Family access log</h2><p>See who has an account, when they last signed in or used the archive, and whether they submitted information.</p></div></div>
    <div class="activity-toolbar"><input id="activitySearch" type="search" placeholder="Search family member or email" aria-label="Search access log" /><button id="activityReload" class="button secondary" type="button">Refresh</button></div>
    <div id="activitySummary" class="activity-summary"></div>
    <div id="activityMessage" class="message" aria-live="polite"></div>
    <div id="activityList" class="activity-list"></div>`;
  panels.appendChild(panel);

  const button = document.createElement('button');
  button.className = 'nav-item';
  button.dataset.tab = 'activity';
  button.type = 'button';
  button.innerHTML = '<span>@</span><small>Activity</small>';
  button.addEventListener('click', activateActivity);
  nav.appendChild(button);

  panel.querySelector('#activitySearch')?.addEventListener('input', (event) => {
    state.search = event.target.value || '';
    renderOverview();
  });
  panel.querySelector('#activityReload')?.addEventListener('click', () => void loadOverview(true));
  document.getElementById('refreshButton')?.addEventListener('click', () => {
    if (panel.classList.contains('active')) void loadOverview(true);
  });
}

async function loadOverview(force = false) {
  if (state.loading || (state.loaded && !force)) return;
  const message = document.getElementById('activityMessage');
  state.loading = true;
  if (message) message.textContent = 'Loading family access activity...';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sign in to the admin companion again to view access activity.');
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
  const summary = document.getElementById('activitySummary');
  const list = document.getElementById('activityList');
  if (!summary || !list) return;

  const approved = state.rows.filter((row) => row.app_status === 'approved').length;
  const active = state.rows.filter(isActive).length;
  const submissions = state.rows.reduce((total, row) => total + Number(row.contribution_count || 0) + Number(row.tree_change_count || 0), 0);
  summary.innerHTML = `<div><strong>${approved}</strong><span>Approved</span></div><div><strong>${active}</strong><span>Active now</span></div><div><strong>${submissions}</strong><span>Submissions</span></div>`;

  const needle = state.search.trim().toLowerCase();
  const rows = state.rows.filter((row) => !needle || [row.display_name, row.email, row.linked_person_name].some((value) => String(value || '').toLowerCase().includes(needle)));
  if (!rows.length) {
    list.innerHTML = `<div class="activity-empty">${needle ? 'No family account matches that search.' : 'No family accounts are recorded yet.'}</div>`;
    return;
  }

  list.innerHTML = rows.map((row) => {
    const submissionsForUser = Number(row.contribution_count || 0) + Number(row.tree_change_count || 0);
    const statusClass = isActive(row) ? ' live' : row.access_request_status === 'pending' ? ' pending' : '';
    const recent = row.last_seen_at || row.last_sign_in_at || row.auth_created_at;
    return `<article class="activity-card" data-user-id="${esc(row.user_id)}">
      <button type="button" class="activity-card-main" data-activity-user="${esc(row.user_id)}" aria-expanded="false">
        <div class="activity-card-head"><div><strong>${esc(row.display_name || row.linked_person_name || 'Family account')}</strong><span class="activity-card-email">${esc(row.email || '')}</span></div><span class="activity-status${statusClass}">${esc(statusLabel(row))}</span></div>
        <div class="activity-card-meta">
          <div><b>Last sign-in</b><span>${esc(relativeTime(row.last_sign_in_at))}</span></div>
          <div><b>Last archive use</b><span>${esc(row.last_seen_at ? relativeTime(row.last_seen_at) : 'Not yet tracked')}</span></div>
        </div>
        <div class="activity-card-foot"><span>${submissionsForUser} submission${submissionsForUser === 1 ? '' : 's'}; ${Number(row.session_count || 0)} tracked session${Number(row.session_count || 0) === 1 ? '' : 's'}</span><span>${esc(recent ? relativeTime(recent) : '')}</span></div>
      </button>
      <div id="activity-detail-${esc(row.user_id)}" class="activity-detail hidden"></div>
    </article>`;
  }).join('');

  list.querySelectorAll('[data-activity-user]').forEach((button) => {
    button.addEventListener('click', () => void toggleDetail(button.dataset.activityUser, button));
  });
}

async function toggleDetail(userId, button) {
  const detail = document.getElementById(`activity-detail-${userId}`);
  if (!detail) return;
  const opening = detail.classList.contains('hidden');
  detail.classList.toggle('hidden', !opening);
  button.setAttribute('aria-expanded', opening ? 'true' : 'false');
  if (!opening || detail.dataset.loaded === 'true') return;
  detail.innerHTML = '<p class="activity-detail-title">Loading history...</p>';
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
  const add = (when, title, note = '') => { if (when) events.push({ when, title, note }); };

  add(row?.auth_created_at, 'Email account created', row?.access_request_status ? 'Email verification was completed before the family access request.' : 'No family access request is recorded for this account.');
  add(row?.access_requested_at, 'Family access requested', `Status: ${human(row?.access_request_status || 'unknown')}`);
  add(row?.approved_at, 'Family access approved', `${human(row?.role || 'family')} access linked to ${row?.linked_person_name || row?.display_name || 'family profile'}`);
  add(row?.last_sign_in_at, 'Most recent authentication sign-in', 'This is Supabase authentication history retained on the account, not a complete historical list of every sign-in.');

  sessions.forEach((session) => add(session.started_at, 'Archive session', `Last seen ${formatTime(session.last_seen_at)}${session.page_path ? `; ${session.page_path}` : ''}`));
  contributions.forEach((item) => add(item.created_at, `Contribution: ${human(item.contribution_type)}`, `Status: ${human(item.status)}`));
  changes.forEach((item) => add(item.created_at, `Tree change: ${human(item.change_type)}`, `Status: ${human(item.status)}`));

  events.sort((a, b) => new Date(b.when) - new Date(a.when));
  detail.innerHTML = `<p class="activity-detail-title">Account history</p>${events.length ? `<div class="activity-timeline">${events.map((event) => `<div class="activity-event"><time>${esc(formatTime(event.when))}</time><div><strong>${esc(event.title)}</strong>${event.note ? `<p>${esc(event.note)}</p>` : ''}</div></div>`).join('')}</div>` : '<div class="activity-empty">No activity has been recorded for this account.</div>'}`;
}

installUi();
