import { supabase } from './supabase-client-v1.js';

const centreSelect = document.getElementById('centreSelect');
const history = [];
let busy = false;
let built = false;
let capture = null;
let lastAnswer = null;

function af() { return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af'; }
function t(en, afText) { return af() ? afText : en; }
function selectedLabel() { return centreSelect?.selectedOptions?.[0]?.textContent?.trim() || ''; }
function wait(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
async function waitFor(selector, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    const node = document.querySelector(selector);
    if (node) return node;
    await wait(75);
  }
  return null;
}
function questionLanguage(text) {
  const value = String(text || '').toLowerCase();
  const afHits = (value.match(/\b(wat|wie|waar|wanneer|waarom|hoekom|gebore|oorlede|ouers|vader|moeder|bewys|bewyse|navors|onseker|familie|onthou|vertel)\b/g) || []).length;
  const enHits = (value.match(/\b(what|who|where|when|why|born|died|parents|father|mother|evidence|research|uncertain|family|remember|tell)\b/g) || []).length;
  if (afHits >= 2 && afHits > enHits) return 'af';
  if (enHits >= 2 && enHits > afHits) return 'en';
  return af() ? 'af' : 'en';
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function installStyles() {
  if (document.getElementById('familyBotConversationV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'familyBotConversationV2Styles';
  style.textContent = `
    .family-bot-v2-panel{position:fixed;left:18px;bottom:88px;z-index:1199;width:min(430px,calc(100vw - 36px));height:min(620px,calc(100dvh - 118px));display:none;grid-template-rows:auto auto 1fr auto;background:#fffaf3;border:1px solid #cdbdac;border-radius:18px;box-shadow:0 22px 55px rgba(46,36,28,.26);overflow:hidden;font-family:Arial,sans-serif}
    .family-bot-v2-panel.open{display:grid}.family-bot-v2-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;background:#4a3b2f;color:#fff}.family-bot-v2-title strong{display:block;font-size:15px}.family-bot-v2-title small{display:block;margin-top:2px;color:#e8ddd1;font-size:10px}.family-bot-v2-close{border:0;background:transparent;color:#fff;font:700 20px/1 Arial,sans-serif;cursor:pointer;padding:6px;border-radius:8px}
    .family-bot-v2-context{padding:9px 13px;border-bottom:1px solid #e5dbcf;background:#f8f1e8;color:#67594d;font:700 10px/1.35 Arial,sans-serif}.family-bot-v2-context span{font-weight:500}
    .family-bot-v2-messages{overflow:auto;padding:14px;display:flex;flex-direction:column;gap:11px;overscroll-behavior:contain}.family-bot-v2-message{max-width:92%;border-radius:14px;padding:10px 11px;font:12px/1.5 Arial,sans-serif;white-space:pre-wrap}.family-bot-v2-message.user{align-self:flex-end;background:#4a3b2f;color:#fff;border-bottom-right-radius:4px}.family-bot-v2-message.bot{align-self:flex-start;background:#f3ece3;color:#40362e;border-bottom-left-radius:4px}.family-bot-v2-message.system{align-self:center;max-width:100%;background:#fff5df;color:#6c5737;border:1px solid #ead6ad;text-align:center;font-size:11px}.family-bot-v2-message.loading{color:#796a5d;font-style:italic}
    .family-bot-v2-answer-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:7px}.family-bot-v2-target{font-weight:800;color:#392f28}.family-bot-v2-confidence{padding:3px 6px;border-radius:999px;background:#e2d6c8;color:#625447;font:800 8px/1 Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em}.family-bot-v2-basis{margin-top:9px;border-top:1px solid #ddd0c2;padding-top:7px}.family-bot-v2-basis summary{cursor:pointer;font-weight:800;font-size:10px;color:#635448}.family-bot-v2-basis ul{margin:7px 0 0;padding-left:17px}.family-bot-v2-basis li{margin:5px 0;font-size:10px;line-height:1.4}.family-bot-v2-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.family-bot-v2-action,.family-bot-v2-starter{border:1px solid #bda994;background:#fffaf3;color:#4b3c31;border-radius:999px;padding:7px 9px;font:800 9px/1.2 Arial,sans-serif;cursor:pointer}.family-bot-v2-action.primary{background:#6f8c62;color:#fff;border-color:#6f8c62}.family-bot-v2-action.secondary{background:#fff}.family-bot-v2-starters{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
    .family-bot-v2-draft{margin-top:8px;padding-top:8px;border-top:1px solid #ddd0c2}.family-bot-v2-draft h4{margin:0 0 5px;font-size:11px}.family-bot-v2-clues{margin:6px 0 0;padding-left:18px}.family-bot-v2-clues li{margin:4px 0;font-size:10px}.family-bot-v2-form{border-top:1px solid #e3d8cc;padding:10px;background:#fff;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.family-bot-v2-input{resize:none;min-height:42px;max-height:118px;border:1px solid #cfc0b0;border-radius:12px;padding:9px 10px;font:12px/1.4 Arial,sans-serif;color:#3d342d;background:#fff}.family-bot-v2-send{height:42px;min-width:58px;border:0;border-radius:12px;background:#4a3b2f;color:#fff;font:800 10px Arial,sans-serif;cursor:pointer}.family-bot-v2-send:disabled,.family-bot-v2-input:disabled{opacity:.55}
    @media(max-width:600px){.family-bot-v2-panel{left:8px;bottom:76px;width:calc(100vw - 16px);height:min(650px,calc(100dvh - 92px));border-radius:16px}}
  `;
  document.head.appendChild(style);
}

function updateContext() {
  const span = document.querySelector('#familyBotV2Context span');
  if (span) span.textContent = selectedLabel() || t('No person selected - name someone in your question', 'Geen persoon gekies nie - noem iemand in jou vraag');
}
function scrollMessages() {
  const host = document.getElementById('familyBotV2Messages');
  if (host) host.scrollTop = host.scrollHeight;
}
function addMessage(kind, text) {
  const host = document.getElementById('familyBotV2Messages');
  if (!host) return null;
  const node = document.createElement('div');
  node.className = `family-bot-v2-message ${kind}`;
  node.textContent = text;
  host.appendChild(node);
  scrollMessages();
  return node;
}
function setBusy(value) {
  busy = value;
  const send = document.getElementById('familyBotV2Send');
  const input = document.getElementById('familyBotV2Input');
  if (send) send.disabled = value;
  if (input) input.disabled = value;
}
function setInputMode(mode = 'question') {
  const input = document.getElementById('familyBotV2Input');
  if (!input) return;
  input.placeholder = mode === 'memory'
    ? t('Tell K-3 what you remember, in your own words...', 'Vertel K-3 wat jy onthou, in jou eie woorde...')
    : t('Ask about someone in the family archive...', 'Vra oor iemand in die familie-argief...');
}

function buildUi() {
  if (built) return;
  built = true;
  installStyles();
  const panel = document.createElement('section');
  panel.id = 'familyBotV2Panel';
  panel.className = 'family-bot-v2-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'K-3 family archive assistant');
  panel.innerHTML = `
    <header class="family-bot-v2-head"><div class="family-bot-v2-title"><strong>K-3 Family Droid</strong><small>${t('Ask, remember, contribute', 'Vra, onthou, dra by')}</small></div><button id="familyBotV2Close" class="family-bot-v2-close" type="button" aria-label="${t('Close K-3', 'Maak K-3 toe')}">x</button></header>
    <div id="familyBotV2Context" class="family-bot-v2-context"><strong>${t('Current focus:', 'Huidige fokus:')}</strong> <span></span></div>
    <div id="familyBotV2Messages" class="family-bot-v2-messages" aria-live="polite"></div>
    <form id="familyBotV2Form" class="family-bot-v2-form"><textarea id="familyBotV2Input" class="family-bot-v2-input" rows="2" maxlength="6000"></textarea><button id="familyBotV2Send" class="family-bot-v2-send" type="submit">${t('Send', 'Stuur')}</button></form>`;
  document.body.appendChild(panel);

  const intro = document.createElement('div');
  intro.className = 'family-bot-v2-message bot';
  intro.append(document.createTextNode(t(
    'Ask me what the family archive currently knows. If you remember something different or know a detail we have missed, you can share it here and I will prepare a contribution for you to review.',
    'Vra my wat die familie-argief tans weet. As jy iets anders onthou of n besonderheid ken wat ons gemis het, kan jy dit hier deel en ek sal n bydrae voorberei wat jy kan nagaan.'
  )));
  const starters = document.createElement('div');
  starters.className = 'family-bot-v2-starters';
  [
    [t('What do we know about this person?', 'Wat weet ons van hierdie persoon?'), t('What do we know about this person?', 'Wat weet ons van hierdie persoon?')],
    [t('What is uncertain here?', 'Wat is hier onseker?'), t('What is uncertain about this person in the archive?', 'Wat is onseker oor hierdie persoon in die argief?')],
  ].forEach(([label, question]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'family-bot-v2-starter';
    button.textContent = label;
    button.addEventListener('click', () => askQuestion(question));
    starters.appendChild(button);
  });
  intro.appendChild(starters);
  document.getElementById('familyBotV2Messages').appendChild(intro);

  document.getElementById('familyBotV2Close')?.addEventListener('click', closePanel);
  document.getElementById('familyBotV2Form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('familyBotV2Input');
    const text = input?.value.trim();
    if (!text || busy) return;
    if (input) input.value = '';
    if (capture) captureMemory(text);
    else askQuestion(text);
  });
  document.getElementById('familyBotV2Input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('familyBotV2Form')?.requestSubmit();
    }
  });
  centreSelect?.addEventListener('change', updateContext);
  document.addEventListener('genealogy:language-changed', refreshLanguage);
  setInputMode();
  updateContext();
}

function refreshLanguage() {
  if (!built) return;
  const panel = document.getElementById('familyBotV2Panel');
  const subtitle = panel?.querySelector('.family-bot-v2-title small');
  if (subtitle) subtitle.textContent = t('Ask, remember, contribute', 'Vra, onthou, dra by');
  const context = panel?.querySelector('#familyBotV2Context strong');
  if (context) context.textContent = t('Current focus:', 'Huidige fokus:');
  const send = document.getElementById('familyBotV2Send');
  if (send) send.textContent = t('Send', 'Stuur');
  setInputMode(capture ? 'memory' : 'question');
  updateContext();
}

function openPanel() {
  buildUi();
  document.getElementById('familyBotV2Panel')?.classList.add('open');
  updateContext();
  window.setTimeout(() => document.getElementById('familyBotV2Input')?.focus(), 30);
}
function closePanel() { document.getElementById('familyBotV2Panel')?.classList.remove('open'); }

function renderAmbiguity(data, question) {
  const host = document.getElementById('familyBotV2Messages');
  if (!host) return;
  const card = document.createElement('div');
  card.className = 'family-bot-v2-message bot';
  card.append(document.createTextNode(data.message || t('Which person did you mean?', 'Watter persoon bedoel jy?')));
  const actions = document.createElement('div');
  actions.className = 'family-bot-v2-actions';
  (data.candidates || []).forEach((candidate) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'family-bot-v2-action secondary';
    button.textContent = [candidate.name, candidate.years].filter(Boolean).join(' - ');
    button.addEventListener('click', () => askQuestion(question, candidate.id, true));
    actions.appendChild(button);
  });
  card.appendChild(actions);
  host.appendChild(card);
  scrollMessages();
}

