import { supabase } from './supabase-client-v1.js';
import './editor-tree-selective-approval-v1.js?v=3';

let syncTimer = null;
let syncing = false;

function setMessage(text = '', type = '') {
  const node = document.getElementById('treeChangeReviewMessage');
  if (!node) return;
  node.textContent = text;
  node.className = `message${type ? ` ${type}` : ''}`;
}

async function syncButtons() {
  if (syncing) return;
  const cards = [...document.querySelectorAll('[data-tree-change-id]')];
  if (!cards.length) return;
  syncing = true;
  try {
    const ids = cards.map((card) => card.dataset.treeChangeId).filter(Boolean);
    const { data, error } = await supabase
      .from('tree_change_sets')
      .select('id, change_type, status')
      .in('id', ids);
    if (error) throw error;
    const changes = new Map((data || []).map((row) => [row.id, row]));

    cards.forEach((card) => {
      const change = changes.get(card.dataset.treeChangeId);
      const eligible = change?.status === 'pending' && ['edit_person', 'add_relative'].includes(change?.change_type);
      const existing = card.querySelector('[data-open-selective-tree-review]');
      if (!eligible) {
        existing?.remove();
        return;
      }
      if (existing) return;
      const actions = card.querySelector('.tree-change-actions');
      if (!actions) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary';
      button.dataset.openSelectiveTreeReview = '1';
      button.textContent = 'Choose what to keep';
      const reject = actions.querySelector('[data-reject-tree-change]');
      actions.insertBefore(button, reject || null);
    });
  } catch (error) {
    console.warn('Selective desktop review button sync failed', error);
  } finally {
    syncing = false;
  }
}

function scheduleSync() {
  if (syncTimer !== null) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncButtons();
  }, 80);
}

async function openSelective(card, button) {
  const changeSetId = card?.dataset?.treeChangeId;
  if (!changeSetId) return;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Opening selective review...';
  try {
    const { data: review, error } = await supabase
      .from('tree_change_ai_reviews')
      .select('id, decision, status')
      .eq('change_set_id', changeSetId)
      .maybeSingle();
    if (error) throw error;
    if (!review) {
      setMessage('Run Intelligent Review first. Press "Approve and keep" once to run the review; nothing is applied until you confirm a later approval.', 'error');
      return;
    }

    let anchor = card.querySelector('.tree-ai-review');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.className = `tree-ai-review review-${review.decision || 'manual_review'}`;
      anchor.innerHTML = '<p class="tree-ai-review-label">Intelligent review on file</p><p class="tree-ai-review-rationale">Opening field-by-field approval...</p>';
      const note = card.querySelector('.tree-change-note');
      if (note) note.insertAdjacentElement('beforebegin', anchor);
      else card.appendChild(anchor);
    } else if (![...anchor.classList].some((name) => name.startsWith('review-'))) {
      anchor.classList.add(`review-${review.decision || 'manual_review'}`);
    }

    if (!card.querySelector('.tree-selective-review')) {
      anchor.appendChild(document.createComment(`open-selective-${Date.now()}`));
    }

    let attempts = 0;
    const findPanel = () => {
      const panel = card.querySelector('.tree-selective-review');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setMessage('Selective review is open. Tick only the person details you want to keep; the relationship is handled separately.', 'success');
        return;
      }
      attempts += 1;
      if (attempts < 12) {
        window.setTimeout(findPanel, 100);
      } else {
        setMessage('The selective review could not attach to this card. No change has been applied.', 'error');
      }
    };
    findPanel();
  } catch (error) {
    setMessage(error?.message || 'Unable to open selective review. No change has been applied.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-open-selective-tree-review]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const card = button.closest('[data-tree-change-id]');
  if (card) void openSelective(card, button);
}, true);

new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true });
document.addEventListener('genealogy:tree-suggestions-updated', scheduleSync);
scheduleSync();
