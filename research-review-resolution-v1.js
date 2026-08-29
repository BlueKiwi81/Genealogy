import { supabase } from './supabase-client-v1.js';

function isResearchCard(card) {
  const type = card?.querySelector('.queue-title')?.textContent?.trim().toLowerCase() || '';
  return type === 'research finding' || type === 'research conclusion';
}

function installStyles() {
  if (document.getElementById('researchReviewResolutionStyles')) return;
  const style = document.createElement('style');
  style.id = 'researchReviewResolutionStyles';
  style.textContent = `
    .research-review-resolution{margin-top:10px;padding-top:10px;border-top:1px solid rgba(91,72,55,.16)}
    .research-review-resolution p{margin:0 0 8px;font-size:.76rem;line-height:1.4;color:#665a50}
    .research-review-resolution-actions{display:flex;gap:8px;flex-wrap:wrap}
    .research-review-resolution-actions .button{font-size:.72rem;padding:6px 9px}
  `;
  document.head.appendChild(style);
}

async function resolve(card, action, button) {
  const contributionId = card?.dataset?.contributionId;
  if (!contributionId) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = action === 'retain_research' ? 'Recording...' : 'Returning...';
  try {
    const { data, error } = await supabase.rpc('resolve_research_contribution', {
      p_contribution_id: contributionId,
      p_action: action,
      p_note: null,
    });
    if (error) throw error;
    card.remove();
    const message = document.getElementById('editorMessage');
    if (message) {
      message.textContent = action === 'retain_research'
        ? 'Research retained after AI-assisted review. No canonical tree change was made.'
        : 'Returned to the research case for further work. The research conclusion has not altered the tree.';
      message.className = 'message success';
    }
    document.getElementById('refreshEditor')?.click();
    document.dispatchEvent(new CustomEvent('genealogy:research-case-reviewed', { detail: data || {} }));
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    const message = document.getElementById('editorMessage');
    if (message) {
      message.textContent = error?.message || 'Unable to resolve this research submission.';
      message.className = 'message error';
    }
  }
}

function decorate() {
  installStyles();
  document.querySelectorAll('[data-contribution-id]').forEach((card) => {
    if (!isResearchCard(card) || card.querySelector('.research-review-resolution')) return;
    const review = card.querySelector('.intelligent-review-box');
    if (!review || review.classList.contains('error')) return;
    const box = document.createElement('section');
    box.className = 'research-review-resolution';
    box.innerHTML = `
      <p>The intelligent review is advice, not the only possible outcome. You may keep this as useful research without changing the tree, or return it to the open research case for more work.</p>
      <div class="research-review-resolution-actions">
        <button type="button" class="button secondary" data-retain-research>Keep as research only</button>
        <button type="button" class="button ghost" data-continue-research>Continue researching</button>
      </div>`;
    review.appendChild(box);
    box.querySelector('[data-retain-research]')?.addEventListener('click', (event) => void resolve(card, 'retain_research', event.currentTarget));
    box.querySelector('[data-continue-research]')?.addEventListener('click', (event) => void resolve(card, 'continue_research', event.currentTarget));
  });
}

new MutationObserver(() => requestAnimationFrame(decorate)).observe(document.body, { childList: true, subtree: true });
document.addEventListener('genealogy:research-case-submitted', () => setTimeout(decorate, 30));
document.getElementById('refreshEditor')?.addEventListener('click', () => setTimeout(decorate, 120));
window.addEventListener('load', decorate);
decorate();