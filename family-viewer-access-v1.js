import { supabase } from './supabase-client-v1.js';

const REGISTRATION_KEY = 'genealogyRegistrationDraft';
const VIEWER_ROLE = 'viewer';

const $ = (id) => document.getElementById(id);

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(REGISTRATION_KEY) || 'null') || {};
  } catch {
    return {};
  }
}

function writeDraft(patch = {}) {
  const current = readDraft();
  localStorage.setItem(REGISTRATION_KEY, JSON.stringify({ ...current, ...patch }));
}

function relatedName() {
  return ($('registerRelatedTo')?.value || $('completeRelatedTo')?.value || readDraft().related_to_name || '').trim();
}

function fieldMarkup(id) {
  return `
    <label for="${id}">Who on this tree are you related to?</label>
    <input id="${id}" type="text" autocomplete="off" placeholder="Full name of a relative already in the tree" />
    <p class="privacy-note family-viewer-hint">If your own name and date of birth already match a living person in the tree, you can leave this blank. Otherwise, enter the full name of a relative already shown in the family tree.</p>`;
}

function insertAfter(reference, nodes) {
  const parent = reference?.parentNode;
  if (!parent) return;
  let cursor = reference;
  nodes.forEach((node) => {
    cursor.insertAdjacentElement('afterend', node);
    cursor = node;
  });
}

function addField(formId, dateInputId, fieldId) {
  const form = $(formId);
  if (!form || $(fieldId)) return;
  const dateInput = $(dateInputId);
  if (!dateInput) return;

  const host = document.createElement('div');
  host.innerHTML = fieldMarkup(fieldId);
  const nodes = [...host.children];
  insertAfter(dateInput, nodes);
}

function refreshRegistrationCopy() {
  const registerIntro = $('registerForm')?.querySelector('p');
  if (registerIntro) {
    registerIntro.textContent = 'Verify your email and tell us who you are. A confident family match can open read-only access immediately.';
  }

  const registerPrivacy = $('registerForm')?.querySelector('.privacy-note:not(.family-viewer-hint)');
  if (registerPrivacy) {
    registerPrivacy.textContent = 'Your date of birth helps match you to an existing living family record. An automatic match gives viewing access only; contributing still requires family-editor approval.';
  }

  const completeLede = $('registrationFormWrap')?.querySelector('.lede');
  if (completeLede) {
    completeLede.textContent = 'Your email is verified. These details help us identify you. If the match is clear, you can enter the family archive immediately with read-only access.';
  }
}

function installRegistrationFields() {
  addField('registerForm', 'registerBirthDate', 'registerRelatedTo');
  addField('completeRegistrationForm', 'completeBirthDate', 'completeRelatedTo');
  refreshRegistrationCopy();

  const draft = readDraft();
  if ($('registerRelatedTo') && !$('registerRelatedTo').value) $('registerRelatedTo').value = draft.related_to_name || '';
  if ($('completeRelatedTo') && !$('completeRelatedTo').value) $('completeRelatedTo').value = draft.related_to_name || '';

  $('registerRelatedTo')?.addEventListener('input', () => writeDraft({ related_to_name: $('registerRelatedTo').value.trim() }));
  $('completeRelatedTo')?.addEventListener('input', () => writeDraft({ related_to_name: $('completeRelatedTo').value.trim() }));

  // This listener is installed before otp-auth-v2's own submit listener. The
  // microtask runs after that listener has saved its ordinary registration draft.
  $('registerForm')?.addEventListener('submit', () => {
    const value = $('registerRelatedTo')?.value.trim() || '';
    queueMicrotask(() => writeDraft({ related_to_name: value }));
  }, true);

  $('completeRegistrationForm')?.addEventListener('submit', () => {
    const value = $('completeRelatedTo')?.value.trim() || readDraft().related_to_name || '';
    writeDraft({ related_to_name: value });
  }, true);
}

function isAccessRequestPost(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || '';
  const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
  return method === 'POST' && /\/rest\/v1\/access_requests(?:\?|$)/.test(url);
}

function addRelatedNameToBody(body) {
  if (typeof body !== 'string' || !body.trim()) return body;
  try {
    const parsed = JSON.parse(body);
    const value = relatedName();
    const apply = (row) => row && typeof row === 'object' ? { ...row, related_to_name: value || null } : row;
    return JSON.stringify(Array.isArray(parsed) ? parsed.map(apply) : apply(parsed));
  } catch {
    return body;
  }
}

