import { supabase } from './supabase-client-v1.js';

const canvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const frontierById = new Map();
const frontierEntriesByPerson = new Map();
const peopleById = new Map();
let dialog = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function personName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ') || 'Unknown person';
}

function frontierTitle(candidate) {
  return [candidate?.label, candidate?.year_text, candidate?.detail, candidate?.evidence_note]
    .filter(Boolean).join(' - ');
}

function statusLabel(value) {
  return ({ strong: 'Strong lead', probable: 'Probable', hypothesis: 'Hypothesis', unresolved: 'Unresolved' })[value] || 'Research lead';
}

function installStyles() {
  if (document.getElementById('fanCellActionsStyles')) return;
  const style = document.createElement('style');
  style.id = 'fanCellActionsStyles';
  style.textContent = `
    .person-node,.family-centre-person,.family-child-node{cursor:pointer}
    .fan-cell-action-backdrop{position:fixed;inset:0;z-index:11000;display:grid;place-items:center;padding:20px;background:rgba(44,36,30,.4);backdrop-filter:blur(2px)}
    .fan-cell-action-dialog{width:min(520px,calc(100vw - 32px));max-height:min(82vh,720px);overflow:auto;border:1px solid #d7c9bb;border-radius:18px;background:#fffdf9;box-shadow:0 22px 60px rgba(43,31,23,.24);color:#3f342b}
    .fan-cell-action-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:18px 20px 12px;border-bottom:1px solid #eadfd4}
    .fan-cell-action-kicker{margin:0 0 4px;color:#7f7165;font:800 9px/1.1 Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase}
    .fan-cell-action-head h3{margin:0;font-size:21px;line-height:1.2}
    .fan-cell-action-close{border:0;background:#f0e6da;color:#5f5146;border-radius:999px;width:34px;height:34px;font:800 16px/1 Arial,sans-serif;cursor:pointer}
    .fan-cell-action-body{display:grid;gap:12px;padding:16px 20px 20px}
    .fan-cell-action-copy{margin:0;color:#65594f;font-size:12px;line-height:1.5}
    .fan-cell-action-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    .fan-cell-action-actions .button{min-height:44px}
    .fan-cell-action-frontier-launch{grid-column:1/-1;border-color:#c9a45f!important;background:#fff8e9!important;color:#5d4829!important}
    .fan-cell-action-note{margin:0;padding:10px 11px;border-radius:11px;background:#f4eee7;color:#6b5d51;font-size:10.5px;line-height:1.45}
    .fan-cell-action-frontier{padding:11px 12px;border:1px solid #e4d9cd;border-radius:12px;background:#fffaf3}
    .fan-cell-action-frontier strong{display:block;margin-bottom:4px;font-size:12px}
    .fan-cell-action-frontier span{display:block;color:#665a50;font-size:10.5px;line-height:1.45}
    .fan-cell-action-frontier-badge{display:inline-block!important;width:max-content;margin:0 0 6px;padding:3px 6px;border-radius:999px;background:#efe0c4;color:#6a5334!important;font-weight:700}
    .fan-cell-action-warning{margin:0;padding:11px 12px;border:1px dashed #c9a45f;border-radius:11px;background:#fff8e9;color:#665338;font-size:10.8px;line-height:1.5}
    .fan-cell-action-error{margin:0;padding:9px 10px;border-radius:9px;background:#fff3f0;color:#8a3e36;font-size:10.5px;line-height:1.4}
    @media(max-width:560px){.fan-cell-action-actions{grid-template-columns:1fr}.fan-cell-action-head h3{font-size:18px}}
  `;
  document.head.appendChild(style);
}

function closeDialog() {
  dialog?.remove();
  dialog = null;
}

function showDialog(title, kicker, bodyHtml) {
  closeDialog();
  installStyles();
  const backdrop = document.createElement('div');
  backdrop.className = 'fan-cell-action-backdrop';
  backdrop.setAttribute('role', 'presentation');
  backdrop.innerHTML = `<section class="fan-cell-action-dialog" role="dialog" aria-modal="true" aria-labelledby="fanCellActionTitle">
    <header class="fan-cell-action-head">
      <div><p class="fan-cell-action-kicker">${esc(kicker)}</p><h3 id="fanCellActionTitle">${esc(title)}</h3></div>
      <button type="button" class="fan-cell-action-close" aria-label="Close">x</button>
    </header>
    <div class="fan-cell-action-body">${bodyHtml}</div>
  </section>`;
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeDialog(); });
  backdrop.querySelector('.fan-cell-action-close')?.addEventListener('click', closeDialog);
  document.body.appendChild(backdrop);
  dialog = backdrop;
  backdrop.querySelector('.fan-cell-action-close')?.focus();
  return backdrop;
}

