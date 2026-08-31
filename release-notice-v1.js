import { supabase } from './supabase-client-v1.js';

const RELEASE_ID = '2026-08-31-k3-bilingual-family-droid';
const PREVIOUS_RELEASE_IDS = ['2026-08-29-map-place-pins'];
const STORAGE_PREFIX = `genealogyReleaseNotice:${RELEASE_ID}`;
let currentUserId = '';

function af(){return (window.GenealogyI18n?.language||document.documentElement.lang||'en')==='af';}
function t(en,afr){return af()?afr:en;}
function storageKey(userId = currentUserId) { return `${STORAGE_PREFIX}:${userId || 'unknown'}`; }
function previousStorageKey(releaseId,userId=currentUserId){return `genealogyReleaseNotice:${releaseId}:${userId||'unknown'}`;}

function installStyles() {
  if (document.getElementById('releaseNoticeStyles')) return;
  const style = document.createElement('style');
  style.id = 'releaseNoticeStyles';
  style.textContent = `
    .release-notice-backdrop{position:fixed;inset:0;z-index:190;display:grid;place-items:center;padding:18px;background:rgba(34,28,23,.48);backdrop-filter:blur(3px)}
    .release-notice-card{width:min(590px,100%);max-height:calc(100dvh - 36px);overflow:auto;padding:22px;border:1px solid #d7ccbf;border-radius:20px;background:#fffdf8;color:#211d18;box-shadow:0 24px 70px rgba(35,27,21,.28)}
    .release-notice-card h2{margin:0 0 10px;font-size:1.55rem}.release-notice-card p{margin:0 0 11px;font:.94rem/1.55 Arial,sans-serif;color:#51483f}
    .release-notice-card ul{margin:0 0 16px;padding-left:21px;font:.9rem/1.5 Arial,sans-serif;color:#51483f}.release-notice-card li+li{margin-top:7px}
    .release-notice-actions{display:flex;justify-content:flex-end;margin-top:16px}.release-notice-actions .button{min-width:120px}
    .whats-new-button{white-space:nowrap}
    @media(max-width:600px){.release-notice-card{padding:19px 17px}.release-notice-card h2{font-size:1.35rem}.release-notice-card p,.release-notice-card ul{font-size:1rem}.release-notice-actions .button{width:100%}}
  `;
  document.head.appendChild(style);
}

function closeNotice(markSeen = true) {
  document.getElementById('releaseNoticeBackdrop')?.remove();
  if (markSeen) {
    const dismissedAt = new Date().toISOString();
    try { localStorage.setItem(storageKey(), dismissedAt); } catch { /* storage is best effort */ }
    if (currentUserId) void supabase.from('app_release_acknowledgements').upsert({ user_id: currentUserId, release_id: RELEASE_ID, dismissed_at: dismissedAt }, { onConflict: 'user_id,release_id' });
  }
}

