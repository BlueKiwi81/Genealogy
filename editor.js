import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const editorArea = document.getElementById('editorArea');
const editorMessage = document.getElementById('editorMessage');
const accessQueue = document.getElementById('accessQueue');
const contributionQueue = document.getElementById('contributionQueue');
const refreshEditor = document.getElementById('refreshEditor');

let currentUser = null;
let people = [];
let peopleById = new Map();
let appUsersById = new Map();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function displayName(person) {
  if (!person) return 'Unlinked person';
  const preferred = person.preferred_name?.trim();
  return [preferred || person.given_names, person.surname].filter(Boolean).join(' ');
}

function setMessage(text = '', type = '') {
  editorMessage.textContent = text;
  editorMessage.className = `message${type ? ` ${type}` : ''}`;
}

function personOptions(selectedId = '') {
  return [...people]
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
    .map((person) => `<option value="${esc(person.id)}"${person.id === selectedId ? ' selected' : ''}>${esc(displayName(person))}</option>`)
    .join('');
}

async function getEditorProfile(userId) {
  const { data, error } = await supabase
    .from('app_users')
    .select('user_id, role, status, display_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadReferenceData() {
  const [peopleResult, usersResult] = await Promise.all([
    supabase.from('people').select('id, slug, given_names, preferred_name, surname, birth_date'),
    supabase.from('app_users').select('user_id, person_id, display_name, role, status'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (usersResult.error) throw usersResult.error;
  people = peopleResult.data || [];
  peopleById = new Map(people.map((person) => [person.id, person]));
  appUsersById = new Map((usersResult.data || []).map((user) => [user.user_id, user]));
}

async function loadAccessQueue() {
  const { data, error } = await supabase
    .from('access_requests')
    .select('id, user_id, display_name, email, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  renderAccessQueue(data || []);
}

function renderAccessQueue(requests) {
  if (!requests.length) {
    accessQueue.innerHTML = '<div class="queue-empty">No family access requests are waiting.</div>';
    return;
  }

  accessQueue.innerHTML = requests.map((request) => `
    <article class="queue-card" data-access-id="${esc(request.id)}">
      <p class="queue-title">${esc(request.display_name)}</p>
      <p class="queue-meta">${esc(request.email)}</p>
      <label class="queue-field">
        <span>Link this login to</span>
        <select data-person>${personOptions()}</select>
      </label>
      <label class="queue-field">
        <span>Access level</span>
        <select data-role>
          <option value="family">Family</option>
          <option value="editor">Editor</option>
        </select>
      </label>
      <div class="queue-actions">
        <button class="button primary" type="button" data-approve>Approve and link</button>
        <button class="button danger" type="button" data-reject>Reject</button>
      </div>
    </article>
  `).join('');

  accessQueue.querySelectorAll('[data-access-id]').forEach((card) => {
    const request = requests.find((item) => item.id === card.dataset.accessId);
    card.querySelector('[data-approve]').addEventListener('click', () => approveAccess(request, card));
    card.querySelector('[data-reject]').addEventListener('click', () => rejectAccess(request));
  });
}

async function approveAccess(request, card) {
  const personId = card.querySelector('[data-person]').value;
  const role = card.querySelector('[data-role]').value;
  if (!personId) return;
  setMessage(`Approving ${request.display_name}...`);

  const { error: userError } = await supabase.from('app_users').upsert({
    user_id: request.user_id,
    person_id: personId,
    display_name: request.display_name,
    role,
    status: 'approved',
    approved_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (userError) {
    setMessage(userError.message, 'error');
    return;
  }

  const { error: requestError } = await supabase
    .from('access_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', request.id);
  if (requestError) {
    setMessage(requestError.message, 'error');
    return;
  }

  setMessage(`${request.display_name} can now access the family archive.`, 'success');
  await refreshQueues();
}

async function rejectAccess(request) {
  const { error } = await supabase
    .from('access_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', request.id);
  if (error) {
    setMessage(error.message, 'error');
    return;
  }
  setMessage(`Access request from ${request.display_name} was rejected.`, 'success');
  await refreshQueues();
}

async function loadContributionQueue() {
  const { data, error } = await supabase
    .from('contributions')
    .select('id, submitted_by, target_person_id, contribution_type, original_language, narrative_text, payload, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  renderContributionQueue(data || []);
}

function contributorName(userId) {
  return appUsersById.get(userId)?.display_name || 'Family contributor';
}

function renderContributionQueue(items) {
  if (!items.length) {
    contributionQueue.innerHTML = '<div class="queue-empty">No family contributions are waiting.</div>';
    return;
  }

  contributionQueue.innerHTML = items.map((item) => {
    const target = peopleById.get(item.target_person_id);
    const targetText = target ? `About ${displayName(target)}` : 'General family contribution';
    const storyAction = item.contribution_type === 'story' && item.target_person_id
      ? '<button class="button primary" type="button" data-publish-story>Approve story</button>'
      : '<button class="button primary" type="button" data-approve-note>Approve for incorporation</button>';
    return `
      <article class="queue-card" data-contribution-id="${esc(item.id)}">
        <p class="queue-title">${esc(item.contribution_type.replaceAll('_', ' '))}</p>
        <p class="queue-meta">${esc(contributorName(item.submitted_by))} · ${esc(targetText)} · language: ${esc(item.original_language)}</p>
        <label class="queue-field">
          <span>Original contribution is preserved. Edit the approved wording below.</span>
          <textarea data-edit rows="6">${esc(item.narrative_text || '')}</textarea>
        </label>
        <div class="queue-actions">
          ${storyAction}
          <button class="button danger" type="button" data-reject>Reject</button>
        </div>
      </article>
    `;
  }).join('');

  contributionQueue.querySelectorAll('[data-contribution-id]').forEach((card) => {
    const item = items.find((entry) => entry.id === card.dataset.contributionId);
    card.querySelector('[data-publish-story]')?.addEventListener('click', () => approveStory(item, card));
    card.querySelector('[data-approve-note]')?.addEventListener('click', () => approveForIncorporation(item, card));
    card.querySelector('[data-reject]').addEventListener('click', () => rejectContribution(item));
  });
}

async function approveStory(item, card) {
  const editedText = card.querySelector('[data-edit]').value.trim();
  if (!editedText) return;
  setMessage('Publishing approved story...');

  const { error: narrativeError } = await supabase.from('narratives').insert({
    person_id: item.target_person_id,
    title: 'Family recollection',
    original_language: item.original_language || 'en',
    original_text: item.narrative_text || '',
    edited_text: editedText,
    narrative_status: 'approved',
    source_status: 'family_supplied',
  });
  if (narrativeError) {
    setMessage(narrativeError.message, 'error');
    return;
  }

  await finishContribution(item.id, 'approved', 'Approved as a family narrative.');
  setMessage('The story has been approved while preserving the original contribution.', 'success');
  await refreshQueues();
}

async function approveForIncorporation(item, card) {
  const editorText = card.querySelector('[data-edit]').value.trim();
  await finishContribution(item.id, 'approved', editorText || 'Approved for structured incorporation into the canonical tree.');
  setMessage('Contribution approved for incorporation. The canonical person/relationship fields are not silently changed.', 'success');
  await refreshQueues();
}

async function rejectContribution(item) {
  await finishContribution(item.id, 'rejected', 'Rejected by family editor.');
  setMessage('Contribution rejected; the original submission remains preserved in the database.', 'success');
  await refreshQueues();
}

async function finishContribution(id, status, reviewNote) {
  const { error } = await supabase
    .from('contributions')
    .update({
      status,
      review_note: reviewNote,
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

async function refreshQueues() {
  try {
    await loadReferenceData();
    await Promise.all([loadAccessQueue(), loadContributionQueue()]);
  } catch (error) {
    setMessage(error.message || 'Unable to load editor queues.', 'error');
  }
}

async function evaluateEditor(session) {
  if (!session) {
    editorArea.classList.add('hidden');
    return;
  }
  currentUser = session.user;
  try {
    const profile = await getEditorProfile(session.user.id);
    const isEditor = profile?.status === 'approved' && ['editor', 'admin'].includes(profile.role);
    if (!isEditor) {
      editorArea.classList.add('hidden');
      return;
    }
    editorArea.classList.remove('hidden');
    await refreshQueues();
  } catch (error) {
    editorArea.classList.add('hidden');
  }
}

refreshEditor.addEventListener('click', refreshQueues);
supabase.auth.onAuthStateChange((_event, session) => evaluateEditor(session));
const { data: { session } } = await supabase.auth.getSession();
await evaluateEditor(session);
