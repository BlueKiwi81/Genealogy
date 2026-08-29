import { supabase } from './supabase-client-v1.js';

const canvas = document.getElementById('treeCanvas');
const state = { candidates: [], people: new Map(), loaded: false };

function af() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}
function t(en, afr) { return af() ? afr : en; }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
function personName(id) {
  const person = state.people.get(id);
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ') || t('the linked ancestor', 'die gekoppelde voorouer');
}
function slotLabel(slot) {
  if (slot === 'mother') return t('mother', 'moeder');
  if (slot === 'father') return t('father', 'vader');
  return slot || t('parent', 'ouer');
}
function sameSlot(candidate) {
  return state.candidates
    .filter(other => other.id !== candidate.id && other.anchor_person_id === candidate.anchor_person_id && other.parent_slot === candidate.parent_slot && other.is_active !== false)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

function ensureDialog() {
  let dialog = document.getElementById('researchFrontierDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'researchFrontierDialog';
  dialog.className = 'frontier-dialog';
  dialog.innerHTML = `
    <div class="frontier-dialog-shell">
      <button class="frontier-dialog-close" type="button" aria-label="${t('Close research frontier', 'Sluit navorsingsfront')}">×</button>
      <div id="researchFrontierDialogBody"></div>
    </div>`;
  dialog.querySelector('.frontier-dialog-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.body.appendChild(dialog);
  return dialog;
}

function candidateContext(candidate) {
  const anchor = personName(candidate.anchor_person_id);
  return t(
    `Research frontier: ${candidate.label || 'unnamed candidate'} as a possible ${slotLabel(candidate.parent_slot)} of ${anchor}.`,
    `Navorsingsfront: ${candidate.label || 'onbenoemde kandidaat'} as moontlike ${slotLabel(candidate.parent_slot)} van ${anchor}.`
  );
}

function selectAnchorPerson(candidate) {
  if (!candidate?.anchor_person_id || !canvas) return;
  const selector = `[data-person-id="${CSS.escape(candidate.anchor_person_id)}"]`;
  const node = canvas.querySelector(selector);
  if (!node) return;
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

function startResolution(candidate) {
  const dialog = document.getElementById('researchFrontierDialog');
  dialog?.close();

  // The frontier candidate itself is not a canonical person. Attach the research
  // submission to the known person whose parent slot this candidate is trying to resolve.
  selectAnchorPerson(candidate);

  const workbench = document.getElementById('contributionWorkbench');
  if (workbench instanceof HTMLDetailsElement) workbench.open = true;
  const share = document.querySelector('#contributionModeTabs [data-mode="share"]');
  share?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

  const research = document.getElementById('researchFrontierCategory');
  if (research instanceof HTMLInputElement) {
    research.checked = true;
    research.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const hypothesis = document.querySelector('input[name="researchFrontierStatus"][value="hypothesis"]');
  if (hypothesis instanceof HTMLInputElement) hypothesis.checked = true;

  const text = document.getElementById('contributionText');
  if (text instanceof HTMLTextAreaElement) {
    const lead = candidateContext(candidate);
    const details = [candidate.detail, candidate.evidence_note].filter(Boolean).join('\n');
    const prompt = t(
      `${lead}${details ? `\nCurrent frontier notes: ${details}` : ''}\n\nInformation or evidence that may resolve this frontier:\n`,
      `${lead}${details ? `\nHuidige navorsingsfront-notas: ${details}` : ''}\n\nInligting of bewysmateriaal wat hierdie navorsingsfront kan help oplos:\n`
    );
    text.value = prompt;
    text.dispatchEvent(new Event('input', { bubbles: true }));
  }

  window.setTimeout(() => {
    workbench?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    text?.focus();
  }, 30);

  document.dispatchEvent(new CustomEvent('genealogy:frontier-resolution-started', {
    detail: {
      candidateId: candidate.id,
      anchorPersonId: candidate.anchor_person_id,
      parentSlot: candidate.parent_slot,
      label: candidate.label,
    },
  }));
}

function startAssistantResearch(candidate) {
  document.getElementById('researchFrontierDialog')?.close();
  document.dispatchEvent(new CustomEvent('genealogy:research-frontier-assistant', {
    detail: {
      candidateId: candidate.id,
      anchorPersonId: candidate.anchor_person_id,
      parentSlot: candidate.parent_slot,
      label: candidate.label,
      yearText: candidate.year_text,
      detail: candidate.detail,
      evidenceNote: candidate.evidence_note,
    },
  }));
}

function showCandidate(candidate) {
  const dialog = ensureDialog();
  const body = dialog.querySelector('#researchFrontierDialogBody');
  if (!body) return;

  const anchor = personName(candidate.anchor_person_id);
  const alternates = sameSlot(candidate);
  const rows = [
    [t('Status', 'Status'), t('Research frontier — provisional, not a confirmed person or relationship', 'Navorsingsfront — voorlopig, nie ’n bevestigde persoon of verwantskap nie')],
    [t('Possible position', 'Moontlike posisie'), `${t('Possible', 'Moontlike')} ${slotLabel(candidate.parent_slot)} ${t('of', 'van')} ${anchor}`],
  ];
  if (candidate.year_text) rows.push([t('Date / period', 'Datum / tydperk'), candidate.year_text]);
  if (candidate.detail) rows.push([t('Why this lead matters', 'Waarom hierdie leidraad saak maak'), candidate.detail]);
  if (candidate.evidence_note) rows.push([t('Evidence note', 'Bewysnota'), candidate.evidence_note]);
  if (alternates.length) rows.push([
    t('Other live candidates in this slot', 'Ander aktiewe kandidate in hierdie posisie'),
    alternates.map(item => item.label).filter(Boolean).join(', '),
  ]);

  body.innerHTML = `
    <p class="eyebrow">${t('Research frontier', 'Navorsingsfront')}</p>
    <h2>${esc(candidate.label || t('Research candidate', 'Navorsingskandidaat'))}</h2>
    <p class="frontier-dialog-intro">${esc(t(
      'This grey block preserves a research possibility without treating it as established genealogy.',
      'Hierdie grys blok bewaar ’n navorsingsmoontlikheid sonder om dit as vasgestelde genealogie te behandel.'
    ))}</p>
    <div class="frontier-dialog-details">
      ${rows.map(([label, value]) => `<div class="detail-line"><strong>${esc(label)}</strong>${esc(value)}</div>`).join('')}
    </div>
    <div class="frontier-dialog-resolution">
      <strong>${esc(t('Can you help resolve this?', 'Kan jy help om dit op te los?'))}</strong>
      <p>${esc(t(
        'Add a record, family information, wartime material, archive reference or other research that supports, challenges or replaces this candidate. The submission remains provisional until it is reviewed.',
        'Voeg ’n rekord, familie-inligting, oorlogsmateriaal, argiefverwysing of ander navorsing by wat hierdie kandidaat ondersteun, bevraagteken of vervang. Die indiening bly voorlopig totdat dit hersien is.'
      ))}</p>
      <div class="frontier-dialog-actions">
        <button id="frontierResearchButton" class="button secondary" type="button">${esc(t('Research this frontier', 'Doen navorsing oor hierdie grens'))}</button>
        <button id="frontierResolveButton" class="button primary" type="button">${esc(t('Add information or evidence', 'Voeg inligting of bewysmateriaal by'))}</button>
      </div>
    </div>`;
  body.querySelector('#frontierResolveButton')?.addEventListener('click', () => startResolution(candidate), { once: true });
  body.querySelector('#frontierResearchButton')?.addEventListener('click', () => startAssistantResearch(candidate), { once: true });

  document.dispatchEvent(new CustomEvent('genealogy:frontier-selected', {
    detail: { candidateId: candidate.id, anchorPersonId: candidate.anchor_person_id },
  }));

  if (!dialog.open) dialog.showModal();
}

function candidateForNode(node) {
  const explicit = node.dataset.frontierId;
  if (explicit) return state.candidates.find(candidate => candidate.id === explicit) || null;
  const title = node.querySelector('title')?.textContent || '';
  if (!title) return null;
  return [...state.candidates]
    .sort((a, b) => String(b.label || '').length - String(a.label || '').length)
    .find(candidate => candidate.label && title.startsWith(candidate.label)) || null;
}

function decorate() {
  if (!state.loaded || !canvas) return;
  canvas.querySelectorAll('.research-frontier-node').forEach(node => {
    const candidate = candidateForNode(node);
    if (!candidate) return;
    node.dataset.frontierClickable = '1';
    node.dataset.frontierId = candidate.id;
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', t(
      `Research frontier candidate: ${candidate.label}. Open research notes.`,
      `Navorsingsfront-kandidaat: ${candidate.label}. Maak navorsingsnotas oop.`
    ));
    if (node.dataset.frontierBound === '1') return;
    node.dataset.frontierBound = '1';
    const activate = event => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      showCandidate(candidateForNode(node) || candidate);
    };
    node.addEventListener('click', activate);
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
  });
}

function installStyles() {
  if (document.getElementById('frontierDetailsStyles')) return;
  const style = document.createElement('style');
  style.id = 'frontierDetailsStyles';
  style.textContent = `
    .research-frontier-node[data-frontier-clickable="1"]{cursor:pointer}
    .research-frontier-node[data-frontier-clickable="1"]:hover>path,
    .research-frontier-node[data-frontier-clickable="1"]:focus>path{stroke:#3e3e3e!important;stroke-width:2.4!important;filter:drop-shadow(0 0 2px rgba(255,255,255,.9))}
    .frontier-dialog{width:min(680px,calc(100vw - 26px));max-height:min(82vh,760px);padding:0;border:0;border-radius:18px;background:#fffdf8;color:#211d18;box-shadow:0 22px 70px rgba(37,28,20,.28)}
    .frontier-dialog::backdrop{background:rgba(35,29,24,.44);backdrop-filter:blur(2px)}
    .frontier-dialog-shell{position:relative;padding:23px}.frontier-dialog-close{position:absolute;right:13px;top:11px;width:36px;height:36px;border:1px solid #d7ccbf;border-radius:50%;background:#fff;color:#4b4138;font:700 1.25rem/1 Arial,sans-serif;cursor:pointer}
    .frontier-dialog h2{margin:0 42px 8px 0}.frontier-dialog-intro{margin:0 0 14px;color:#665a50;font:.84rem/1.5 Arial,sans-serif}.frontier-dialog-details{display:grid;gap:7px}.frontier-dialog-resolution{margin-top:16px;padding:13px 14px;border:1px solid #d7c399;border-radius:12px;background:#fff8e9;font:.8rem/1.5 Arial,sans-serif}.frontier-dialog-resolution>strong{display:block;margin-bottom:3px}.frontier-dialog-resolution p{margin:0 0 10px;color:#65584d}.frontier-dialog-actions{display:flex;gap:8px;flex-wrap:wrap}
  `;
  document.head.appendChild(style);
}

async function load() {
  const [candidateResult, peopleResult] = await Promise.all([
    supabase.from('research_frontier_candidates').select('id,anchor_person_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active').eq('is_active', true).order('priority'),
    supabase.from('people').select('id,given_names,surname'),
  ]);
  if (candidateResult.error || peopleResult.error) return;
  state.candidates = candidateResult.data || [];
  state.people = new Map((peopleResult.data || []).map(person => [person.id, person]));
  state.loaded = true;
  installStyles();
  decorate();
}

if (canvas) {
  const observer = new MutationObserver(() => window.setTimeout(decorate, 0));
  observer.observe(canvas, { childList: true, subtree: false });
}

document.addEventListener('genealogy:research-frontier-changed', () => window.setTimeout(decorate, 20));
document.addEventListener('genealogy:language-changed', () => {
  document.getElementById('researchFrontierDialog')?.remove();
  window.setTimeout(decorate, 20);
});
supabase.auth.onAuthStateChange((_event, session) => { if (session) load(); });
const { data: { session } } = await supabase.auth.getSession();
if (session) await load();
