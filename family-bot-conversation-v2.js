import { supabase } from './supabase-client-v1.js';

const centreSelect = document.getElementById('centreSelect');
const history = [];
let rootRef = null;
let launcherRef = null;
let built = false;
let busy = false;
let capture = null;

const $ = (id) => rootRef?.getElementById(id) || null;
const doc = (id) => document.getElementById(id);
const af = () => (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
const t = (en, afText) => af() ? afText : en;
const q = (lang, en, afText) => lang === 'af' ? afText : en;
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function waitFor(selector, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    const node = document.querySelector(selector);
    if (node) return node;
    await wait(75);
  }
  return null;
}

function languageOf(text) {
  const value = String(text || '').toLowerCase();
  const afHits = (value.match(/\b(wat|wie|waar|wanneer|waarom|hoekom|gebore|oorlede|ouers|vader|moeder|bewys|navors|onseker|onthou|vertel|skip|familie)\b/g) || []).length;
  const enHits = (value.match(/\b(what|who|where|when|why|born|died|parents|father|mother|evidence|research|uncertain|remember|tell|ship|family)\b/g) || []).length;
  if (afHits >= 2 && afHits > enHits) return 'af';
  if (enHits >= 2 && enHits > afHits) return 'en';
  return af() ? 'af' : 'en';
}

function currentName() { return centreSelect?.selectedOptions?.[0]?.textContent?.trim() || ''; }

function confidenceLabel(value, lang) {
  const labels = {
    documented: ['documented', 'gedokumenteer'],
    strong: ['strong', 'sterk'],
    probable: ['probable', 'waarskynlik'],
    hypothesis: ['hypothesis', 'hipotese'],
    unresolved: ['unresolved', 'onopgelos'],
    mixed: ['mixed', 'gemeng'],
  };
  const pair = labels[value] || [String(value || '').replaceAll('_', ' '), String(value || '').replaceAll('_', ' ')];
  return lang === 'af' ? pair[1] : pair[0];
}

function addMessage(kind, text) {
  const host = $('familyBotV2Messages');
  if (!host) return null;
  const node = document.createElement('div');
  node.className = `k3v2-msg ${kind}`;
  node.textContent = text;
  host.appendChild(node);
  host.scrollTop = host.scrollHeight;
  return node;
}

function setBusy(value) {
  busy = value;
  if ($('familyBotV2Input')) $('familyBotV2Input').disabled = value;
  if ($('familyBotV2Send')) $('familyBotV2Send').disabled = value;
}

function setPlaceholder() {
  const input = $('familyBotV2Input');
  if (!input) return;
  const lang = capture?.lang || (af() ? 'af' : 'en');
  input.placeholder = capture
    ? q(lang, 'Tell K-3 what you remember, in your own words...', 'Vertel K-3 wat jy onthou, in jou eie woorde...')
    : t('Ask about someone in the family archive...', 'Vra oor iemand in die familie-argief...');
}

function updateContext() {
  const span = $('familyBotV2ContextValue');
  if (span) span.textContent = currentName() || t('Name someone in your question', 'Noem iemand in jou vraag');
}

function refreshStaticCopy() {
  if (!built) return;
  const title = $('familyBotV2Title');
  const subtitle = $('familyBotV2Subtitle');
  const contextLabel = $('familyBotV2ContextLabel');
  const close = $('familyBotV2Close');
  const send = $('familyBotV2Send');
  if (title) title.textContent = t('K-3 Family Droid', 'K-3 Familiedroid');
  if (subtitle) subtitle.textContent = t('Ask, remember, contribute', 'Vra, onthou, dra by');
  if (contextLabel) contextLabel.textContent = t('Current focus:', 'Huidige fokus:');
  if (close) close.setAttribute('aria-label', t('Close K-3', 'Maak K-3 toe'));
  if (send) send.textContent = t('Send', 'Stuur');
  setPlaceholder();
  updateContext();
}

