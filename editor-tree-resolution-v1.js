import { supabase } from './supabase-client-v1.js';

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const scanned = new Map();
const inFlight = new Set();
let scanTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function normalise(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function firstToken(value) {
  return normalise(value).split(' ')[0] || '';
}

function personName(person) {
  return [person?.given_names, person?.surname].filter(Boolean).join(' ') || 'Existing person';
}

function personMeta(person) {
  const dates = [
    person?.birth_date ? `b. ${String(person.birth_date).slice(0, 10)}` : '',
    person?.death_date ? `d. ${String(person.death_date).slice(0, 10)}` : '',
  ].filter(Boolean).join(' - ');
  return [dates, person?.source_status ? String(person.source_status).replaceAll('_', ' ') : ''].filter(Boolean).join(' | ');
}

function setPageMessage(text = '', type = '') {
  const node = document.getElementById('treeChangeReviewMessage');
  if (!node) return;
  node.textContent = text;
  node.className = `message${type ? ` ${type}` : ''}`;
}

function installStyles() {
  if (document.getElementById('treeResolutionStyles')) return;
  const style = document.createElement('style');
  style.id = 'treeResolutionStyles';
  style.textContent = `
    .tree-ai-resolution-assistant{margin:10px 0;padding:10px;border:1px solid rgba(75,104,79,.24);border-radius:10px;background:#f7fbf5}
    .tree-ai-resolution-assistant h5{margin:0;font-size:10.5px;color:#425b45}.tree-ai-resolution-assistant p{margin:5px 0 8px;font-size:9.8px;line-height:1.45;color:#5b6659}
    .tree-ai-resolution-matches{display:grid;gap:6px}.tree-ai-resolution-match{display:grid!important;grid-template-columns:1fr auto;gap:8px!important;align-items:center;text-align:left!important;padding:8px 9px!important;border:1px solid rgba(75,104,79,.22)!important;border-radius:9px!important;background:#fff!important;color:#3f4f41!important}
    .tree-ai-resolution-match strong{font-size:10.5px}.tree-ai-resolution-match span{font-size:9px;color:#6c776a}.tree-ai-resolution-match em{font-size:8.5px;font-style:normal;color:#718170}
    .tree-ai-resolution-preview{margin-top:9px;padding:9px;border-radius:9px;background:#fff;border:1px solid rgba(75,104,79,.18)}.tree-ai-resolution-preview[hidden]{display:none}.tree-ai-resolution-preview h6{margin:0 0 6px;font-size:10.5px;color:#425b45}
    .tree-ai-resolution-preview dl{display:grid;grid-template-columns:minmax(100px,.38fr) 1fr;gap:4px 8px;margin:7px 0;font-size:9.5px}.tree-ai-resolution-preview dt{font-weight:700;color:#536452}.tree-ai-resolution-preview dd{margin:0;color:#4d584c}.tree-ai-resolution-conflicts{margin:7px 0 0;padding-left:17px;font-size:9.5px;line-height:1.4;color:#76531e}
  `;
  document.head.appendChild(style);
}

async function loadChangeAndReview(changeSetId) {
  const [changeResult, reviewResult] = await Promise.all([
    supabase.from('tree_change_sets').select('id,target_person_id,change_type,payload,status').eq('id', changeSetId).maybeSingle(),
    supabase.from('tree_change_ai_reviews').select('id,decision,confidence,summary,rationale,warnings,status,updated_at').eq('change_set_id', changeSetId).maybeSingle(),
  ]);
  if (changeResult.error || reviewResult.error) return null;
  if (!changeResult.data || !reviewResult.data || changeResult.data.status !== 'pending') return null;
  return { change: changeResult.data, review: reviewResult.data };
}

async function findMatches(change, review) {
  if (change.change_type !== 'add_relative' || review.decision === 'approve') return [];
  const relative = change.payload?.relative || {};
  const relativeSurname = normalise(relative.surname);
  const relativeGiven = normalise(relative.given_names);
  const relativeFirst = firstToken(relative.given_names);
  if (!relativeSurname && !relativeGiven) return [];

  const referencedIds = new Set((JSON.stringify(review).match(UUID_RE) || []).map((id) => id.toLowerCase()));
  const { data: people, error } = await supabase.from('people')
    .select('id,given_names,preferred_name,surname,birth_date,death_date,source_status,is_active')
    .eq('is_active', true);
  if (error) return [];

  return (people || []).map((person) => {
    if (person.id === change.target_person_id) return null;
    let score = referencedIds.has(String(person.id).toLowerCase()) ? 12 : 0;
    const reasons = referencedIds.has(String(person.id).toLowerCase()) ? ['named by intelligent review'] : [];
    const surname = normalise(person.surname);
    const given = normalise(person.given_names);
    const first = firstToken(person.given_names);
    const preferred = normalise(person.preferred_name);

    if (relativeSurname && surname) {
      if (relativeSurname === surname) { score += 4; reasons.push('same surname'); }
      else score -= 6;
    }
    if (relativeGiven && given) {
      if (relativeGiven === given) { score += 6; reasons.push('same given name'); }
      else if (relativeGiven.startsWith(`${given} `) || given.startsWith(`${relativeGiven} `)) { score += 5; reasons.push('compatible fuller given name'); }
      else if (relativeFirst && first && relativeFirst === first) { score += 4; reasons.push('same first given name'); }
    }
    if (relativeFirst && preferred && relativeFirst === preferred) { score += 3; reasons.push('matches known-as name'); }
    if (relative.birth_date && person.birth_date) {
      if (String(relative.birth_date).slice(0, 10) === String(person.birth_date).slice(0, 10)) { score += 5; reasons.push('same birth date'); }
      else score -= 4;
    }
    if (relative.death_date && person.death_date) {
      if (String(relative.death_date).slice(0, 10) === String(person.death_date).slice(0, 10)) { score += 3; reasons.push('same death date'); }
      else score -= 3;
    }
    return score >= 5 ? { ...person, score, reasons } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 4);
}

function assistantHost(card) {
  let host = card.querySelector('.tree-ai-resolution-assistant');
  if (host) return host;
  host = document.createElement('div');
  host.className = 'tree-ai-resolution-assistant';
  const review = card.querySelector('.tree-ai-review');
  const overrideHelp = review?.querySelector('.tree-ai-review-override-help');
  if (overrideHelp) overrideHelp.insertAdjacentElement('beforebegin', host);
  else review?.appendChild(host);
  return host;
}

function renderMatches(card, matches) {
  const host = assistantHost(card);
  host.innerHTML = `
    <h5>Resolve into an existing person</h5>
    <p>The intelligent review appears to have identified a person who may already be in the tree. Choose a match to preview the resolution. The app will fill blank details, expand compatible given names, preserve populated conflicts, and add the proposed relationship without creating a duplicate.</p>
    <div class="tree-ai-resolution-matches">
      ${matches.map((match) => `<button type="button" class="tree-ai-resolution-match" data-tree-resolution-person="${esc(match.id)}"><span><strong>${esc(personName(match))}</strong><br><span>${esc(personMeta(match) || 'Existing family record')}</span><br><em>${esc(match.reasons.join('; '))}</em></span><span>Review merge</span></button>`).join('')}
    </div>
    <div class="tree-ai-resolution-preview" data-tree-resolution-preview hidden></div>`;
}

function fieldLabel(value) {
  return String(value || '').replaceAll('_', ' ');
}

function valueText(value) {
  if (value === null || value === undefined || value === '') return 'blank';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function relationshipText(action) {
  const labels = {
    already_present: 'The relationship already exists, so no duplicate relationship will be created.',
    create_parent_link: 'The existing person will be linked as parent of the selected person.',
    create_child_link: 'The existing person will be linked as child of the selected person.',
    create_spouse_link: 'The existing person will be linked as spouse of the selected person.',
    create_partner_link: 'The existing person will be linked as partner of the selected person.',
    link_via_shared_parents: 'The existing person will be linked through the selected person\'s recorded parent or parents.',
    create_sibling_link: 'A sibling relationship will be added because shared parents are not yet recorded.',
  };
  return labels[action] || String(action || '').replaceAll('_', ' ');
}

function renderPreview(card, plan) {
  const host = card.querySelector('[data-tree-resolution-preview]');
  if (!host) return;
  const updates = Object.entries(plan?.updates || {});
  const conflicts = Array.isArray(plan?.conflicts) ? plan.conflicts : [];
  host.hidden = false;
  host.innerHTML = `
    <h6>Preview: use ${esc(plan?.existing_person_name || 'existing record')}</h6>
    <p>${esc(relationshipText(plan?.relationship_action))}</p>
    ${updates.length ? `<p><strong>Compatible details to add or expand:</strong></p><dl>${updates.map(([key, value]) => `<dt>${esc(fieldLabel(key))}</dt><dd>${esc(valueText(value))}</dd>`).join('')}</dl>` : '<p>No person fields need changing; only the family relationship will be resolved.</p>'}
    ${conflicts.length ? `<p><strong>Populated details that will be preserved rather than overwritten:</strong></p><ul class="tree-ai-resolution-conflicts">${conflicts.map((item) => `<li>${esc(fieldLabel(item.field))}: keep ${esc(valueText(item.existing))}; submitted ${esc(valueText(item.proposed))}</li>`).join('')}</ul>` : ''}
    <p>The original submission, the AI review and this resolution will remain in the audit trail.</p>
    <div class="tree-ai-review-actions">
      <button type="button" class="button primary" data-tree-resolution-confirm="${esc(plan.existing_person_id)}">Confirm link and merge</button>
      <button type="button" class="button ghost" data-tree-resolution-cancel>Cancel</button>
    </div>`;
}

async function invokeResolution(changeSetId, personId, apply) {
  const { data, error } = await supabase.rpc('resolve_tree_change_to_existing', {
    p_change_set_id: changeSetId,
    p_existing_person_id: personId,
    p_apply: apply,
  });
  if (error) throw error;
  return data;
}

async function scanCard(card) {
  const changeSetId = card?.dataset?.treeChangeId;
  const reviewPanel = card?.querySelector('.tree-ai-review');
  if (!changeSetId || !reviewPanel) return;
  if (reviewPanel.classList.contains('review-approve')) return;

  const signature = reviewPanel.textContent?.trim() || '';
  if (scanned.get(changeSetId) === signature || inFlight.has(changeSetId)) return;

  inFlight.add(changeSetId);
  try {
    const context = await loadChangeAndReview(changeSetId);
    if (!context) {
      scanned.set(changeSetId, signature);
      return;
    }
    const matches = await findMatches(context.change, context.review);
    scanned.set(changeSetId, signature);
    card.querySelector('.tree-ai-resolution-assistant')?.remove();
    if (matches.length) renderMatches(card, matches);
  } finally {
    inFlight.delete(changeSetId);
  }
}

function scanAll() {
  document.querySelectorAll('[data-tree-change-id]').forEach((card) => {
    void scanCard(card);
  });
}

function scheduleScan(delay = 90) {
  if (scanTimer !== null) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scanAll();
  }, delay);
}

document.addEventListener('click', async (event) => {
  const matchButton = event.target.closest?.('[data-tree-resolution-person]');
  if (matchButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = matchButton.closest('[data-tree-change-id]');
    const changeSetId = card?.dataset?.treeChangeId;
    const personId = matchButton.dataset.treeResolutionPerson;
    if (!card || !changeSetId || !personId) return;
    matchButton.disabled = true;
    const oldText = matchButton.lastElementChild?.textContent || 'Review merge';
    if (matchButton.lastElementChild) matchButton.lastElementChild.textContent = 'Preparing...';
    setPageMessage('Preparing a safe merge preview for the existing family record...');
    try {
      const plan = await invokeResolution(changeSetId, personId, false);
      renderPreview(card, plan);
      setPageMessage('Review the merge preview. Existing populated conflicts will be preserved, not overwritten.', 'success');
    } catch (error) {
      setPageMessage(error?.message || 'Unable to prepare the existing-person resolution.', 'error');
    } finally {
      matchButton.disabled = false;
      if (matchButton.lastElementChild) matchButton.lastElementChild.textContent = oldText;
    }
    return;
  }

  const confirmButton = event.target.closest?.('[data-tree-resolution-confirm]');
  if (confirmButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = confirmButton.closest('[data-tree-change-id]');
    const changeSetId = card?.dataset?.treeChangeId;
    const personId = confirmButton.dataset.treeResolutionConfirm;
    if (!card || !changeSetId || !personId) return;
    confirmButton.disabled = true;
    confirmButton.textContent = 'Linking and merging...';
    setPageMessage('Linking the proposal to the existing person and merging compatible details...');
    try {
      const result = await invokeResolution(changeSetId, personId, true);
      scanned.delete(changeSetId);
      const conflictCount = Array.isArray(result?.conflicts) ? result.conflicts.length : 0;
      setPageMessage(`Resolved without creating a duplicate. ${result?.existing_person_name || 'The existing person'} was linked and compatible information was merged${conflictCount ? `; ${conflictCount} populated conflict${conflictCount === 1 ? '' : 's'} were preserved in the audit trail` : ''}.`, 'success');
      document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
      document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
    } catch (error) {
      confirmButton.disabled = false;
      confirmButton.textContent = 'Confirm link and merge';
      setPageMessage(error?.message || 'Unable to resolve this proposal to the existing person.', 'error');
    }
    return;
  }

  const cancelButton = event.target.closest?.('[data-tree-resolution-cancel]');
  if (cancelButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = cancelButton.closest('[data-tree-change-id]');
    const preview = card?.querySelector('[data-tree-resolution-preview]');
    if (preview) { preview.hidden = true; preview.innerHTML = ''; }
    setPageMessage('Existing-person resolution cancelled. The proposal remains pending.');
  }
}, true);

installStyles();
scanAll();

const observer = new MutationObserver(() => scheduleScan());
observer.observe(document.body, { childList: true, subtree: true });

document.addEventListener('genealogy:tree-suggestions-updated', () => {
  scanned.clear();
  scheduleScan(60);
});