function renderAnswer(data, originalQuestion) {
  const host = document.getElementById('familyBotV2Messages');
  if (!host) return;
  lastAnswer = { data, question: originalQuestion };
  const answer = data.answer || {};
  const card = document.createElement('div');
  card.className = 'family-bot-v2-message bot';
  const head = document.createElement('div');
  head.className = 'family-bot-v2-answer-head';
  const target = document.createElement('span');
  target.className = 'family-bot-v2-target';
  target.textContent = data.target?.name || 'K-3';
  head.appendChild(target);
  if (answer.confidence) {
    const badge = document.createElement('span');
    badge.className = 'family-bot-v2-confidence';
    badge.textContent = answer.confidence.replaceAll('_', ' ');
    head.appendChild(badge);
  }
  card.appendChild(head);
  const body = document.createElement('div');
  body.textContent = answer.answer || '';
  card.appendChild(body);

  const basis = Array.isArray(answer.basis) ? answer.basis : [];
  if (basis.length) {
    const details = document.createElement('details');
    details.className = 'family-bot-v2-basis';
    const summary = document.createElement('summary');
    summary.textContent = t('Why K-3 says this', 'Waarom K-3 dit se');
    details.appendChild(summary);
    const list = document.createElement('ul');
    basis.forEach((item) => {
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
  actions.className = 'family-bot-v2-actions';
  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'family-bot-v2-action primary';
  share.textContent = t('Share what you know', 'Deel wat jy weet');
  share.addEventListener('click', () => beginContribution(data, originalQuestion));
  actions.appendChild(share);
  if (answer.offer_research && answer.research_question) {
    const research = document.createElement('button');
    research.type = 'button';
    research.className = 'family-bot-v2-action secondary';
    research.textContent = t('Research this question', 'Navors hierdie vraag');
    research.addEventListener('click', () => handoffToResearch(data.target?.id, answer.research_question));
    actions.appendChild(research);
  }
  card.appendChild(actions);
  host.appendChild(card);
  scrollMessages();
}

async function askQuestion(question, personId = '', silentUser = false) {
  if (busy || !question) return;
  capture = null;
  setInputMode('question');
  if (!silentUser) {
    addMessage('user', question);
    history.push({ role: 'user', text: question });
  }
  setBusy(true);
  const loading = addMessage('bot loading', t('K-3 is checking the archive...', 'K-3 kyk deur die argief...'));
  try {
    const language = questionLanguage(question);
    const { data, error } = await supabase.functions.invoke('genealogy-family-bot', {
      body: {
        mode: 'ask',
        question,
        language,
        person_id: personId || undefined,
        selected_person_id: centreSelect?.value || undefined,
        conversation: history.slice(-6),
      },
    });
    loading?.remove();
    if (error) {
      let message = error.message || t('K-3 could not reach the archive.', 'K-3 kon nie die argief bereik nie.');
      if (error.context) {
        try { const payload = await error.context.json(); if (payload?.error) message = payload.error; } catch { /* no-op */ }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    if (data?.status === 'ambiguous_person') return renderAmbiguity(data, question);
    if (data?.status === 'needs_person' || data?.status === 'privacy_limited') {
      addMessage('bot', data.message || t('I need a little more context.', 'Ek het nog n bietjie konteks nodig.'));
      return;
    }
    if (data?.status === 'answered') {
      renderAnswer(data, question);
      history.push({ role: 'assistant', text: data.answer?.answer || '' });
      return;
    }
    addMessage('bot', t('I could not turn that into an archive answer yet. Try naming the person more specifically.', 'Ek kon dit nog nie in n argiefantwoord omskep nie. Noem die persoon meer spesifiek.'));
  } catch (error) {
    loading?.remove();
    addMessage('system', error?.message || t('K-3 could not answer right now.', 'K-3 kon nie nou antwoord nie.'));
  } finally {
    setBusy(false);
  }
}

function beginContribution(data, originQuestion) {
  capture = {
    targetId: data.target?.id || centreSelect?.value || '',
    targetName: data.target?.name || selectedLabel() || t('this person', 'hierdie persoon'),
    question: originQuestion,
    language: questionLanguage(originQuestion),
    memories: [],
  };
  setInputMode('memory');
  addMessage('bot', t(
    'Please tell me what you remember in your own words. Half-remembered names, places, who told you the story, approximate dates, occupations or reasons you believe it can all be useful. I will keep your words and only extract possible leads for review.',
    'Vertel my asseblief in jou eie woorde wat jy onthou. Half-onthoude name, plekke, wie die verhaal vertel het, benaderde datums, beroepe of redes waarom jy dit glo kan alles nuttig wees. Ek sal jou eie woorde behou en slegs moontlike leidrade vir hersiening uithaal.'
  ));
  document.getElementById('familyBotV2Input')?.focus();
}

async function captureMemory(text) {
  if (!capture || busy) return;
  capture.memories.push(text);
  addMessage('user', text);
  setBusy(true);
  const loading = addMessage('bot loading', t('K-3 is preparing this as a family contribution...', 'K-3 berei dit as n familiebydrae voor...'));
  try {
    const fullMemory = capture.memories.join('\n\n');
    const { data, error } = await supabase.functions.invoke('genealogy-family-bot', {
      body: {
        mode: 'capture_contribution',
        person_id: capture.targetId || undefined,
        selected_person_id: centreSelect?.value || undefined,
        question: capture.question,
        memory: fullMemory,
        language: questionLanguage(fullMemory),
      },
    });
    loading?.remove();
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Contribution extraction failed');
    const draft = data?.contribution || {
      raw_memory: fullMemory,
      neutral_summary: fullMemory,
      categories: ['story'],
      clues: [],
      follow_up_question: '',
    };
    renderContributionDraft(draft);
  } catch (error) {
    loading?.remove();
    const fallback = {
      raw_memory: capture.memories.join('\n\n'),
      neutral_summary: capture.memories.join('\n\n'),
      categories: ['story'],
      clues: [],
      follow_up_question: '',
    };
    renderContributionDraft(fallback, t('K-3 could not extract clues safely, but your own words can still be contributed.', 'K-3 kon nie die leidrade veilig uithaal nie, maar jou eie woorde kan steeds as bydrae ingedien word.'));
  } finally {
    setBusy(false);
  }
}

function renderContributionDraft(draft, note = '') {
  const host = document.getElementById('familyBotV2Messages');
  if (!host || !capture) return;
  const card = document.createElement('div');
  card.className = 'family-bot-v2-message bot';
  const title = document.createElement('strong');
  title.textContent = t('Contribution draft', 'Bydraekonsep');
  card.appendChild(title);
  if (note) {
    const n = document.createElement('div');
    n.style.marginTop = '6px';
    n.textContent = note;
    card.appendChild(n);
  }
  if (draft.neutral_summary) {
    const summary = document.createElement('div');
    summary.className = 'family-bot-v2-draft';
    summary.innerHTML = `<h4>${esc(t('What I understood', 'Wat ek verstaan het'))}</h4><div>${esc(draft.neutral_summary)}</div>`;
    card.appendChild(summary);
  }
  const clues = Array.isArray(draft.clues) ? draft.clues : [];
  if (clues.length) {
    const section = document.createElement('div');
    section.className = 'family-bot-v2-draft';
    const heading = document.createElement('h4');
    heading.textContent = t('Possible clues for the reviewer - not established facts', 'Moontlike leidrade vir die beoordelaar - nie vasgestelde feite nie');
    section.appendChild(heading);
    const list = document.createElement('ul');
    list.className = 'family-bot-v2-clues';
    clues.slice(0, 8).forEach((clue) => {
      const li = document.createElement('li');
      li.textContent = [clue.kind, clue.detail].filter(Boolean).join(': ');
      list.appendChild(li);
    });
    section.appendChild(list);
    card.appendChild(section);
  }
  if (draft.follow_up_question) {
    const follow = document.createElement('div');
    follow.className = 'family-bot-v2-draft';
    follow.textContent = draft.follow_up_question;
    card.appendChild(follow);
  }
  const actions = document.createElement('div');
  actions.className = 'family-bot-v2-actions';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'family-bot-v2-action primary';
  add.textContent = t('Add this to the contribution form', 'Voeg dit by die bydraevorm');
  add.addEventListener('click', () => handoffToContribution(draft));
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'family-bot-v2-action secondary';
  more.textContent = t('Tell K-3 more', 'Vertel K-3 meer');
  more.addEventListener('click', () => {
    setInputMode('memory');
    addMessage('bot', t('Go ahead - add anything else you remember.', 'Gaan voort - voeg enigiets anders by wat jy onthou.'));
    document.getElementById('familyBotV2Input')?.focus();
  });
  actions.append(add, more);
  card.appendChild(actions);
  host.appendChild(card);
  scrollMessages();
}

async function handoffToContribution(draft) {
  if (!capture) return;
  const targetId = capture.targetId;
  if (centreSelect && targetId && [...centreSelect.options].some((option) => option.value === targetId)) {
    centreSelect.value = targetId;
    centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const workbench = await waitFor('#contributionWorkbench');
  if (workbench && 'open' in workbench) workbench.open = true;
  const shareTab = document.querySelector('#contributionModeTabs [data-mode="share"]');
  shareTab?.click();
  await wait(80);

  const categories = new Set(Array.isArray(draft.categories) && draft.categories.length ? draft.categories : ['story']);
  categories.add('story');
  document.querySelectorAll('input[name="contributionCategory"]').forEach((checkbox) => {
    checkbox.checked = categories.has(checkbox.value);
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const legacyType = document.getElementById('contributionType');
  if (legacyType && !document.querySelector('input[name="contributionCategory"]')) legacyType.value = [...categories][0] || 'story';

  const language = questionLanguage(draft.raw_memory || capture.memories.join('\n\n'));
  const languageSelect = document.getElementById('contributionLanguageSelect');
  if (languageSelect) {
    languageSelect.value = language;
    languageSelect.dataset.touched = '1';
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const legacyLanguage = document.getElementById('language');
  if (legacyLanguage) legacyLanguage.value = language;

  const clues = Array.isArray(draft.clues) ? draft.clues : [];
  const clueText = clues.length
    ? `\n\n${t('K-3 extracted possible leads for review (not established facts):', 'K-3 het moontlike leidrade vir hersiening uitgelig (nie vasgestelde feite nie):')}\n${clues.slice(0, 8).map((clue) => `- ${[clue.kind, clue.detail].filter(Boolean).join(': ')}`).join('\n')}`
    : '';
  const text = `${t('K-3 conversation about', 'K-3 gesprek oor')} ${capture.targetName}\n${t('Question that prompted this:', 'Vraag wat hierdie bydrae uitgelok het:')} ${capture.question}\n\n${t("Family member's own words:", 'Familielid se eie woorde:')}\n${draft.raw_memory || capture.memories.join('\n\n')}${clueText}`;
  const textarea = await waitFor('#contributionText');
  if (textarea) {
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closePanel();
  workbench?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => textarea?.focus(), 450);
  capture = null;
  setInputMode('question');
}

async function handoffToResearch(targetId, researchQuestion) {
  if (!targetId || !researchQuestion) return;
  if (centreSelect && [...centreSelect.options].some((option) => option.value === targetId)) {
    centreSelect.value = targetId;
    centreSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const workbench = await waitFor('#contributionWorkbench');
  if (workbench && 'open' in workbench) workbench.open = true;
  const assistTab = await waitFor('#contributionModeTabs [data-mode="assist"]');
  assistTab?.click();
  const textarea = await waitFor('#researchAssistantQuestion');
  if (!textarea) {
    addMessage('system', t('I could not open the research assistant automatically. The research question remains here.', 'Ek kon nie die navorsingsassistent outomaties oopmaak nie. Die navorsingsvraag bly hier.'));
    return;
  }
  textarea.value = researchQuestion;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  closePanel();
  workbench?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => textarea.focus(), 450);
}

export async function openFamilyBot() {
  openPanel();
}
