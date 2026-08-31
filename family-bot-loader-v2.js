const HOST_ID = 'familyBotHostV2';
const DESKTOP = window.matchMedia('(min-width: 900px)');

function isAfrikaans() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}

function t(en, af) {
  return isAfrikaans() ? af : en;
}

function appVisible() {
  const appArea = document.getElementById('appArea');
  return Boolean(appArea && !appArea.classList.contains('hidden') && DESKTOP.matches);
}

function updateLauncherCopy(root) {
  const button = root?.getElementById('launcher');
  if (!button) return;
  button.setAttribute('aria-label', t('Ask K-3 about the family archive', 'Vra K-3 oor die familie-argief'));
  button.title = t('Ask K-3 about the family archive', 'Vra K-3 oor die familie-argief');
}

async function openBot(host, root, launcher) {
  if (launcher.dataset.loading === '1') return;
  launcher.dataset.loading = '1';
  launcher.disabled = true;
  try {
    const module = await import('./family-bot-dialog-v2.js?v=1');
    await module.openFamilyBot({ host, root, launcher });
  } catch (error) {
    const status = root.getElementById('loaderStatus');
    if (status) {
      status.hidden = false;
      status.textContent = t('K-3 could not open. The family tree is still available.', 'K-3 kon nie oopmaak nie. Die familieboom is steeds beskikbaar.');
    }
    console.error('K-3 lazy-load failed', error);
  } finally {
    launcher.disabled = false;
    delete launcher.dataset.loading;
  }
}

function ensureHost() {
  if (!appVisible()) return null;
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.hidden = false;
    updateLauncherCopy(existing.shadowRoot);
    return existing;
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.dataset.familyBot = 'v2';
  host.style.position = 'fixed';
  host.style.left = '18px';
  host.style.bottom = '18px';
  host.style.zIndex = '1200';
  host.style.width = '62px';
  host.style.height = '62px';
  host.style.contain = 'layout style';
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{font-family:Arial,sans-serif}
      *{box-sizing:border-box}
      #launcher{width:62px;height:62px;border-radius:50%;border:1px solid #8c7967;background:#4a3b2f;color:#fff;box-shadow:0 12px 28px rgba(47,37,29,.22);display:grid;place-items:center;cursor:pointer;padding:0;transition:transform .16s ease,box-shadow .16s ease}
      #launcher:hover{transform:translateY(-2px);box-shadow:0 15px 32px rgba(47,37,29,.28)}
      #launcher:focus-visible{outline:3px solid #d7b28f;outline-offset:3px}
      #launcher:disabled{opacity:.72;cursor:progress}
      .droid{position:relative;width:34px;height:38px;display:block}
      .head{position:absolute;left:5px;top:2px;width:24px;height:15px;border:2px solid #fff;border-radius:9px 9px 5px 5px}
      .head:before,.head:after{content:"";position:absolute;top:5px;width:4px;height:4px;border-radius:50%;background:#fff}
      .head:before{left:5px}.head:after{right:5px}
      .neck{position:absolute;left:15px;top:18px;width:4px;height:4px;background:#fff}
      .body{position:absolute;left:7px;top:22px;width:20px;height:12px;border:2px solid #fff;border-radius:5px}
      .body:after{content:"K3";position:absolute;inset:0;display:grid;place-items:center;font:800 6px/1 Arial,sans-serif;letter-spacing:.04em}
      .foot{position:absolute;left:11px;top:35px;width:12px;border-top:2px solid #fff}
      #loaderStatus{position:absolute;left:0;bottom:74px;width:260px;padding:9px 10px;border:1px solid #d6c7b7;border-radius:10px;background:#fffaf3;color:#5b4c40;box-shadow:0 10px 30px rgba(47,37,29,.18);font:11px/1.4 Arial,sans-serif}
      @media(prefers-reduced-motion:reduce){#launcher{transition:none}}
    </style>
    <div id="mount"></div>
    <div id="loaderStatus" hidden></div>
    <button id="launcher" type="button" aria-expanded="false">
      <span class="droid" aria-hidden="true"><i class="head"></i><i class="neck"></i><i class="body"></i><i class="foot"></i></span>
    </button>`;

  const launcher = root.getElementById('launcher');
  updateLauncherCopy(root);
  launcher.addEventListener('click', () => openBot(host, root, launcher));

  return host;
}

function syncVisibility() {
  const host = document.getElementById(HOST_ID);
  if (appVisible()) ensureHost();
  else if (host) host.hidden = true;
}

function scheduleStart(delay = 0) {
  window.setTimeout(syncVisibility, delay);
}

document.addEventListener('genealogy:archive-ready', () => scheduleStart(250));
document.addEventListener('genealogy:language-changed', () => {
  const host = document.getElementById(HOST_ID);
  if (host?.shadowRoot) updateLauncherCopy(host.shadowRoot);
});
DESKTOP.addEventListener?.('change', syncVisibility);
window.addEventListener('load', () => scheduleStart(900));
document.getElementById('signOut')?.addEventListener('click', () => {
  const host = document.getElementById(HOST_ID);
  if (host) host.hidden = true;
});

scheduleStart(1400);
