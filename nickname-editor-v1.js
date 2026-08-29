import { supabase } from './supabase-client-v1.js';

const queue = document.getElementById('contributionQueue');
const editorMessage = document.getElementById('editorMessage');
const refreshEditor = document.getElementById('refreshEditor');

function setMessage(text, type = '') {
  if (!editorMessage) return;
  editorMessage.textContent = text;
  editorMessage.className = `message${type ? ` ${type}` : ''}`;
}

async function approveKnownAs(card) {
  const contributionId = card?.dataset?.contributionId;
  if (!contributionId) return;
  const edited = card.querySelector('[data-edit]')?.value?.trim();
  if (!edited) { setMessage('Enter the approved nickname or known-as name before approving.', 'error'); return; }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { setMessage('Your editor session has expired. Sign in again.', 'error'); return; }

  const { data: contribution, error: contributionError } = await supabase
    .from('contributions')
    .select('id, target_person_id, contribution_type, narrative_text, status')
    .eq('id', contributionId)
    .single();
  if (contributionError) { setMessage(contributionError.message, 'error'); return; }
  if (contribution.contribution_type !== 'nickname' || !contribution.target_person_id) {
    setMessage('This known-as contribution is not linked to a person yet.', 'error');
    return;
  }

  setMessage('Approving known-as name...');
  const { error: personError } = await supabase
    .from('people')
    .update({ preferred_name: edited, preferred_name_status: 'family_supplied', updated_at: new Date().toISOString() })
    .eq('id', contribution.target_person_id);
  if (personError) { setMessage(personError.message, 'error'); return; }

  const { error: finishError } = await supabase
    .from('contributions')
    .update({
      status: 'approved',
      review_note: `Approved known-as name: ${edited}`,
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', contributionId);
  if (finishError) { setMessage(finishError.message, 'error'); return; }

  setMessage(`Known-as name approved as "${edited}". The legal name remains unchanged.`, 'success');
  document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
  refreshEditor?.click();
}

queue?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-approve-note]');
  if (!button) return;
  const card = button.closest('[data-contribution-id]');
  const title = card?.querySelector('.queue-title')?.textContent?.trim().toLowerCase();
  if (title !== 'nickname') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  approveKnownAs(card).catch((error) => setMessage(error.message || 'Unable to approve known-as name.', 'error'));
}, true);

function addStylesheet(href, marker) {
  if (document.querySelector(`link[data-${marker}]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute(`data-${marker}`, '1');
  document.head.appendChild(link);
}

function loadOptionalModule(path) {
  void import(path).catch((error) => console.error(`Optional genealogy module failed to load: ${path}`, error));
}

addStylesheet('./person-photos.css?v=2', 'person-photos');
addStylesheet('./photo-import.css?v=1', 'photo-import');
loadOptionalModule('./person-photos-v1.js?v=2');
loadOptionalModule('./photo-import-v1.js?v=1');
loadOptionalModule('./nickname-display-v1.js?v=2');
