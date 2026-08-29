const topActions = document.querySelector('.top-actions');
const signOut = document.getElementById('signOut');

function currentLanguage() {
  return document.documentElement.lang === 'af' ? 'af' : 'en';
}

const copy = {
  en: {
    button: 'Share',
    kicker: 'Invite family',
    title: 'Share the family archive',
    intro: 'Send this link to relatives you would like to invite. They can register, verify their email and request family access before adding their own details, dates, stories and records.',
    label: 'Family archive link',
    copy: 'Copy link',
    copied: 'Copied',
    native: 'Share link',
    close: 'Close',
    shareTitle: 'Our Family History',
    shareText: 'Join our shared family history archive.',
    access: 'Sharing the link does not bypass family access approval.',
  },
  af: {
    button: 'Deel',
    kicker: 'Nooi familie',
    title: 'Deel die familie-argief',
    intro: 'Stuur hierdie skakel aan familielede wat jy wil nooi. Hulle kan registreer, hul e-pos verifieer en familietoegang versoek voordat hulle hul eie besonderhede, datums, stories en rekords byvoeg.',
    label: 'Skakel na familie-argief',
    copy: 'Kopieer skakel',
    copied: 'Gekopieer',
    native: 'Deel skakel',
    close: 'Sluit',
    shareTitle: 'Ons Familiegeskiedenis',
    shareText: 'Sluit aan by ons gedeelde familiegeskiedenis-argief.',
    access: 'Die deel van die skakel omseil nie goedkeuring vir familietoegang nie.',
  },
};

function shareUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

function installStyles() {
  if (document.getElementById('familyShareStyles')) return;
  const style = document.createElement('style');
  style.id = 'familyShareStyles';
  style.textContent = `
    .family-share-backdrop{position:fixed;inset:0;z-index:10040;display:grid;place-items:center;padding:20px;background:rgba(44,36,30,.42);backdrop-filter:blur(2px)}
    .family-share-backdrop.hidden{display:none}
    .family-share-dialog{width:min(560px,calc(100vw - 32px));border:1px solid #d9cabc;border-radius:18px;background:#fffdf9;box-shadow:0 24px 70px rgba(43,31,23,.26);color:#3f342b;overflow:hidden}
    .family-share-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:19px 20px 13px;border-bottom:1px solid #eadfd4}
    .family-share-kicker{margin:0 0 4px;color:#7f7165;font:800 9px/1.1 Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase}
    .family-share-head h2{margin:0;font-size:22px;line-height:1.15}
    .family-share-x{border:0;background:#f0e6da;color:#5f5146;border-radius:999px;width:32px;height:32px;font:800 16px/1 Arial,sans-serif;cursor:pointer}
    .family-share-body{display:grid;gap:13px;padding:18px 20px 20px}
    .family-share-body p{margin:0;line-height:1.48;color:#665a50}
    .family-share-field{display:grid;gap:6px;font-size:12px;font-weight:700;color:#55483d}
    .family-share-link-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
    .family-share-link-row input{min-width:0;width:100%;box-sizing:border-box;border:1px solid rgba(93,72,53,.28);border-radius:10px;padding:10px 11px;background:#fff;color:#3f342b}
    .family-share-actions{display:flex;gap:8px;flex-wrap:wrap}
    .family-share-access{padding:9px 10px;border-radius:10px;background:#f4eee6;font-size:11px!important;color:#74675b!important}
    @media(max-width:560px){.family-share-link-row{grid-template-columns:1fr}.family-share-link-row .button{width:100%}.family-share-actions .button{flex:1 1 140px}}
    @media print{#shareFamilyButton,.family-share-backdrop{display:none!important}}
  `;
  document.head.appendChild(style);
}

function installShare() {
  if (!topActions || document.getElementById('shareFamilyButton')) return;
  installStyles();

  const button = document.createElement('button');
  button.id = 'shareFamilyButton';
  button.className = 'button ghost';
  button.type = 'button';
  topActions.insertBefore(button, signOut || null);

  const backdrop = document.createElement('div');
  backdrop.id = 'familyShareBackdrop';
  backdrop.className = 'family-share-backdrop hidden';
  backdrop.innerHTML = `
    <section class="family-share-dialog" role="dialog" aria-modal="true" aria-labelledby="familyShareTitle">
      <header class="family-share-head">
        <div><p class="family-share-kicker" data-share-copy="kicker"></p><h2 id="familyShareTitle" data-share-copy="title"></h2></div>
        <button class="family-share-x" type="button" aria-label="Close">x</button>
      </header>
      <div class="family-share-body">
        <p data-share-copy="intro"></p>
        <label class="family-share-field"><span data-share-copy="label"></span><div class="family-share-link-row"><input id="familyShareUrl" type="text" readonly /><button id="copyFamilyShareLink" class="button secondary" type="button"></button></div></label>
        <div class="family-share-actions"><button id="nativeFamilyShare" class="button primary" type="button"></button><button id="closeFamilyShare" class="button ghost" type="button"></button></div>
        <p class="family-share-access" data-share-copy="access"></p>
      </div>
    </section>`;
  document.body.appendChild(backdrop);

  const urlInput = document.getElementById('familyShareUrl');
  const copyButton = document.getElementById('copyFamilyShareLink');
  const nativeButton = document.getElementById('nativeFamilyShare');

  function localise() {
    const t = copy[currentLanguage()];
    button.textContent = t.button;
    backdrop.querySelectorAll('[data-share-copy]').forEach((node) => { node.textContent = t[node.dataset.shareCopy] || ''; });
    backdrop.querySelector('.family-share-x').setAttribute('aria-label', t.close);
    copyButton.textContent = t.copy;
    nativeButton.textContent = t.native;
    document.getElementById('closeFamilyShare').textContent = t.close;
  }

  function close() {
    backdrop.classList.add('hidden');
    button.focus();
  }

  button.addEventListener('click', () => {
    localise();
    urlInput.value = shareUrl();
    backdrop.classList.remove('hidden');
    copyButton.focus();
  });
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector('.family-share-x').addEventListener('click', close);
  document.getElementById('closeFamilyShare').addEventListener('click', close);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !backdrop.classList.contains('hidden')) close(); });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(urlInput.value);
    } catch {
      urlInput.focus();
      urlInput.select();
      document.execCommand('copy');
    }
    const t = copy[currentLanguage()];
    copyButton.textContent = t.copied;
    window.setTimeout(() => { copyButton.textContent = copy[currentLanguage()].copy; }, 1400);
  });

  if (!navigator.share) nativeButton.classList.add('hidden');
  nativeButton.addEventListener('click', async () => {
    const t = copy[currentLanguage()];
    if (!navigator.share) return;
    try {
      await navigator.share({ title: t.shareTitle, text: t.shareText, url: urlInput.value || shareUrl() });
    } catch (error) {
      if (error?.name !== 'AbortError') copyButton.click();
    }
  });

  const langObserver = new MutationObserver(localise);
  langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  localise();
}

installShare();
