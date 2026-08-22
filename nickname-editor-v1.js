import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
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

  setMessage(`Known-as name approved as “${edited}”. The legal name remains unchanged.`, 'success');
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