function familyCentre(personId) {
  const option = [...(centreSelect?.options || [])].find((item) => item.value === personId);
  if (!centreSelect || !option) return false;
  const mode = document.getElementById('treeViewMode');
  if (mode && [...mode.options].some((item) => item.value === 'family')) {
    mode.value = 'family';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
  }
  centreSelect.value = personId;
  centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function selectExistingPerson(personId) {
  if (!canvas) return;
  const node = canvas.querySelector(`[data-person-id="${CSS.escape(personId)}"]`);
  if (!node) return;
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

function openEdit(personId) {
  closeDialog();
  selectExistingPerson(personId);
  queueMicrotask(() => {
    const launch = document.getElementById('openTreeSuggestionEditor');
    if (!launch || launch.disabled) return;
    launch.click();
    requestAnimationFrame(() => {
      document.querySelector('#treeSuggestionEditor [data-tree-mode="edit"]')?.click();
    });
  });
}

function showPersonFrontier(personId) {
  const person = peopleById.get(personId);
  const rows = frontierEntriesByPerson.get(personId) || [];
  const name = personName(person) || 'Family member';
  const cards = rows.length ? rows.map((row) => `
    <div class="fan-cell-action-frontier">
      <span class="fan-cell-action-frontier-badge">${esc(statusLabel(row.frontier_status))}</span>
      <strong>${esc(row.title || 'Family research lead')}</strong>
      ${row.detail ? `<span>${esc(row.detail)}</span>` : ''}
      ${row.evidence_note ? `<span>Evidence boundary: ${esc(row.evidence_note)}</span>` : ''}
    </div>`).join('') : '<p class="fan-cell-action-note">No active research-frontier notes are attached to this person.</p>';
  const body = `
    <p class="fan-cell-action-warning"><strong>Provisional - not part of the established tree.</strong> These notes deliberately preserve promising but unproved routes. They may explain where the research is heading without turning a candidate into an ancestor.</p>
    ${cards}
    <div class="fan-cell-action-actions"><button type="button" class="button secondary" data-fan-action-back>Back</button><button type="button" class="button primary" data-fan-action-close>Close</button></div>`;
  const backdrop = showDialog(name, 'Research frontier', body);
  backdrop.querySelector('[data-fan-action-close]')?.addEventListener('click', closeDialog);
  backdrop.querySelector('[data-fan-action-back]')?.addEventListener('click', () => showPersonActions(personId));
}

function showPersonActions(personId) {
  const person = peopleById.get(personId);
  const name = personName(person) || 'Family member';
  const pending = String(personId).startsWith('pending:');
  const source = String(person?.source_status || '').replaceAll('_', ' ');
  const frontierRows = frontierEntriesByPerson.get(personId) || [];
  const body = `
    <p class="fan-cell-action-copy">Choose what you want to do with this person. A single click still selects them and shows their details.</p>
    ${source ? `<p class="fan-cell-action-note">Current evidence status: ${esc(source)}.</p>` : ''}
    ${frontierRows.length ? `<p class="fan-cell-action-warning">This person has ${frontierRows.length} active research-frontier ${frontierRows.length === 1 ? 'note' : 'notes'}. They are intentionally kept separate from established ancestry.</p>` : ''}
    <div class="fan-cell-action-actions">
      <button type="button" class="button secondary" data-fan-action-edit${pending ? ' disabled' : ''}>${pending ? 'Edit after review' : 'Edit this person'}</button>
      <button type="button" class="button primary" data-fan-action-centre>Make family centre</button>
      ${frontierRows.length ? `<button type="button" class="button secondary fan-cell-action-frontier-launch" data-fan-action-frontier>View research frontier (${frontierRows.length})</button>` : ''}
    </div>
    <p class="fan-cell-action-note">Making this person the centre switches to Family view. Their recorded spouse or partner is included whether living or deceased, unless that relationship is recorded as divorced.</p>
    ${pending ? '<p class="fan-cell-action-note">This person is already a pending addition. Further edits wait until the first change has been reviewed.</p>' : ''}`;
  const backdrop = showDialog(name, pending ? 'Pending family record' : 'Fan navigation', body);
  backdrop.querySelector('[data-fan-action-edit]')?.addEventListener('click', () => openEdit(personId));
  backdrop.querySelector('[data-fan-action-frontier]')?.addEventListener('click', () => showPersonFrontier(personId));
  backdrop.querySelector('[data-fan-action-centre]')?.addEventListener('click', () => {
    if (familyCentre(personId)) closeDialog();
    else {
      const host = backdrop.querySelector('.fan-cell-action-body');
      host?.insertAdjacentHTML('beforeend', '<p class="fan-cell-action-error">This person cannot currently be made the centre of the fan. Refresh the archive and try again.</p>');
    }
  });
}

function candidateGroupForNode(node) {
  const marker = node.closest?.('.frontier-alternate-marker');
  if (marker?.dataset?.frontierKey) {
    return marker.dataset.frontierKey.split('|').map((id) => frontierById.get(id)).filter(Boolean);
  }

  const title = node.querySelector?.(':scope > title')?.textContent?.trim() || '';
  if (!title) return [];
  const primary = [...frontierById.values()].find((candidate) => frontierTitle(candidate) === title);
  if (!primary) return [];
  return [...frontierById.values()].filter((candidate) => candidate.anchor_person_id === primary.anchor_person_id
    && candidate.parent_slot === primary.parent_slot);
}

function showFrontierActions(node) {
  const candidates = candidateGroupForNode(node);
  const primary = candidates[0] || null;
  const title = primary?.label || node.querySelector?.('title')?.textContent?.split(' - ')[0] || 'Research lead';
  const anchor = primary ? peopleById.get(primary.anchor_person_id) : null;
  const cards = candidates.length ? candidates.map((candidate) => `
    <div class="fan-cell-action-frontier">
      <strong>${esc(candidate.label || 'Research lead')}</strong>
      ${candidate.year_text ? `<span>${esc(candidate.year_text)}</span>` : ''}
      ${candidate.detail ? `<span>${esc(candidate.detail)}</span>` : ''}
      ${candidate.evidence_note ? `<span>Evidence: ${esc(candidate.evidence_note)}</span>` : ''}
    </div>`).join('') : '<p class="fan-cell-action-note">This grey cell is a research-frontier position, but its detailed candidate record could not be loaded.</p>';
  const anchorAction = anchor ? `<button type="button" class="button primary" data-fan-action-centre-anchor>Centre ${esc(personName(anchor))}</button>` : '';
  const body = `
    <p class="fan-cell-action-copy">This grey cell is deliberately not treated as an established person. It is a research lead, so the app should not offer to edit or centre it as though the identity were already canonical.</p>
    ${cards}
    <div class="fan-cell-action-actions">${anchorAction}<button type="button" class="button secondary" data-fan-action-close>Close</button></div>
    ${anchor ? `<p class="fan-cell-action-note">Centring ${esc(personName(anchor))} keeps the frontier relationship visible from the nearest confirmed or evidence-graded person.</p>` : ''}`;
  const backdrop = showDialog(title, 'Research frontier', body);
  backdrop.querySelector('[data-fan-action-close]')?.addEventListener('click', closeDialog);
  backdrop.querySelector('[data-fan-action-centre-anchor]')?.addEventListener('click', () => {
    if (primary && familyCentre(primary.anchor_person_id)) closeDialog();
  });
}

function actionNodeFromEvent(event) {
  const element = event.target instanceof Element ? event.target : null;
  if (!element || !canvas?.contains(element)) return null;
  const frontierMarker = element.closest('.frontier-alternate-marker');
  if (frontierMarker) return { kind: 'frontier-marker', node: frontierMarker };
  const personNode = element.closest('.person-node[data-person-id],.family-centre-person[data-person-id],.family-child-node[data-person-id]');
  if (personNode) return { kind: 'person', node: personNode };
  const frontierNode = element.closest('.research-frontier-node');
  if (frontierNode) return { kind: 'frontier', node: frontierNode };
  return null;
}

function openFromNode(match) {
  if (!match) return;
  if (match.kind === 'frontier-marker') {
    return;
  }
  if (match.kind === 'person') {
    const id = match.node.dataset.personId;
    if (id) showPersonActions(id);
    return;
  }
  if (match.kind === 'frontier') showFrontierActions(match.node);
}

async function loadReferenceData() {
  const [peopleResult, frontierResult, entryResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,source_status,is_active').eq('is_active', true),
    supabase.from('research_frontier_candidates').select('id,anchor_person_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active').eq('is_active', true).order('priority'),
    supabase.from('research_frontier_entries').select('id,person_id,frontier_status,title,detail,evidence_note,created_at,is_active').eq('is_active', true).order('created_at', { ascending: false }),
  ]);
  if (!peopleResult.error) {
    peopleById.clear();
    (peopleResult.data || []).forEach((person) => peopleById.set(person.id, person));
  }
  if (!frontierResult.error) {
    frontierById.clear();
    (frontierResult.data || []).forEach((candidate) => frontierById.set(candidate.id, candidate));
  }
  if (!entryResult.error) {
    frontierEntriesByPerson.clear();
    (entryResult.data || []).forEach((entry) => {
      const rows = frontierEntriesByPerson.get(entry.person_id) || [];
      rows.push(entry);
      frontierEntriesByPerson.set(entry.person_id, rows);
    });
  }
}

if (canvas) {
  canvas.addEventListener('dblclick', (event) => {
    const match = actionNodeFromEvent(event);
    if (!match || match.kind === 'frontier-marker') return;
    event.preventDefault();
    event.stopPropagation();
    openFromNode(match);
  }, true);

  canvas.addEventListener('keydown', (event) => {
    if (!(event.shiftKey && event.key === 'Enter')) return;
    const match = actionNodeFromEvent(event);
    if (!match || match.kind === 'frontier-marker') return;
    event.preventDefault();
    event.stopPropagation();
    openFromNode(match);
  }, true);
}

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDialog(); });
document.addEventListener('genealogy:archive-ready', () => loadReferenceData().catch(() => {}));
document.addEventListener('genealogy:tree-suggestions-updated', () => loadReferenceData().catch(() => {}));
document.addEventListener('genealogy:frontier-updated', () => loadReferenceData().catch(() => {}));

const { data: { session } } = await supabase.auth.getSession();
if (session) await loadReferenceData().catch(() => {});
