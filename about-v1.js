const APP_VERSION = '1.2.0';
const UPDATED_AT = '29 August 2026 at 4:01 pm NZST';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function installStyles() {
  if (document.getElementById('aboutDialogStyles')) return;
  const style = document.createElement('style');
  style.id = 'aboutDialogStyles';
  style.textContent = `
    .about-overlay{position:fixed;inset:0;z-index:195;display:grid;place-items:center;padding:18px;background:rgba(34,28,23,.52);backdrop-filter:blur(3px)}
    .about-dialog{width:min(640px,100%);max-height:calc(100dvh - 36px);overflow:auto;padding:22px;border:1px solid #d7ccbf;border-radius:20px;background:#fffdf8;color:#211d18;box-shadow:0 24px 70px rgba(35,27,21,.3)}
    .about-dialog-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.about-dialog h2{margin:1px 0 4px;font-size:1.55rem}.about-version{margin:0;color:#76695e;font:.78rem/1.45 Arial,sans-serif}
    .about-section{margin-top:16px;padding-top:14px;border-top:1px solid #e3d9ce}.about-section h3{margin:0 0 6px;font-size:1rem}.about-section p{margin:0 0 8px;color:#51483f;font:.9rem/1.55 Arial,sans-serif}.about-section p:last-child{margin-bottom:0}
    .about-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.about-button{white-space:nowrap}.top-actions{flex-wrap:wrap;justify-content:flex-end}
    @media(max-width:600px){.about-dialog{padding:19px 17px}.about-dialog h2{font-size:1.35rem}.about-section p{font-size:1rem}.about-dialog-head{display:grid}.about-dialog-head .button{justify-self:end}.about-actions .button{width:100%}.topbar{flex-wrap:wrap}.top-actions{width:100%;justify-content:flex-start}}
  `;
  document.head.appendChild(style);
}

function closeAbout() {
  document.getElementById('aboutOverlay')?.remove();
}

function openPrivacyPolicy() {
  closeAbout();
  const policyButton = document.getElementById('openFamilyPolicy');
  if (policyButton) policyButton.click();
}

function showAbout() {
  if (document.getElementById('aboutOverlay')) return;
  installStyles();
  const overlay = document.createElement('div');
  overlay.id = 'aboutOverlay';
  overlay.className = 'about-overlay';
  overlay.innerHTML = `
    <section class="about-dialog" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
      <div class="about-dialog-head">
        <div><p class="eyebrow">Private family archive</p><h2 id="aboutTitle">About this app</h2><p class="about-version">Version ${esc(APP_VERSION)} | Last updated ${esc(UPDATED_AT)}</p></div>
        <button id="aboutClose" class="button ghost" type="button">Close</button>
      </div>
      <div class="about-section"><h3>Research and evidence</h3><p>This archive keeps documentary evidence, family recollection, inference and unresolved research separate. A record is displayed with its source and evidence status, but it is treated as proof only after the identity and the particular claim have been reviewed. Map pins represent reviewed event locations; a movement line appears only when the movement itself has been separately evidenced.</p></div>
      <div class="about-section"><h3>Conservative use of AI</h3><p>The research assistant uses AI to look for records and archival leads for deceased people. It is disabled when a person is living or the record does not establish that they are deceased, and identifying details for living or potentially living relatives are withheld from the AI research request. Results remain research leads until a person checks the original source. The assistant cannot change the canonical family tree by itself.</p></div>
      <div class="about-section"><h3>Privacy</h3><p>The database and uploaded evidence are limited to approved family access. We minimise information about living people and do not use the research assistant to investigate them. Some source documents remain more restricted than the ordinary family profile.</p></div>
      <div class="about-section"><h3>Acknowledgement</h3><p>FamilySearch has been instrumental in locating and viewing many of the civil, church, marriage, death and probate records that support this archive. Individual records retain their own repository, citation and link wherever that information is available. FamilySearch is an independent service and does not sponsor or operate this family archive.</p></div>
      <div class="about-actions"><button id="aboutPrivacy" class="button secondary" type="button">Read the privacy policy</button><button id="aboutDone" class="button primary" type="button">Done</button></div>
    </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#aboutClose')?.addEventListener('click', closeAbout);
  overlay.querySelector('#aboutDone')?.addEventListener('click', closeAbout);
  overlay.querySelector('#aboutPrivacy')?.addEventListener('click', openPrivacyPolicy);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeAbout(); });
  overlay.querySelector('#aboutClose')?.focus();
}

function installButton() {
  const actions = document.querySelector('.top-actions');
  const signOut = document.getElementById('signOut');
  if (!actions || document.getElementById('aboutButton')) return;
  const button = document.createElement('button');
  button.id = 'aboutButton';
  button.className = 'button ghost about-button';
  button.type = 'button';
  button.textContent = 'About';
  button.addEventListener('click', showAbout);
  if (signOut) actions.insertBefore(button, signOut);
  else actions.appendChild(button);
}

document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.getElementById('aboutOverlay')) closeAbout(); });
installButton();
window.GenealogyAbout = { show: showAbout, version: APP_VERSION, updatedAt: UPDATED_AT };