function installStyles() {
  if (!rootRef || $('familyBotConversationV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'familyBotConversationV2Styles';
  style.textContent = `
    *{box-sizing:border-box}
    .k3v2-panel{position:absolute;left:0;bottom:70px;width:min(430px,calc(100vw - 36px));height:min(620px,calc(100dvh - 118px));display:none;grid-template-rows:auto auto 1fr auto;background:#fffaf3;border:1px solid #cdbdac;border-radius:18px;box-shadow:0 22px 55px rgba(46,36,28,.26);overflow:hidden;font-family:Arial,sans-serif;color:#40362e}
    .k3v2-panel.open{display:grid}
    .k3v2-head{display:flex;justify-content:space-between;gap:12px;padding:14px 15px;background:#4a3b2f;color:white}.k3v2-head strong{font-size:15px}.k3v2-head small{display:block;margin-top:2px;color:#e8ddd1;font-size:10px}.k3v2-close{border:0;background:none;color:white;font:700 20px/1 Arial;cursor:pointer;padding:4px 6px;border-radius:7px}.k3v2-close:hover{background:rgba(255,255,255,.1)}
    .k3v2-context{padding:9px 13px;background:#f8f1e8;border-bottom:1px solid #e5dbcf;color:#67594d;font:700 10px/1.35 Arial}.k3v2-context span{font-weight:500}.k3v2-messages{overflow:auto;padding:14px;display:flex;flex-direction:column;gap:11px;overscroll-behavior:contain}.k3v2-msg{max-width:92%;padding:10px 11px;border-radius:14px;font:12px/1.5 Arial;white-space:pre-wrap}.k3v2-msg.user{align-self:flex-end;background:#4a3b2f;color:white;border-bottom-right-radius:4px}.k3v2-msg.bot{align-self:flex-start;background:#f3ece3;color:#40362e;border-bottom-left-radius:4px}.k3v2-msg.system{align-self:center;max-width:100%;background:#fff5df;border:1px solid #ead6ad;color:#6c5737;text-align:center;font-size:11px}.k3v2-msg.loading{font-style:italic;color:#796a5d}
    .k3v2-headrow{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:7px}.k3v2-target{font-weight:800}.k3v2-confidence{padding:3px 6px;border-radius:999px;background:#e2d6c8;font:800 8px/1 Arial;text-transform:uppercase}.k3v2-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.k3v2-action{border:1px solid #bda994;background:white;color:#4b3c31;border-radius:999px;padding:7px 9px;font:800 9px/1.2 Arial;cursor:pointer}.k3v2-action.primary{background:#6f8c62;color:white;border-color:#6f8c62}.k3v2-basis{margin-top:9px;padding-top:7px;border-top:1px solid #ddd0c2}.k3v2-basis summary{cursor:pointer;font-weight:800;font-size:10px}.k3v2-basis ul{margin:7px 0 0;padding-left:17px}.k3v2-draft{margin-top:8px;padding-top:8px;border-top:1px solid #ddd0c2}.k3v2-draft h4{margin:0 0 5px;font-size:11px}.k3v2-draft ul{margin:5px 0 0;padding-left:18px;font-size:10px}
    .k3v2-form{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;background:white;border-top:1px solid #e3d8cc}.k3v2-input{resize:none;min-height:42px;max-height:118px;border:1px solid #cfc0b0;border-radius:12px;padding:9px 10px;font:12px/1.4 Arial}.k3v2-send{height:42px;min-width:58px;border:0;border-radius:12px;background:#4a3b2f;color:white;font:800 10px Arial;cursor:pointer}.k3v2-send:disabled,.k3v2-input:disabled{opacity:.6}
    @media(max-width:600px){.k3v2-panel{bottom:66px;width:calc(100vw - 24px);height:min(650px,calc(100dvh - 92px))}}
  `;
  rootRef.appendChild(style);
}

function action(label, onClick, primary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `k3v2-action${primary ? ' primary' : ''}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function buildUi() {
  if (built || !rootRef) return;
  built = true;
  installStyles();
  const mount = $('panelMount');
  if (!mount) throw new Error('K-3 Shadow DOM mount is missing');
  const panel = document.createElement('section');
  panel.id = 'familyBotV2Panel';
  panel.className = 'k3v2-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'K-3 family archive assistant');
  panel.innerHTML = `
    <header class="k3v2-head"><div><strong id="familyBotV2Title"></strong><small id="familyBotV2Subtitle"></small></div><button id="familyBotV2Close" class="k3v2-close" type="button">x</button></header>
    <div id="familyBotV2Context" class="k3v2-context"><strong id="familyBotV2ContextLabel"></strong> <span id="familyBotV2ContextValue"></span></div>
    <div id="familyBotV2Messages" class="k3v2-messages" aria-live="polite"></div>
    <form id="familyBotV2Form" class="k3v2-form"><textarea id="familyBotV2Input" class="k3v2-input" rows="2" maxlength="6000"></textarea><button id="familyBotV2Send" class="k3v2-send" type="submit"></button></form>`;
  mount.appendChild(panel);

  addMessage('bot', t(
    'Ask what the archive currently knows. If you remember something different, tell me here and I can prepare a contribution for you to review before anything is submitted.',
    'Vra wat die argief tans weet. As jy iets anders onthou, vertel my hier en ek kan n bydrae voorberei wat jy kan nagaan voordat enigiets ingedien word.'
  ));
  $('familyBotV2Close')?.addEventListener('click', closePanel);
  $('familyBotV2Form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('familyBotV2Input');
    const text = input?.value.trim();
    if (!text || busy) return;
    input.value = '';
    if (capture) void captureMemory(text);
    else void askQuestion(text);
  });
  $('familyBotV2Input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('familyBotV2Form')?.requestSubmit();
    }
  });
  centreSelect?.addEventListener('change', updateContext);
  document.addEventListener('genealogy:language-changed', refreshStaticCopy);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('familyBotV2Panel')?.classList.contains('open')) closePanel();
  });
  refreshStaticCopy();
}

function openPanel() {
  buildUi();
  $('familyBotV2Panel')?.classList.add('open');
  launcherRef?.setAttribute('aria-expanded', 'true');
  updateContext();
  window.setTimeout(() => $('familyBotV2Input')?.focus(), 30);
}

function closePanel() {
  $('familyBotV2Panel')?.classList.remove('open');
  launcherRef?.setAttribute('aria-expanded', 'false');
}

function renderAmbiguity(data, question, lang) {
  const card = addMessage('bot', data.message || q(lang, 'Which person did you mean?', 'Watter persoon bedoel jy?'));
  if (!card) return;
  const actions = document.createElement('div');
  actions.className = 'k3v2-actions';
  (data.candidates || []).forEach((candidate) => actions.appendChild(action(
    [candidate.name, candidate.years].filter(Boolean).join(' - '),
    () => void askQuestion(question, candidate.id, true, lang)
  )));
  card.appendChild(actions);
}

function renderPrivacy(data, question, lang) {
  const card = addMessage('bot', data.message || q(lang, 'I cannot answer that profile through the archive AI.', 'Ek kan nie daardie profiel deur die argief-KI beantwoord nie.'));
  if (!card || !data.target?.id) return;
  const actions = document.createElement('div');
  actions.className = 'k3v2-actions';
  actions.appendChild(action(q(lang, 'Share what you know', 'Deel wat jy weet'), () => beginContribution(data, question, lang), true));
  card.appendChild(actions);
}

function renderAnswer(data, question, lang) {
  const host = $('familyBotV2Messages');
  if (!host) return;
  const answer = data.answer || {};
  const card = document.createElement('div');
  card.className = 'k3v2-msg bot';
  const head = document.createElement('div');
  head.className = 'k3v2-headrow';
  const target = document.createElement('span');
  target.className = 'k3v2-target';
  target.textContent = data.target?.name || 'K-3';
  head.appendChild(target);
  if (answer.confidence) {
    const badge = document.createElement('span');
    badge.className = 'k3v2-confidence';
    badge.textContent = confidenceLabel(answer.confidence, lang);
    head.appendChild(badge);
  }
  card.appendChild(head);

  const text = document.createElement('div');
  text.textContent = answer.answer || '';
  card.appendChild(text);

  if (Array.isArray(answer.basis) && answer.basis.length) {
    const details = document.createElement('details');
    details.className = 'k3v2-basis';
    const summary = document.createElement('summary');
    summary.textContent = q(lang, 'Why K-3 says this', 'Waarom K-3 dit se');
    details.appendChild(summary);
    const list = document.createElement('ul');
    answer.basis.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `${item.label || ''}${item.detail ? ` - ${item.detail}` : ''}`;
      list.appendChild(li);
    });
    details.appendChild(list);
    card.appendChild(details);
  }

  if (answer.follow_up) {
    const follow = document.createElement('div');
    follow.style.marginTop = '8px';
    follow.style.fontSize = '10px';
    follow.textContent = answer.follow_up;
    card.appendChild(follow);
  }

  const actions = document.createElement('div');
  actions.className = 'k3v2-actions';
  actions.appendChild(action(q(lang, 'Share what you know', 'Deel wat jy weet'), () => beginContribution(data, question, lang), true));
  if (answer.offer_research && answer.research_question) {
    actions.appendChild(action(q(lang, 'Research this question', 'Navors hierdie vraag'), () => void handoffResearch(data.target?.id, answer.research_question, lang)));
  }
  card.appendChild(actions);
  host.appendChild(card);
  host.scrollTop = host.scrollHeight;
}

async function askQuestion(question, personId = '', silent = false, forcedLang = '') {
  if (busy) return;
  capture = null;
  setPlaceholder();
  const lang = forcedLang || languageOf(question);
  if (!silent) {
    addMessage('user', question);
    history.push({ role: 'user', text: question });
  }
  setBusy(true);
  const loading = addMessage('bot loading', q(lang, 'K-3 is checking the archive...', 'K-3 kyk deur die argief...'));
  try {
    const { data, error } = await supabase.functions.invoke('genealogy-family-bot-v2', {
      body: { mode: 'ask', question, language: lang, person_id: personId || undefined, selected_person_id: centreSelect?.value || undefined, conversation: history.slice(-6) },
    });
    loading?.remove();
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Archive request failed');
    if (data.status === 'ambiguous_person') return renderAmbiguity(data, question, lang);
    if (data.status === 'needs_person') return addMessage('bot', data.message);
    if (data.status === 'privacy_limited') return renderPrivacy(data, question, lang);
    if (data.status === 'answered') {
      renderAnswer(data, question, lang);
      history.push({ role: 'assistant', text: data.answer?.answer || '' });
      return;
    }
    addMessage('bot', q(lang, 'I could not turn that into an archive answer yet.', 'Ek kon dit nog nie in n argiefantwoord omskep nie.'));
  } catch (error) {
    loading?.remove();
    addMessage('system', error?.message || q(lang, 'K-3 could not answer right now.', 'K-3 kon nie nou antwoord nie.'));
  } finally {
    setBusy(false);
  }
}

function beginContribution(data, question, lang) {
  capture = {
    targetId: data.target?.id || centreSelect?.value || '',
    targetName: data.target?.name || currentName() || q(lang, 'this person', 'hierdie persoon'),
    question,
    lang,
    memories: [],
  };
  setPlaceholder();
  addMessage('bot', q(lang,
    'Tell me what you remember in your own words. Names, places, approximate dates, who told you, occupations and small details can all be useful. I will keep your wording and only flag possible leads for review.',
    'Vertel my in jou eie woorde wat jy onthou. Name, plekke, benaderde datums, wie dit vertel het, beroepe en klein besonderhede kan alles nuttig wees. Ek sal jou bewoording behou en slegs moontlike leidrade vir hersiening uitlig.'
  ));
  $('familyBotV2Input')?.focus();
}

async function captureMemory(memory) {
  if (!capture || busy) return;
  capture.memories.push(memory);
  addMessage('user', memory);
  setBusy(true);
  const loading = addMessage('bot loading', q(capture.lang, 'K-3 is preparing a contribution draft...', 'K-3 berei n bydraekonsep voor...'));
  const raw = capture.memories.join('\n\n');
  try {
    const { data, error } = await supabase.functions.invoke('genealogy-family-bot-v2', {
      body: { mode: 'capture_contribution', person_id: capture.targetId || undefined, selected_person_id: centreSelect?.value || undefined, question: capture.question, memory: raw, language: capture.lang },
    });
    loading?.remove();
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Contribution preparation failed');
    renderDraft(data.contribution || { raw_memory: raw, neutral_summary: raw, categories: ['story'], clues: [], follow_up_question: '' });
  } catch {
    loading?.remove();
    renderDraft({ raw_memory: raw, neutral_summary: raw, categories: ['story'], clues: [], follow_up_question: '' }, true);
  } finally {
    setBusy(false);
  }
}

function renderDraft(draft, fallback = false) {
  const host = $('familyBotV2Messages');
  if (!host || !capture) return;
  const lang = capture.lang;
  const card = document.createElement('div');
  card.className = 'k3v2-msg bot';
  const title = document.createElement('strong');
  title.textContent = q(lang, 'Contribution draft', 'Bydraekonsep');
  card.appendChild(title);

  const summary = document.createElement('div');
  summary.className = 'k3v2-draft';
  const heading = document.createElement('h4');
  heading.textContent = q(lang, 'What I understood', 'Wat ek verstaan het');
  summary.appendChild(heading);
  const summaryText = document.createElement('div');
  summaryText.textContent = draft.neutral_summary || draft.raw_memory || '';
  summary.appendChild(summaryText);
  card.appendChild(summary);

  if (fallback) {
    const note = document.createElement('div');
    note.className = 'k3v2-draft';
    note.textContent = q(lang, 'I could not safely extract clues, but your own words are preserved and can still be submitted.', 'Ek kon nie die leidrade veilig uithaal nie, maar jou eie woorde is behou en kan steeds ingedien word.');
    card.appendChild(note);
  }

  if (Array.isArray(draft.clues) && draft.clues.length) {
    const section = document.createElement('div');
    section.className = 'k3v2-draft';
    const cluesHeading = document.createElement('h4');
    cluesHeading.textContent = q(lang, 'Possible leads - not established facts', 'Moontlike leidrade - nie vasgestelde feite nie');
    section.appendChild(cluesHeading);
    const list = document.createElement('ul');
    draft.clues.slice(0, 8).forEach((clue) => {
      const li = document.createElement('li');
      li.textContent = [clue.kind, clue.detail].filter(Boolean).join(': ');
      list.appendChild(li);
    });
    section.appendChild(list);
    card.appendChild(section);
  }

  if (draft.follow_up_question) {
    const follow = document.createElement('div');
    follow.className = 'k3v2-draft';
    follow.textContent = draft.follow_up_question;
    card.appendChild(follow);
  }

  const actions = document.createElement('div');
  actions.className = 'k3v2-actions';
  actions.appendChild(action(q(lang, 'Add to contribution form', 'Voeg by bydraevorm'), () => void handoffContribution(draft), true));
  actions.appendChild(action(q(lang, 'Tell K-3 more', 'Vertel K-3 meer'), () => {
    setPlaceholder();
    addMessage('bot', q(lang, 'Go ahead - add anything else you remember.', 'Gaan voort - voeg enigiets anders by wat jy onthou.'));
    $('familyBotV2Input')?.focus();
  }));
  card.appendChild(actions);
  host.appendChild(card);
  host.scrollTop = host.scrollHeight;
}

async function handoffContribution(draft) {
  if (!capture) return;
  const lang = capture.lang;
  if (centreSelect && capture.targetId && [...centreSelect.options].some((o) => o.value === capture.targetId)) {
    centreSelect.value = capture.targetId;
    centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const workbench = await waitFor('#contributionWorkbench');
  if (workbench && 'open' in workbench) workbench.open = true;
  document.querySelector('#contributionModeTabs [data-mode="share"]')?.click();
  await wait(80);

  const categories = new Set(Array.isArray(draft.categories) && draft.categories.length ? draft.categories : ['story']);
  categories.add('story');
  const categoryInputs = [...document.querySelectorAll('input[name="contributionCategory"]')];
  categoryInputs.forEach((box) => {
    box.checked = categories.has(box.value);
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (!categoryInputs.length && doc('contributionType')) {
    doc('contributionType').value = [...categories][0] || 'story';
    doc('contributionType').dispatchEvent(new Event('change', { bubbles: true }));
  }

  const contributionLang = languageOf(draft.raw_memory || capture.memories.join('\n\n'));
  if (doc('contributionLanguageSelect')) {
    doc('contributionLanguageSelect').value = contributionLang;
    doc('contributionLanguageSelect').dataset.touched = '1';
    doc('contributionLanguageSelect').dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (doc('language')) doc('language').value = contributionLang;

  const clues = Array.isArray(draft.clues) ? draft.clues : [];
  const clueBlock = clues.length
    ? `\n\n${q(lang, 'K-3 possible leads for review (not established facts):', 'K-3 moontlike leidrade vir hersiening (nie vasgestelde feite nie):')}\n${clues.slice(0,8).map((clue) => `- ${[clue.kind, clue.detail].filter(Boolean).join(': ')}`).join('\n')}`
    : '';
  const text = `${q(lang, 'K-3 conversation about', 'K-3 gesprek oor')} ${capture.targetName}\n${q(lang, 'Question that prompted this:', 'Vraag wat hierdie bydrae uitgelok het:')} ${capture.question}\n\n${q(lang, "Family member's own words:", 'Familielid se eie woorde:')}\n${draft.raw_memory || capture.memories.join('\n\n')}${clueBlock}`;

  const area = await waitFor('#contributionText');
  if (area) {
    area.value = text;
    area.dispatchEvent(new Event('input', { bubbles: true }));
    area.dispatchEvent(new Event('change', { bubbles: true }));
  }

  closePanel();
  workbench?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => area?.focus(), 450);
  capture = null;
  setPlaceholder();
}

async function handoffResearch(targetId, question, lang) {
  if (!targetId || !question) return;
  if (centreSelect && [...centreSelect.options].some((o) => o.value === targetId)) {
    centreSelect.value = targetId;
    centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const workbench = await waitFor('#contributionWorkbench');
  if (workbench && 'open' in workbench) workbench.open = true;
  (await waitFor('#contributionModeTabs [data-mode="assist"]'))?.click();
  const area = await waitFor('#researchAssistantQuestion');
  if (!area) return addMessage('system', q(lang, 'I could not open the research assistant automatically.', 'Ek kon nie die navorsingsassistent outomaties oopmaak nie.'));
  area.value = question;
  area.dispatchEvent(new Event('input', { bubbles: true }));
  area.dispatchEvent(new Event('change', { bubbles: true }));
  closePanel();
  workbench?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => area.focus(), 450);
}

export async function openFamilyBot({ root, launcher }) {
  rootRef = root;
  launcherRef = launcher;
  openPanel();
}
