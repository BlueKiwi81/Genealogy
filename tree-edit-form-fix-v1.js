import { supabase } from './supabase-client-v1.js';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';

const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
let selectedId = centreSelect?.value || null;
let pendingEditTargetId = null;

function setNotice(text = '', type = '') {
  const node = document.getElementById('treeSuggestionMessage');
  if (!node) return;
  node.textContent = text;
  node.className = `tree-suggestion-message${type ? ` ${type}` : ''}`;
}

function valuesFromForm(form) {
  const formData = new FormData(form);
  const object = {};
  ['given_names','birth_surname','current_surname','preferred_name','gender','birth_date','death_date','birth_place','death_place','occupation_summary','narrative_summary'].forEach((key) => {
    object[key] = String(formData.get(key) || '').trim() || null;
  });
  object.surname = object.birth_surname || object.current_surname || null;
  return object;
}

function captureEditTarget(event) {
  const button = event.target.closest?.('[data-tree-mode="edit"]');
  if (!button || !button.closest?.('#treeSuggestionEditor')) return;
  const candidate = selectedId || centreSelect?.value || null;
  pendingEditTargetId = candidate && !String(candidate).startsWith('pending:') ? candidate : null;
}

function pinEditForm(form) {
  if (!(form instanceof HTMLFormElement) || form.id !== 'editPersonSuggestionForm') return;
  if (form.dataset.targetPersonId) return;
  const candidate = pendingEditTargetId || selectedId || centreSelect?.value || null;
  if (candidate && !String(candidate).startsWith('pending:')) {
    form.dataset.targetPersonId = String(candidate);
  }
  pendingEditTargetId = null;
}

function scanForEditForms(root = document) {
  if (root instanceof HTMLFormElement) pinEditForm(root);
  root.querySelectorAll?.('#editPersonSuggestionForm').forEach(pinEditForm);
}

async function loadCanonicalPerson(targetId, session) {
  const fetcher = window.__genealogyOriginalFetch || window.fetch.bind(window);
  const params = new URLSearchParams({
    select: '*',
    id: `eq.${targetId}`,
    limit: '1',
  });
  const response = await fetcher(`${SUPABASE_URL}/rest/v1/people?${params}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error('The selected family record could not be loaded.');
  const payload = await response.json();
  const person = Array.isArray(payload) ? payload[0] : payload;
  if (!person || person.id !== targetId) throw new Error('The selected family record could not be loaded.');
  return person;
}

async function submitSafeEdit(form) {
  const targetId = form.dataset.targetPersonId || null;
  if (!targetId) throw new Error('This edit lost its link to the selected family record. Close it, select the person again, and reopen Edit details.');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again before changing family information.');

  const { data: profile, error: profileError } = await supabase.from('app_users')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== 'approved') throw new Error('Your family access must be approved before changing family information.');

  // Always snapshot the approved canonical row directly. This deliberately
  // bypasses the contributor's pending working-tree overlay so an unrelated
  // pending relative cannot turn a single-person lookup into multiple rows.
  const person = await loadCanonicalPerson(targetId, session);

  const { data: pending, error: pendingError } = await supabase.from('tree_change_sets')
    .select('id')
    .eq('submitted_by', session.user.id)
    .eq('target_person_id', targetId)
    .eq('status', 'pending')
    .in('change_type', ['edit_person', 'remove_person'])
    .limit(1);
  if (pendingError) throw pendingError;
  if (pending?.length) throw new Error('There is already a pending edit or removal for this person.');

  const after = valuesFromForm(form);
  const { error } = await supabase.from('tree_change_sets').insert({
    submitted_by: session.user.id,
    target_person_id: targetId,
    change_type: 'edit_person',
    payload: { after },
    before_snapshot: { person },
    base_updated_at: person.updated_at || null,
    status: 'pending',
  });
  if (error) throw error;

  setNotice('Your proposed details are visible now and waiting for review.', 'success');
  document.getElementById('treeSuggestionEditor')?.classList.add('hidden');
  document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
  document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
}

treeCanvas?.addEventListener('click', (event) => {
  const target = event.target.closest?.('[data-person-id]');
  if (target?.dataset?.personId) selectedId = target.dataset.personId;
}, true);

centreSelect?.addEventListener('change', () => {
  selectedId = centreSelect.value || null;
  pendingEditTargetId = null;
});

// Capture the person's immutable database id before the edit form is rendered.
// The form is then pinned to that id for its whole lifetime; submission never
// re-resolves the target from a name, centre selector, or later UI state.
document.addEventListener('click', captureEditTarget, true);

scanForEditForms();
const editFormObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    scanForEditForms(node);
  }));
});
editFormObserver.observe(document.body, { childList: true, subtree: true });

// The original edit handler reads event.currentTarget after an await. In browsers
// currentTarget is no longer guaranteed to be the form at that point, which causes
// "Failed to construct FormData". Capture the form synchronously and own this one
// submit path before the legacy target listener runs.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'editPersonSuggestionForm') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  pinEditForm(form);
  setNotice('Applying the proposed details to your working tree...');
  void submitSafeEdit(form).catch((error) => {
    setNotice(error?.message || 'Unable to submit this edit.', 'error');
  });
}, true);
