import './access-session-v1.js?v=1';
import './editor-access-management-v1.js?v=1';
import { supabase } from './supabase-client-v1.js';

const RELEASE_ID = '2026-08-29-map-place-pins';
const STORAGE_PREFIX = `genealogyReleaseNotice:${RELEASE_ID}`;
let currentUserId = '';

function storageKey(userId = currentUserId) { return `${STORAGE_PREFIX}:${userId || 'unknown'}`; }

function installStyles() {
  if (document.getElementById('releaseNoticeStyles')) return;
  const style = document.createElement('style');
  style.id = 'releaseNoticeStyles';
  style.textContent = `
    .release-notice-backdrop{position:fixed;inset:0;z-index:190;display:grid;place-items:center;padding:18px;background:rgba(34,28,23,.48);backdrop-filter:blur(3px)}
    .release-notice-card{width:min(560px,100%);max-height:calc(100dvh - 36px);overflow:auto;padding:22px;border:1px solid #d7ccbf;border-radius:20px;background:#fffdf8;color:#211d18;box-shadow:0 24px 70px rgba(35,27,21,.28)}
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
      <p class="eyebrow">Family archive update</p>
      <h2 id="releaseNoticeTitle">The family archive has been updated</h2>
      <p>The map now shows clear, clickable pins over reviewed historical family locations.</p>
      <ul>
        <li>Click a pin to see who was connected to the place, what happened there, the date, the original place wording, location precision, evidence status, narrative and source reference.</li>
        <li>A numbered pin contains several events at the same mapped locality. Its colour follows the same dynamically calculated family branches as the family fan.</li>
        <li>Unresolved locations remain listed but unpinned rather than guessed. Movement lines appear only when the movement itself has been separately reviewed and evidenced.</li>
        <li>English or Afrikaans family voice notes, person-linked evidence, the birth or maiden surname standard and the conservative research assistant remain available.</li>
      </ul>
      <p>If anything looks wrong or stops working, please take a screenshot and send the family editor a WhatsApp voice note. Mention what you tapped and whose record you were viewing.</p>
      <p>Once you close this notice, it will not be shown again for this account. You can still open it from <strong>What's new</strong>.</p>
      <div class="release-notice-actions"><button id="releaseNoticeClose" class="button primary" type="button">Got it</button></div>
    </section>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#releaseNoticeClose')?.addEventListener('click', () => closeNotice(true));
  backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNotice(true); });
  backdrop.querySelector('#releaseNoticeClose')?.focus();
}

function installWhatsNewButton() {
  const actions = document.querySelector('.top-actions');
  if (!actions || document.getElementById('whatsNewButton')) return;
  const button = document.createElement('button');
  button.id = 'whatsNewButton';
  button.className = 'button ghost whats-new-button hidden';
  button.type = 'button';
  button.textContent = "What's new";
  button.addEventListener('click', showNotice);
  actions.prepend(button);
}

async function archiveReady() {
  installWhatsNewButton();
  document.getElementById('whatsNewButton')?.classList.remove('hidden');
  const { data:{ session } } = await supabase.auth.getSession();
  currentUserId = session?.user?.id || '';
  if (!currentUserId) return;
  let seen = false;
  try { seen = Boolean(localStorage.getItem(storageKey())); } catch { /* fall through to account record */ }
  if (!seen) {
    const { data } = await supabase.from('app_release_acknowledgements').select('release_id').eq('user_id', currentUserId).eq('release_id', RELEASE_ID).maybeSingle();
    seen = Boolean(data);
    if (seen) try { localStorage.setItem(storageKey(), new Date().toISOString()); } catch { /* best effort */ }
  }
  if (!seen) window.setTimeout(showNotice, 180);
}

document.addEventListener('genealogy:archive-ready', archiveReady);
installWhatsNewButton();