function showNotice() {
  if (document.getElementById('releaseNoticeBackdrop')) return;
  installStyles();
  const backdrop = document.createElement('div');
  backdrop.id = 'releaseNoticeBackdrop';
  backdrop.className = 'release-notice-backdrop';
  backdrop.innerHTML = `
    <section class="release-notice-card" role="dialog" aria-modal="true" aria-labelledby="releaseNoticeTitle">
      <p class="eyebrow">${t('Family archive update','Familieargief-opdatering')}</p>
      <h2 id="releaseNoticeTitle">${t('There is something new in the family archive','Daar is iets nuuts in die familieargief')}</h2>
      <p>${t('The latest release adds a new way to ask questions of the research we have already assembled, while keeping evidence and uncertainty visible.','Die jongste vrystelling voeg n nuwe manier by om vrae te vra oor die navorsing wat ons reeds saamgestel het, terwyl bewysmateriaal en onsekerheid sigbaar bly.')}</p>
      <ul>
        <li>${t('K-3 Family Droid now appears in the lower-left corner of the desktop family archive. Ask it what the archive currently knows about a person, relationship, story or hypothesis.','K-3 Familiedroid verskyn nou links onder in die rekenaarweergawe van die familieargief. Vra dit wat die argief tans oor n persoon, verhouding, verhaal of hipotese weet.')}</li>
        <li>${t('K-3 answers from our recorded people, claims, evidence, sources and research frontier. It does not quietly turn a family story or hypothesis into a fact.','K-3 antwoord uit ons aangetekende persone, bewerings, bewysmateriaal, bronne en navorsingsgrens. Dit verander nie stilweg n familieverhaal of hipotese in n feit nie.')}</li>
        <li>${t('Open "Why K-3 says this" beneath an answer to see the archive basis. If the archive has not tested a question, K-3 can hand a sharpened version of it to the existing research assistant. Web research still requires explicit confirmation.','Maak "Waarom K-3 dit se" onder n antwoord oop om die argiefgrondslag te sien. As die argief n vraag nog nie getoets het nie, kan K-3 n skerper weergawe daarvan aan die bestaande navorsingsassistent oordra. Webnavorsing vereis steeds uitdruklike bevestiging.')}</li>
        <li>${t('K-3 now works in both English and Afrikaans. It follows the language of the question where that is clear, and otherwise follows the language selected for the family archive.','K-3 werk nou in beide Engels en Afrikaans. Dit volg die taal van die vraag waar dit duidelik is, en andersins die taal wat vir die familieargief gekies is.')}</li>
        <li>${t('Find and Focus remains unchanged: use it to move quickly to a person. K-3 is a separate conversation layer over the archive, not a replacement for navigation.','Vind en fokus bly onveranderd: gebruik dit om vinnig na n persoon te beweeg. K-3 is n aparte gesprekslaag oor die argief en vervang nie die navigasie nie.')}</li>
      </ul>
      <p>${t('This notice is shown once for this release and account. After closing it, you can reopen it at any time from "What\'s new".','Hierdie kennisgewing word een keer vir hierdie vrystelling en rekening gewys. Nadat jy dit toegemaak het, kan jy dit enige tyd weer onder "Wat is nuut" oopmaak.')}</p>
      <div class="release-notice-actions"><button id="releaseNoticeClose" class="button primary" type="button">${t('Got it','Reg so')}</button></div>
    </section>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#releaseNoticeClose')?.addEventListener('click', () => closeNotice(true));
  backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNotice(true); });
  backdrop.querySelector('#releaseNoticeClose')?.focus();
}

function installWhatsNewButton() {
  const actions = document.querySelector('.top-actions');
  if (!actions) return;
  let button = document.getElementById('whatsNewButton');
  if (!button) {
    button = document.createElement('button');
    button.id = 'whatsNewButton';
    button.className = 'button ghost whats-new-button hidden';
    button.type = 'button';
    button.addEventListener('click', showNotice);
    actions.prepend(button);
  }
  button.textContent = t("What's new",'Wat is nuut');
}

async function archiveReady() {
  installWhatsNewButton();
  document.getElementById('whatsNewButton')?.classList.remove('hidden');
  const { data:{ session } } = await supabase.auth.getSession();
  currentUserId = session?.user?.id || '';
  if (!currentUserId) return;

  // A newer release notice supersedes the older one on this browser so a family
  // member never receives two stacked update dialogs after a long absence.
  const supersededAt = new Date().toISOString();
  for (const releaseId of PREVIOUS_RELEASE_IDS) {
    try { localStorage.setItem(previousStorageKey(releaseId), supersededAt); } catch { /* best effort */ }
  }

  let seen = false;
  try { seen = Boolean(localStorage.getItem(storageKey())); } catch { /* fall through to account record */ }
  if (!seen) {
    const { data } = await supabase.from('app_release_acknowledgements').select('release_id').eq('user_id', currentUserId).eq('release_id', RELEASE_ID).maybeSingle();
    seen = Boolean(data);
    if (seen) try { localStorage.setItem(storageKey(), new Date().toISOString()); } catch { /* best effort */ }
  }
  if (!seen) window.setTimeout(showNotice, 180);
}

function refreshLanguage(){
  installWhatsNewButton();
  if(document.getElementById('releaseNoticeBackdrop')){closeNotice(false);showNotice();}
}

document.addEventListener('genealogy:archive-ready', archiveReady);
document.addEventListener('genealogy:language-changed', refreshLanguage);
installWhatsNewButton();
