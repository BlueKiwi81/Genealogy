import { supabase } from './supabase-client-v1.js';

let rootRef = null;
let launcherRef = null;
let panelRef = null;
let history = [];
let busy = false;
let currentTargetId = null;
let currentTargetName = '';
let currentQuestion = '';
let currentQuestionLanguage = 'en';
let currentResearchQuestion = '';

function uiAfrikaans() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}

function t(en, af) {
  return uiAfrikaans() ? af : en;
}

function detectQuestionLanguage(text) {
  const value = String(text || '').toLowerCase();
  const afHits = (value.match(/\b(wat|wie|waar|wanneer|waarom|hoekom|is|was|het|hy|sy|gebore|oorlede|ouers|vader|moeder|skip|familie|bewys|navors|onthou|gehoor)\b/g) || []).length;
  const enHits = (value.match(/\b(what|who|where|when|why|is|was|did|he|she|born|died|parents|father|mother|ship|family|evidence|research|remember|heard)\b/g) || []).length;
  if (afHits > enHits && afHits >= 2) return 'af';
  if (enHits > afHits && enHits >= 2) return 'en';
  return uiAfrikaans() ? 'af' : 'en';
}

function qcopy(lang, en, af) {
  return lang === 'af' ? af : en;
}

function selectedPersonId() {
  return document.getElementById('centreSelect')?.value || '';
}

function selectedPersonLabel() {
  return document.getElementById('centreSelect')?.selectedOptions?.[0]?.textContent?.trim() || '';
}

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

function injectDialogStyles(root) {
  if (root.getElementById('dialogStyles')) return;
  const style = document.createElement('style');
  style.id = 'dialogStyles';
  style.textContent = `
    *{box-sizing:border-box}
    #panel{position:absolute;left:0;bottom:76px;width:min(420px,calc(100vw - 40px));height:min(610px,calc(100vh - 116px));display:none;grid-template-rows:auto auto 1fr auto;background:#fffaf3;border:1px solid #cdbdac;border-radius:18px;box-shadow:0 22px 55px rgba(46,36,28,.26);overflow:hidden;color:#3e342c;font-family:Arial,sans-serif}
    #panel.open{display:grid}
    .head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;background:#4a3b2f;color:#fff}
    .title{display:flex;align-items:center;gap:10px}.mini{width:31px;height:31px;border:1px solid rgba(255,255,255,.65);border-radius:50%;display:grid;place-items:center;font:800 10px Arial,sans-serif}.head strong{display:block;font-size:15px}.head small{display:block;margin-top:2px;color:#e8ddd1;font-size:10px}
    .close{border:0;background:transparent;color:#fff;font:700 20px/1 Arial,sans-serif;cursor:pointer;padding:6px;border-radius:8px}.close:hover{background:rgba(255,255,255,.1)}
    .context{display:flex;align-items:center;gap:7px;padding:9px 13px;border-bottom:1px solid #e5dbcf;background:#f8f1e8;color:#67594d;font:700 10px/1.3 Arial,sans-serif}.context span{font-weight:500}.dot{width:7px;height:7px;border-radius:50%;background:#6f8c62;flex:none}
    .messages{overflow:auto;padding:14px;display:flex;flex-direction:column;gap:11px;overscroll-behavior:contain}.message{max-width:92%;border-radius:14px;padding:10px 11px;font:12px/1.5 Arial,sans-serif;white-space:pre-wrap}.message.user{align-self:flex-end;background:#4a3b2f;color:#fff;border-bottom-right-radius:4px}.message.bot{align-self:flex-start;background:#f3ece3;color:#40362e;border-bottom-left-radius:4px}.message.system{align-self:center;max-width:100%;background:#fff5df;color:#6c5737;border:1px solid #ead6ad;text-align:center;font-size:11px}.message.loading{color:#796a5d;font-style:italic}
    .answer-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:7px}.target{font-weight:800;color:#392f28}.confidence{padding:3px 6px;border-radius:999px;background:#e2d6c8;color:#625447;font:800 8px/1 Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em}.answer-text{white-space:pre-wrap}.basis{margin-top:9px;border-top:1px solid #ddd0c2;padding-top:7px}.basis summary{cursor:pointer;font-weight:800;font-size:10px;color:#635448}.basis ul{margin:7px 0 0;padding-left:17px}.basis li{margin:5px 0;font-size:10px;line-height:1.4}.basis-status{font-weight:800;text-transform:uppercase;font-size:8px;color:#79685a}.follow{margin-top:8px;font-size:10px;color:#685a4e}
    .invite{margin-top:9px;padding:8px 9px;border-radius:10px;background:#fffaf3;border:1px solid #ddcfbf;font-size:10px;line-height:1.45;color:#625449}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.action,.candidate,.starter{border:1px solid #bda994;background:#fffaf3;color:#4b3c31;border-radius:999px;padding:7px 9px;font:800 9px/1.2 Arial,sans-serif;cursor:pointer}.action.primary{background:#6f8c62;color:#fff;border-color:#6f8c62}.action:hover,.candidate:hover,.starter:hover{filter:brightness(.97)}
    .starters{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.starter{font-weight:700;background:#fff}
    .form{border-top:1px solid #e3d8cc;padding:10px;background:#fff;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.input{resize:none;min-height:42px;max-height:112px;border:1px solid #cfc0b0;border-radius:12px;padding:9px 10px;font:12px/1.4 Arial,sans-serif;color:#3d342d;background:#fff}.send{height:42px;min-width:56px;border:0;border-radius:12px;background:#4a3b2f;color:#fff;font:800 10px Arial,sans-serif;cursor:pointer}.send:disabled{opacity:.5;cursor:default}
  `;
  root.appendChild(style);
}