async function openViewerIfGranted() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return;
  const { data, error } = await supabase
    .from('app_users')
    .select('role,status')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error || data?.status !== 'approved' || data?.role !== VIEWER_ROLE) return;
  window.location.reload();
}

function installAccessRequestBridge() {
  if (window.__genealogyViewerAccessFetchInstalled) return;
  window.__genealogyViewerAccessFetchInstalled = true;
  const previousFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const target = isAccessRequestPost(input, init);
    const nextInit = target ? { ...init, body: addRelatedNameToBody(init?.body) } : init;
    const response = await previousFetch(input, nextInit);

    if (target && response.ok) {
      window.setTimeout(() => {
        void openViewerIfGranted().catch(() => {});
      }, 180);
    }
    return response;
  };
}

function installViewerStyles() {
  if ($('familyViewerAccessStyles')) return;
  const style = document.createElement('style');
  style.id = 'familyViewerAccessStyles';
  style.textContent = `
    .family-viewer-banner { margin:0 0 16px; border:1px solid var(--line); border-radius:14px; background:#faf6ef; padding:13px 15px; }
    .family-viewer-banner strong { display:block; margin-bottom:4px; color:var(--ink); font:700 .9rem/1.3 Arial,sans-serif; }
    .family-viewer-banner p { margin:0; color:var(--muted); font:.84rem/1.5 Arial,sans-serif; }
    body.family-viewer-mode #contributionForm { display:none !important; }
    body.family-viewer-mode #contributionMessage { display:block; }
    .viewer-access-note { margin:8px 0 0; color:var(--muted); font:.8rem/1.45 Arial,sans-serif; }
  `;
  document.head.appendChild(style);
}

async function applyViewerMode() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return false;
  const { data, error } = await supabase
    .from('app_users')
    .select('role,status')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error || data?.status !== 'approved' || data?.role !== VIEWER_ROLE) return false;

  installViewerStyles();
  document.body.classList.add('family-viewer-mode');

  const appArea = $('appArea');
  if (appArea && !appArea.querySelector('.family-viewer-banner')) {
    const banner = document.createElement('div');
    banner.className = 'family-viewer-banner';
    banner.innerHTML = '<strong>Read-only family access</strong><p>You can explore the family archive now. Adding or changing family information stays locked until the family editor confirms your family link and upgrades your access.</p>';
    appArea.insertAdjacentElement('afterbegin', banner);
  }

  const contributionMessage = $('contributionMessage');
  if (contributionMessage) {
    contributionMessage.textContent = 'Read-only access is active. Contribution tools will appear after the family editor confirms your registration.';
    contributionMessage.className = 'message';
  }

  return true;
}

async function decorateAccessQueue() {
  const queue = $('accessQueue');
  if (!queue) return;
  const cards = [...queue.querySelectorAll('[data-access-id]')];
  if (!cards.length) return;

  const ids = cards.map((card) => card.dataset.accessId).filter(Boolean);
  const { data, error } = await supabase
    .from('access_requests')
    .select('id,related_to_name,viewer_match_method,viewer_granted_at')
    .in('id', ids);
  if (error) return;
  const byId = new Map((data || []).map((row) => [row.id, row]));

  cards.forEach((card) => {
    if (card.dataset.viewerAccessDecorated === 'true') return;
    const row = byId.get(card.dataset.accessId);
    if (!row) return;
    const evidence = card.querySelector('.registration-evidence');
    if (!evidence) return;

    const note = document.createElement('div');
    const label = row.related_to_name ? 'Related to' : 'Immediate viewing';
    let value = row.related_to_name || 'No relative named';
    if (row.viewer_match_method === 'self') value = 'Read-only access granted - exact self match';
    if (row.viewer_match_method === 'relative_name') value = `Read-only access granted - matched ${row.related_to_name || 'named relative'}`;
    note.innerHTML = `<strong>${label}</strong><span>${value}</span>`;
    evidence.appendChild(note);
    card.dataset.viewerAccessDecorated = 'true';
  });
}

function watchEditorQueue() {
  const queue = $('accessQueue');
  if (!queue || queue.dataset.viewerAccessWatched === 'true') return;
  queue.dataset.viewerAccessWatched = 'true';
  const observer = new MutationObserver(() => void decorateAccessQueue());
  observer.observe(queue, { childList: true, subtree: true });
  void decorateAccessQueue();
}

installRegistrationFields();
installAccessRequestBridge();
watchEditorQueue();
void applyViewerMode();

document.addEventListener('genealogy:archive-ready', () => {
  void applyViewerMode();
});
