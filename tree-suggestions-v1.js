import { supabase } from './supabase-client-v1.js';
import { ancestryName } from './person-name-v1.js';


const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const personPanel = document.getElementById('personPanel');
const personName = document.getElementById('personName');

const state = {
  session: null,
  profile: null,
  people: [],
  relationships: [],
  byId: new Map(),
  selectedId: null,
  channel: null,
};

function canonicalName(person) {
  return ancestryName(person, { unknown: 'Unnamed person' });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function dateValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

function getPerson(id) {
  return state.byId.get(id) || null;
}

function activeRelationshipsOf(personId) {
  return state.relationships.filter((r) => r.is_active !== false && (r.person1_id === personId || r.person2_id === personId));
}

function relationshipLabel(relationship) {
  const otherId = relationship.person1_id === state.selectedId ? relationship.person2_id : relationship.person1_id;
  const other = getPerson(otherId);
  let label = relationship.relationship_type.replaceAll('_', ' ');
  if (relationship.relationship_type === 'parent') {
    label = relationship.person1_id === state.selectedId ? 'parent of' : 'child of';
  }
  return `${label}: ${canonicalName(other)}`;
}

function selectedPerson() {
  return getPerson(state.selectedId || centreSelect?.value) || null;
}

function setNotice(text = '', type = '') {
  const node = document.getElementById('treeSuggestionMessage');
  if (!node) return;
  node.textContent = text;
  node.className = `tree-suggestion-message${type ? ` ${type}` : ''}`;
}

function closeEditor() {
  document.getElementById('treeSuggestionEditor')?.classList.add('hidden');
}

function dispatchTreeRefresh() {
  document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
  document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
}

async function loadData() {
  const [peopleResult, relationshipsResult] = await Promise.all([
    supabase.from('people').select('*').order('surname').order('given_names'),
    supabase.from('relationships').select('*'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationshipsResult.error) throw relationshipsResult.error;
  state.people = peopleResult.data || [];
  state.relationships = relationshipsResult.data || [];
  state.byId = new Map(state.people.map((person) => [person.id, person]));
}

async function hasBlockingPendingChange(targetId) {
  const { data, error } = await supabase.from('tree_change_sets')
    .select('id, change_type, status')
    .eq('submitted_by', state.session.user.id)
    .eq('target_person_id', targetId)
    .eq('status', 'pending')
    .in('change_type', ['edit_person', 'remove_person'])
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function submitChange(changeType, targetPersonId, payload, beforeSnapshot = {}, baseUpdatedAt = null) {
  const { error } = await supabase.from('tree_change_sets').insert({
    submitted_by: state.session.user.id,
    target_person_id: targetPersonId,
    change_type: changeType,
    payload,
    before_snapshot: beforeSnapshot || {},
    base_updated_at: baseUpdatedAt || null,
    status: 'pending',
  });
  if (error) throw error;
  dispatchTreeRefresh();
  await loadData();
  renderEditorContents();
}

function personFields(person = {}) {
  const birthSurname = person.birth_surname || person.surname || '';
  return `
    <div class="tree-edit-grid">
      <label>Given name(s)<input name="given_names" required value="${esc(person.given_names || '')}" /></label>
      <label>Birth / maiden surname<input name="birth_surname" value="${esc(birthSurname)}" /></label>
      <label>Married / current surname<input name="current_surname" value="${esc(person.current_surname || '')}" /></label>
      <label>Known as<input name="preferred_name" value="${esc(person.preferred_name || '')}" /></label>
      <label>Gender<select name="gender"><option value="">Unknown / not recorded</option><option value="male"${person.gender === 'male' ? ' selected' : ''}>Male</option><option value="female"${person.gender === 'female' ? ' selected' : ''}>Female</option><option value="other"${person.gender === 'other' ? ' selected' : ''}>Other</option></select></label>
      <label>Birth date<input type="date" name="birth_date" value="${esc(dateValue(person.birth_date))}" /></label>
      <label>Death date<input type="date" name="death_date" value="${esc(dateValue(person.death_date))}" /></label>
      <label>Birth place<input name="birth_place" value="${esc(person.birth_place || '')}" /></label>
      <label>Death place<input name="death_place" value="${esc(person.death_place || '')}" /></label>
    </div>
    <p class="tree-surname-standard">The family fan always uses the birth surname. A married or current surname is kept separately and never replaces it.</p>
    <label>Occupation<input name="occupation_summary" value="${esc(person.occupation_summary || '')}" /></label>
    <label>Family note<textarea name="narrative_summary" rows="3">${esc(person.narrative_summary || '')}</textarea></label>`;
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

function addRelativeForm(person) {
  return `
    <form id="addRelativeSuggestionForm" class="tree-edit-form">
      <p class="tree-edit-explainer">This relative will appear in your tree immediately with a <strong>Pending review</strong> marker. Other family members keep seeing the approved tree until the change is accepted.</p>
      <label>Relationship to ${esc(canonicalName(person))}
        <select name="role" id="treeRelativeRole" required>
          <option value="parent">Parent</option>
          <option value="sibling">Sibling</option>
          <option value="spouse">Spouse</option>
          <option value="partner">Partner</option>
          <option value="child">Child</option>
        </select>
      </label>
      ${personFields({})}
      <div id="treeRelationshipStatusFields" class="tree-relationship-fields hidden">
        <label>Relationship status<select name="relationship_status"><option value="current">Current</option><option value="ended_by_death">Ended by death</option><option value="ended">Ended / separated</option></select></label>
        <label>Relationship note<input name="date_note" placeholder="Optional marriage or relationship note" /></label>
      </div>
      <div class="tree-edit-actions"><button class="button primary" type="submit">Add to my tree for review</button><button class="button ghost" type="button" data-cancel-tree-edit>Cancel</button></div>
    </form>`;
}

function editPersonForm(person) {
  return `
    <form id="editPersonSuggestionForm" class="tree-edit-form">
      <p class="tree-edit-explainer">You will see the proposed values immediately. The approved record is preserved until an editor accepts this change.</p>
      ${personFields(person)}
      <div class="tree-edit-actions"><button class="button primary" type="submit">Apply proposed changes</button><button class="button ghost" type="button" data-cancel-tree-edit>Cancel</button></div>
    </form>`;
}

function removeRelationshipForm(person) {
  const options = activeRelationshipsOf(person.id)
    .filter((relationship) => !String(relationship.id).startsWith('pending-rel:'))
    .map((relationship) => `<option value="${esc(relationship.id)}">${esc(relationshipLabel(relationship))}</option>`)
    .join('');
  if (!options) return '<p class="tree-edit-explainer">There are no approved relationships on this person that can be proposed for removal.</p>';
  return `
    <form id="removeRelationshipSuggestionForm" class="tree-edit-form">
      <p class="tree-edit-explainer">The selected relationship will disappear from your working view immediately, but the approved record remains recoverable until review.</p>
      <label>Relationship<select name="relationship_id" required>${options}</select></label>
      <label>Reason / note<textarea name="reason" rows="3" placeholder="Why should this relationship be removed?"></textarea></label>
      <div class="tree-edit-actions"><button class="button danger" type="submit">Propose relationship removal</button><button class="button ghost" type="button" data-cancel-tree-edit>Cancel</button></div>
    </form>`;
}

function renderEditorContents(mode = null) {
  const wrapper = document.getElementById('treeSuggestionEditor');
  const person = selectedPerson();
  const launch = document.getElementById('openTreeSuggestionEditor');
  if (launch) {
    launch.disabled = !person || String(person.id).startsWith('pending:');
    launch.textContent = person && !String(person.id).startsWith('pending:') ? `Edit ${canonicalName(person)}` : 'Edit family';
  }
  if (!wrapper || wrapper.classList.contains('hidden') || !person) return;
  if (String(person.id).startsWith('pending:')) {
    wrapper.innerHTML = '<p class="tree-edit-explainer">This person is already pending review. Further edits can be made after the first change is approved or rejected.</p>';
    return;
  }

  const activeMode = mode || wrapper.dataset.mode || 'menu';
  wrapper.dataset.mode = activeMode;
  if (activeMode === 'add') wrapper.innerHTML = addRelativeForm(person);
  else if (activeMode === 'edit') wrapper.innerHTML = editPersonForm(person);
  else if (activeMode === 'relationship') wrapper.innerHTML = removeRelationshipForm(person);
  else {
    wrapper.innerHTML = `
      <div class="tree-edit-menu-head"><div><span>Working tree</span><strong>${esc(canonicalName(person))}</strong></div><button type="button" class="tree-editor-close" data-cancel-tree-edit aria-label="Close">x</button></div>
      <p class="tree-edit-explainer">Your changes appear immediately in your own tree. They stay reversible until reviewed.</p>
      <div class="tree-edit-menu">
        <button type="button" data-tree-mode="add"><strong>Add relative</strong><span>Parent, sibling, spouse, partner or child</span></button>
        <button type="button" data-tree-mode="edit"><strong>Edit details</strong><span>Name, dates, places or family note</span></button>
        <button type="button" data-tree-mode="relationship"><strong>Remove relationship</strong><span>Hide a family link pending review</span></button>
        <button type="button" class="danger" data-tree-remove-person><strong>Remove from tree</strong><span>Hide this person and connected links pending review</span></button>
      </div>`;
  }
  bindEditorActions(person);
}

function bindEditorActions(person) {
  const wrapper = document.getElementById('treeSuggestionEditor');
  if (!wrapper) return;
  wrapper.querySelectorAll('[data-cancel-tree-edit]').forEach((button) => button.addEventListener('click', () => {
    if (wrapper.dataset.mode && wrapper.dataset.mode !== 'menu') {
      wrapper.dataset.mode = 'menu';
      renderEditorContents('menu');
    } else closeEditor();
  }));
  wrapper.querySelectorAll('[data-tree-mode]').forEach((button) => button.addEventListener('click', () => {
    wrapper.dataset.mode = button.dataset.treeMode;
    renderEditorContents(button.dataset.treeMode);
  }));

  const role = wrapper.querySelector('#treeRelativeRole');
  const relationshipFields = wrapper.querySelector('#treeRelationshipStatusFields');
  const updateRelationshipFields = () => relationshipFields?.classList.toggle('hidden', !['spouse','partner'].includes(role?.value));
  role?.addEventListener('change', updateRelationshipFields);
  updateRelationshipFields();

  wrapper.querySelector('#addRelativeSuggestionForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setNotice('Adding this relative to your working tree...');
    try {
      const payload = {
        role: formData.get('role'),
        relationship_status: formData.get('relationship_status') || 'current',
        date_note: String(formData.get('date_note') || '').trim() || null,
        relative: valuesFromForm(form),
      };
      await submitChange('add_relative', person.id, payload, { target: person }, person.updated_at || null);
      setNotice('Added to your working tree. It is now waiting for review.', 'success');
      closeEditor();
    } catch (error) { setNotice(error.message || 'Unable to submit this family change.', 'error'); }
  });

  wrapper.querySelector('#editPersonSuggestionForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setNotice('Applying the proposed details to your working tree...');
    try {
      if (await hasBlockingPendingChange(person.id)) throw new Error('There is already a pending edit or removal for this person.');
      await submitChange('edit_person', person.id, { after: valuesFromForm(event.currentTarget) }, { person }, person.updated_at || null);
      setNotice('Your proposed details are visible now and waiting for review.', 'success');
      closeEditor();
    } catch (error) { setNotice(error.message || 'Unable to submit this edit.', 'error'); }
  });

  wrapper.querySelector('#removeRelationshipSuggestionForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const relationship = state.relationships.find((r) => r.id === formData.get('relationship_id'));
    if (!relationship) return;
    setNotice('Hiding this relationship from your working tree...');
    try {
      await submitChange('remove_relationship', person.id, {
        relationship_id: relationship.id,
        reason: String(formData.get('reason') || '').trim() || null,
      }, { relationship }, relationship.updated_at || null);
      setNotice('Relationship hidden in your working tree and waiting for review.', 'success');
      closeEditor();
    } catch (error) { setNotice(error.message || 'Unable to submit this relationship change.', 'error'); }
  });

  wrapper.querySelector('[data-tree-remove-person]')?.addEventListener('click', async () => {
    if (!window.confirm(`Hide ${canonicalName(person)} from your working tree and send that removal for review? Nothing will be permanently deleted.`)) return;
    setNotice('Hiding this person from your working tree...');
    try {
      if (await hasBlockingPendingChange(person.id)) throw new Error('There is already a pending edit or removal for this person.');
      await submitChange('remove_person', person.id, { reason: 'Family member proposed removal from active tree.' }, { person, relationships: activeRelationshipsOf(person.id) }, person.updated_at || null);
      setNotice('Person hidden from your working tree. The approved record is preserved pending review.', 'success');
      closeEditor();
      if (centreSelect?.value === person.id && state.profile?.person_id) {
        centreSelect.value = state.profile.person_id;
        centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (error) { setNotice(error.message || 'Unable to submit this removal.', 'error'); }
  });
}

function installUi() {
  if (!personPanel || document.getElementById('treeSuggestionTools')) return;
  const tools = document.createElement('div');
  tools.id = 'treeSuggestionTools';
  tools.className = 'tree-suggestion-tools';
  tools.innerHTML = `
    <div class="tree-suggestion-divider"></div>
    <button id="openTreeSuggestionEditor" class="button secondary tree-edit-launch" type="button">Edit family</button>
    <p class="tree-edit-caption">Changes you make are visible in your working tree immediately and remain reversible until reviewed.</p>
    <p id="treeSuggestionMessage" class="tree-suggestion-message" aria-live="polite"></p>
    <div id="treeSuggestionEditor" class="tree-suggestion-editor hidden" data-mode="menu"></div>`;
  personPanel.appendChild(tools);
  document.getElementById('openTreeSuggestionEditor').addEventListener('click', () => {
    const editor = document.getElementById('treeSuggestionEditor');
    editor.classList.remove('hidden');
    editor.dataset.mode = 'menu';
    renderEditorContents('menu');
  });
}

function installStyles() {
  if (document.getElementById('treeSuggestionStyles')) return;
  const style = document.createElement('style');
  style.id = 'treeSuggestionStyles';
  style.textContent = `
    .tree-suggestion-divider{height:1px;background:rgba(91,72,55,.15);margin:16px 0 12px}
    .tree-edit-launch{width:100%}
    .tree-edit-caption{font-size:11px;line-height:1.45;color:#74675b;margin:7px 0 0}
    .tree-suggestion-message{font-size:11px;margin:8px 0 0;color:#66584b}.tree-suggestion-message.success{color:#3f6c4b}.tree-suggestion-message.error{color:#9a453e}
    .tree-suggestion-editor{margin-top:12px;padding:13px;border:1px solid rgba(93,72,53,.22);border-radius:14px;background:#fffaf2;box-shadow:0 8px 24px rgba(48,38,29,.08)}
    .tree-suggestion-editor.hidden{display:none}.tree-edit-menu-head{display:flex;justify-content:space-between;gap:10px;align-items:start;margin-bottom:8px}.tree-edit-menu-head div{display:grid;gap:2px}.tree-edit-menu-head span{font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:#8b7c6f}.tree-edit-menu-head strong{font-size:13px;color:#3d3229}.tree-editor-close{border:0;background:transparent;font-size:16px;cursor:pointer;color:#6f6155}
    .tree-edit-explainer,.tree-surname-standard{font-size:11px;line-height:1.5;color:#6d6055;margin:5px 0 12px}.tree-surname-standard{margin:0;padding:8px 10px;border-left:3px solid #b6926d;background:#f7efe5}.tree-edit-menu{display:grid;gap:7px}.tree-edit-menu button{display:grid;text-align:left;gap:2px;padding:10px;border:1px solid rgba(93,72,53,.18);border-radius:11px;background:#f5ecdf;color:#3d3229;cursor:pointer}.tree-edit-menu button span{font-size:10px;color:#776a5f}.tree-edit-menu button.danger{background:#fff4f1;border-color:rgba(160,70,60,.22)}
    .tree-edit-form{display:grid;gap:10px}.tree-edit-form label{display:grid;gap:4px;font-size:10px;font-weight:700;color:#55483d}.tree-edit-form input,.tree-edit-form select,.tree-edit-form textarea{width:100%;box-sizing:border-box;border:1px solid rgba(93,72,53,.24);border-radius:9px;padding:8px;background:white;color:#3d3229;font:inherit;font-weight:400}.tree-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tree-edit-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}.tree-relationship-fields{display:grid;grid-template-columns:1fr;gap:8px}.tree-relationship-fields.hidden{display:none}
    @media(max-width:760px){.tree-edit-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function updateSelectionFromEvent(event) {
  const target = event.target.closest?.('[data-person-id]');
  if (!target || !treeCanvas?.contains(target)) return;
  state.selectedId = target.dataset.personId;
  renderEditorContents();
}

function subscribeToOwnChanges() {
  state.channel?.unsubscribe();
  state.channel = supabase.channel(`tree-changes-${state.session.user.id}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'tree_change_sets', filter: `submitted_by=eq.${state.session.user.id}`,
    }, async (payload) => {
      dispatchTreeRefresh();
      await loadData();
      renderEditorContents();
      const status = payload.new?.status;
      if (status === 'approved') setNotice('A proposed tree change was approved and is now part of the shared tree.', 'success');
      if (status === 'rejected') setNotice('A proposed tree change was rejected; your tree has returned to the approved version.');
      if (status === 'conflict') setNotice('A proposed change needs review because the approved tree changed in the meantime.', 'error');
    })
    .subscribe();
}

async function start(session) {
  if (!session || !personPanel || !treeCanvas || !centreSelect) return;
  state.session = session;
  const { data: profile, error } = await supabase.from('app_users').select('user_id, person_id, role, status').eq('user_id', session.user.id).maybeSingle();
  if (error || profile?.status !== 'approved') return;
  state.profile = profile;
  installStyles();
  installUi();
  await loadData();
  state.selectedId = centreSelect.value || profile.person_id || null;
  renderEditorContents();
  subscribeToOwnChanges();
}

treeCanvas?.addEventListener('click', updateSelectionFromEvent, true);
treeCanvas?.addEventListener('keydown', updateSelectionFromEvent, true);
centreSelect?.addEventListener('change', () => {
  state.selectedId = centreSelect.value || null;
  closeEditor();
  renderEditorContents();
});

const nameObserver = personName ? new MutationObserver(() => renderEditorContents()) : null;
if (personName && nameObserver) nameObserver.observe(personName, { childList: true, characterData: true, subtree: true });

document.addEventListener('genealogy:tree-suggestions-updated', async () => {
  if (!state.session) return;
  try { await loadData(); renderEditorContents(); } catch { /* best-effort refresh */ }
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) start(session).catch(() => {});
});
const { data: { session } } = await supabase.auth.getSession();
if (session) await start(session);