function buildPanel(root) {
  if (root.getElementById('panel')) return root.getElementById('panel');
  injectDialogStyles(root);
  const mount = root.getElementById('mount');
  const panel = document.createElement('section');
  panel.id = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <header class="head"><div class="title"><span class="mini">K-3</span><div><strong id="title">K-3 Family Droid</strong><small id="subtitle"></small></div></div><button id="close" class="close" type="button">x</button></header>
    <div class="context"><i class="dot"></i><strong id="focusLabel"></strong> <span id="focusValue"></span></div>
    <div id="messages" class="messages" aria-live="polite"></div>
    <form id="form" class="form"><textarea id="input" class="input" rows="2" maxlength="2500"></textarea><button id="send" class="send" type="submit"></button></form>`;
  mount.appendChild(panel);

  panel.querySelector('#close')?.addEventListener('click', () => setOpen(false));
  panel.querySelector('#form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = panel.querySelector('#input');
    const question = input?.value.trim();
    if (!question) return;
    input.value = '';
    void ask(question);
  });
  panel.querySelector('#input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      panel.querySelector('#form')?.requestSubmit();
    }
  });
  document.getElementById('centreSelect')?.addEventListener('change', updateContext);
  document.addEventListener('genealogy:language-changed', refreshStaticCopy);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panelRef?.classList.contains('open')) setOpen(false);
  });

  panelRef = panel;
  refreshStaticCopy();
  addIntro();
  return panel;
}

function refreshStaticCopy() {
  if (!panelRef) return;
  panelRef.setAttribute('aria-label', t('K-3 family archive assistant', 'K-3 familieargief-assistent'));
  panelRef.querySelector('#title').textContent = t('K-3 Family Droid', 'K-3 Familiedroid');
  panelRef.querySelector('#subtitle').textContent = t('Ask what the archive knows', 'Vra wat die argief weet');
  panelRef.querySelector('#close').setAttribute('aria-label', t('Close K-3', 'Maak K-3 toe'));
  panelRef.querySelector('#focusLabel').textContent = t('Current focus:', 'Huidige fokus:');
  panelRef.querySelector('#input').placeholder = t('Ask about someone in the family archive...', 'Vra oor iemand in die familie-argief...');
  panelRef.querySelector('#send').textContent = t('Send', 'Stuur');
  updateContext();
}

function addIntro() {
  const host = panelRef?.querySelector('#messages');
  if (!host || host.children.length) return;
  const node = document.createElement('div');
  node.className = 'message bot';
  node.append(document.createTextNode(t(
    'Ask me about a person, family story or unresolved question. I answer from the archive we have already built. If you remember something different, you can pass that memory straight into the family contribution form.',
    'Vra my oor n persoon, familieverhaal of onopgeloste vraag. Ek antwoord uit die argief wat ons reeds opgebou het. As jy iets anders onthou, kan jy daardie herinnering direk na die familiebydraevorm stuur.'
  )));
  const starters = document.createElement('div');
  starters.className = 'starters';
  const options = [
    [t('What do we know?', 'Wat weet ons?'), t('What do we know about this person?', 'Wat weet ons van hierdie persoon?')],
    [t('What is uncertain?', 'Wat is onseker?'), t('What is uncertain about this person in the archive?', 'Wat is onseker oor hierdie persoon in die argief?')],
    [t('What evidence do we have?', 'Watter bewyse het ons?'), t('What is the strongest evidence we have for this person and their main relationships?', 'Wat is die sterkste bewysmateriaal wat ons vir hierdie persoon en hul hoofverhoudings het?')],
  ];
  for (const [label, question] of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'starter';
    button.textContent = label;
    button.addEventListener('click', () => void ask(question));
    starters.appendChild(button);
  }
  node.appendChild(starters);
  host.appendChild(node);
}

function setOpen(open) {
  if (!panelRef || !launcherRef) return;
  panelRef.classList.toggle('open', open);
  panelRef.setAttribute('aria-hidden', String(!open));
  launcherRef.setAttribute('aria-expanded', String(open));
  if (open) {
    updateContext();
    window.setTimeout(() => panelRef?.querySelector('#input')?.focus(), 30);
  }
}

function updateContext() {
  const span = panelRef?.querySelector('#focusValue');
  if (!span) return;
  span.textContent = selectedPersonLabel() || t('No person selected - name someone in your question', 'Geen persoon gekies nie - noem iemand in jou vraag');
}

function scrollMessages() {
  const host = panelRef?.querySelector('#messages');
  if (host) host.scrollTop = host.scrollHeight;
}

function addMessage(kind, text) {
  const host = panelRef?.querySelector('#messages');
  if (!host) return null;
  const node = document.createElement('div');
  node.className = `message ${kind}`;
  node.textContent = text;
  host.appendChild(node);
  scrollMessages();
  return node;
}

function setBusy(value) {
  busy = value;
  const send = panelRef?.querySelector('#send');
  const input = panelRef?.querySelector('#input');
  if (send) send.disabled = value;
  if (input) input.disabled = value;
}

function renderAmbiguity(data, question, lang) {
  const host = panelRef?.querySelector('#messages');
  if (!host) return;
  const card = document.createElement('div');
  card.className = 'message bot';
  card.append(document.createTextNode(data.message || qcopy(lang, 'Which person did you mean?', 'Watter persoon bedoel jy?')));
  const actions = document.createElement('div');
  actions.className = 'actions';
  for (const candidate of data.candidates || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'candidate';
    button.textContent = [candidate.name, candidate.years].filter(Boolean).join(' - ');
    button.addEventListener('click', () => void ask(question, candidate.id, true, lang));
    actions.appendChild(button);
  }
  card.appendChild(actions);
  host.appendChild(card);
  scrollMessages();
}

function uncertainAnswer(answer) {
  return answer?.status !== 'answered' || ['hypothesis', 'unresolved', 'mixed'].includes(answer?.confidence);
}

function renderAnswer(data, question, lang) {
  const host = panelRef?.querySelector('#messages');
  if (!host) return;
  currentTargetId = data.target?.id || '';
  currentTargetName = data.target?.name || '';
  currentQuestion = question;
  currentQuestionLanguage = lang;
  currentResearchQuestion = data.answer?.research_question || '';

  const card = document.createElement('div');
  card.className = 'message bot';
  const head = document.createElement('div');
  head.className = 'answer-head';
  const target = document.createElement('span');
  target.className = 'target';
  target.textContent = currentTargetName || 'K-3';
  head.appendChild(target);
  if (data.answer?.confidence) {
    const badge = document.createElement('span');
    badge.className = 'confidence';
    badge.textContent = confidenceLabel(data.answer.confidence, lang);
    head.appendChild(badge);
  }
  card.appendChild(head);

  const text = document.createElement('div');
  text.className = 'answer-text';
  text.textContent = data.answer?.answer || '';
  card.appendChild(text);

  const basis = Array.isArray(data.answer?.basis) ? data.answer.basis : [];
  if (basis.length) {
    const details = document.createElement('details');
    details.className = 'basis';
    const summary = document.createElement('summary');
    summary.textContent = qcopy(lang, 'Why K-3 says this', 'Waarom K-3 dit se');
    details.appendChild(summary);
    const list = document.createElement('ul');
    for (const item of basis) {
      const li = document.createElement('li');
      const status = document.createElement('span');
      status.className = 'basis-status';
      status.textContent = `${item.status || 'archive'}: `;
      li.append(status, document.createTextNode(`${item.label || ''}${item.detail ? ` - ${item.detail}` : ''}`));
      list.appendChild(li);
    }
    details.appendChild(list);
    card.appendChild(details);
  }

  if (data.answer?.follow_up) {
    const follow = document.createElement('div');
    follow.className = 'follow';
    follow.textContent = data.answer.follow_up;
    card.appendChild(follow);
  }

  if (currentTargetId) {
    const invite = document.createElement('div');
    invite.className = 'invite';
    invite.textContent = uncertainAnswer(data.answer)
      ? qcopy(lang,
          'Have you heard something that might help? A family memory is not proof, but it can give us names, places, dates and new leads.',
          'Het jy iets gehoor wat dalk kan help? n Familieherinnering is nie bewys nie, maar dit kan vir ons name, plekke, datums en nuwe leidrade gee.')
      : qcopy(lang,
          'Do you remember anything else about this person? Family recollections can add the human story and sometimes reveal new research leads.',
          'Onthou jy enigiets anders oor hierdie persoon? Familieherinneringe kan die menslike verhaal aanvul en soms nuwe navorsingsleidrade oplewer.');
    card.appendChild(invite);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const share = document.createElement('button');
    share.type = 'button';
    share.className = `action${uncertainAnswer(data.answer) ? ' primary' : ''}`;
    share.textContent = qcopy(lang, 'Share what you know', 'Deel wat jy weet');
    share.addEventListener('click', () => void handoffToContribution());
    actions.appendChild(share);

    if (data.answer?.offer_research && currentResearchQuestion) {
      const research = document.createElement('button');
      research.type = 'button';
      research.className = `action${uncertainAnswer(data.answer) ? '' : ' primary'}`;
      research.textContent = qcopy(lang, 'Research this question', 'Navors hierdie vraag');
      research.addEventListener('click', () => void handoffToResearch());
      actions.appendChild(research);
    }
    card.appendChild(actions);
  }

  host.appendChild(card);
  scrollMessages();
}

async function ask(question, personId = '', silentUser = false, forcedLanguage = '') {
  if (busy || !question) return;
  const lang = forcedLanguage || detectQuestionLanguage(question);
  setOpen(true);
  if (!silentUser) {
    addMessage('user', question);
    history.push({ role: 'user', text: question });
  }
  setBusy(true);
  const loading = addMessage('bot loading', qcopy(lang, 'K-3 is checking the archive...', 'K-3 kyk deur die argief...'));
  try {
    const { data, error } = await supabase.functions.invoke('genealogy-family-bot-v2', {
      body: {
        question,
        language: lang,
        person_id: personId || undefined,
        selected_person_id: selectedPersonId() || undefined,
        conversation: history.slice(-6),
      },
    });
    loading?.remove();
    if (error) {
      let message = error.message || qcopy(lang, 'K-3 could not reach the archive.', 'K-3 kon nie die argief bereik nie.');
      if (error.context) {
        try {
          const payload = await error.context.json();
          if (payload?.error) message = payload.error;
        } catch { /* ignore malformed edge error */ }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    if (data?.status === 'ambiguous_person') {
      renderAmbiguity(data, question, lang);
      return;
    }
    if (data?.status === 'needs_person' || data?.status === 'privacy_limited') {
      addMessage('bot', data.message || qcopy(lang, 'I need a little more context.', 'Ek het nog n bietjie konteks nodig.'));
      return;
    }
    if (data?.status === 'answered') {
      renderAnswer(data, question, lang);
      history.push({ role: 'assistant', text: data.answer?.answer || '' });
      return;
    }
    addMessage('bot', qcopy(lang, 'I could not turn that into an archive answer yet. Try naming the person more specifically.', 'Ek kon dit nog nie in n argiefantwoord omskep nie. Noem die persoon meer spesifiek.'));
  } catch (error) {
    loading?.remove();
    addMessage('system', error?.message || qcopy(lang, 'K-3 could not answer right now.', 'K-3 kon nie nou antwoord nie.'));
  } finally {
    setBusy(false);
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitFor(selector, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    const node = document.querySelector(selector);
    if (node) return node;
    await wait(80);
  }
  return null;
}

function focusTargetInTree() {
  const centre = document.getElementById('centreSelect');
  if (!centre || !currentTargetId) return;
  if ([...centre.options].some((option) => option.value === currentTargetId)) {
    centre.value = currentTargetId;
    centre.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function contributionTemplate() {
  if (currentQuestionLanguage === 'af') {
    return `Oor ${currentTargetName || 'hierdie persoon'}\nDie vraag waaraan ek gedink het: ${currentQuestion}\n\nWat ek onthou of gehoor het:\n\nWie het dit vir my vertel / waar kom dit vandaan (indien bekend):\n\nName, plekke of datums wat ek onthou:\n`;
  }
  return `About ${currentTargetName || 'this person'}\nThe question I was thinking about: ${currentQuestion}\n\nWhat I remember or was told:\n\nWho told me / where this came from (if known):\n\nNames, places or dates I remember:\n`;
}

async function handoffToContribution() {
  if (!currentTargetId) return;
  focusTargetInTree();
  const workbench = await waitFor('#contributionWorkbench');
  if (workbench && 'open' in workbench) workbench.open = true;
  const shareTab = await waitFor('#contributionModeTabs [data-mode="share"]');
  shareTab?.click();

  const story = await waitFor('input[name="contributionCategory"][value="story"]', 25);
  if (story && !story.checked) {
    story.checked = true;
    story.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const legacyType = document.getElementById('contributionType');
  if (legacyType) {
    legacyType.value = 'story';
    legacyType.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const language = document.getElementById('contributionLanguageSelect') || document.getElementById('language');
  if (language) {
    language.value = currentQuestionLanguage;
    language.dataset.touched = '1';
    language.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const textarea = await waitFor('#contributionText');
  if (textarea) {
    const template = contributionTemplate();
    if (!textarea.value.trim() || textarea.dataset.k3Prefill === '1') {
      textarea.value = template;
      textarea.dataset.k3Prefill = '1';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  setOpen(false);
  workbench?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => textarea?.focus(), 500);
}

async function handoffToResearch() {
  if (!currentTargetId || !currentResearchQuestion) return;
  focusTargetInTree();
  const workbench = await waitFor('#contributionWorkbench');
  if (workbench && 'open' in workbench) workbench.open = true;
  const assistTab = await waitFor('#contributionModeTabs [data-mode="assist"]');
  assistTab?.click();
  const textarea = await waitFor('#researchAssistantQuestion');
  if (!textarea) {
    addMessage('system', qcopy(currentQuestionLanguage, 'I could not open the research assistant automatically. The research question is still in this conversation.', 'Ek kon nie die navorsingsassistent outomaties oopmaak nie. Die navorsingsvraag is steeds in hierdie gesprek.'));
    return;
  }
  textarea.value = currentResearchQuestion;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  setOpen(false);
  workbench?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => textarea.focus(), 500);
}

export async function openFamilyBot({ root, launcher }) {
  rootRef = root;
  launcherRef = launcher;
  panelRef = buildPanel(rootRef);
  const loaderStatus = rootRef.getElementById('loaderStatus');
  if (loaderStatus) loaderStatus.hidden = true;
  setOpen(!panelRef.classList.contains('open'));
}
