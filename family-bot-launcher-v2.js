const APP = document.getElementById('appArea');
const HOST_ID = 'familyBotV2Host';
let loading = false;

function af() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}
function t(en, afText) { return af() ? afText : en; }

function launcherMarkup() {
  return `
    <style>
      :host{font-family:Arial,sans-serif}
      *{box-sizing:border-box}
      #launcher{width:58px;height:58px;border-radius:50%;border:1px solid #8c7967;background:#4a3b2f;color:#fff;box-shadow:0 12px 28px rgba(47,37,29,.22);display:grid;place-items:center;cursor:pointer;padding:0;transition:transform .16s ease,box-shadow .16s ease}
      #launcher:hover{transform:translateY(-1px);box-shadow:0 15px 32px rgba(47,37,29,.28)}
      #launcher:focus-visible{outline:3px solid #d7b28f;outline-offset:3px}
      #launcher[disabled]{opacity:.65;cursor:wait;transform:none}
      .droid{position:relative;width:32px;height:36px;display:block}
      .head{position:absolute;left:5px;top:1px;width:22px;height:14px;border:2px solid currentColor;border-radius:9px 9px 5px 5px}
      .head:before,.head:after{content:"";position:absolute;top:4px;width:4px;height:4px;border-radius:50%;background:currentColor}
      .head:before{left:4px}.head:after{right:4px}
      .neck{position:absolute;left:14px;top:18px;width:4px;height:4px;background:currentColor}
      .body{position:absolute;left:6px;top:22px;width:20px;height:11px;border:2px solid currentColor;border-radius:5px}
      .body:after{content:"K3";position:absolute;inset:0;display:grid;place-items:center;font:800 6px/1 Arial,sans-serif;letter-spacing:.04em}
      .foot{position:absolute;left:10px;top:35px;width:12px;border-top:2px solid currentColor}
      #loaderStatus{position:absolute;left:0;bottom:68px;width:270px;padding:9px 10px;border:1px solid #d6c7b7;border-radius:10px;background:#fffaf3;color:#5b4c40;box-shadow:0 10px 30px rgba(47,37,29,.18);font:11px/1.4 Arial,sans-serif}
      @media(max-width:600px){#launcher{width:54px;height:54px}}
      @media(prefers-reduced-motion:reduce){#launcher{transition:none}#launcher:hover{transform:none}}
    </style>
    <div id="panelMount"></div>
    <div id="loaderStatus" hidden></div>
    <button id="launcher" type="button" aria-expanded="false">
      <span class="droid" aria-hidden="true"><i class="head"></i><i class="neck"></i><i class="body"></i><i class="foot"></i></span>
    </button>`;
}

function updateCopy(root) {
  const button = root?.getElementById('launcher');
  if (!button) return;
  const label = t('Ask K-3 about the family archive', 'Vra K-3 oor die familie-argief');
  button.setAttribute('aria-label', label);
  button.title = label;
}

async function openBot(host, root) {
  if (loading) return;
  loading = true;
  const button = root.getElementById('launcher');
  if (button) button.disabled = true;
  try {
    const module = await import('./family-bot-conversation-v2.js?v=2');
    if (typeof module.openFamilyBot !== 'function') throw new Error('K-3 conversation module did not initialise');
    await module.openFamilyBot({ host, root, launcher: button });
    const status = root.getElementById('loaderStatus');
    if (status) status.hidden = true;
  } catch (error) {
    console.error('K-3 failed to open', error);
    const status = root.getElementById('loaderStatus');
    if (status) {
      status.hidden = false;
      status.textContent = t('K-3 could not open just now. The family tree is still safe to use.', 'K-3 kon nie nou oopmaak nie. Die familieboom is steeds veilig om te gebruik.');
    }
  } finally {
    loading = false;
    if (button) button.disabled = false;
  }
}

function installLauncher() {
  if (!APP || APP.classList.contains('hidden')) return;
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.hidden = false;
    updateCopy(existing.shadowRoot);
    return;
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.dataset.familyBot = 'v2';
  host.style.position = 'fixed';
  host.style.left = window.matchMedia('(max-width:600px)').matches ? '12px' : '18px';
  host.style.bottom = window.matchMedia('(max-width:600px)').matches ? '12px' : '18px';
  host.style.zIndex = '1200';
  host.style.width = window.matchMedia('(max-width:600px)').matches ? '54px' : '58px';
  host.style.height = window.matchMedia('(max-width:600px)').matches ? '54px' : '58px';

  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = launcherMarkup();
  updateCopy(root);
  root.getElementById('launcher')?.addEventListener('click', () => openBot(host, root));
  document.body.appendChild(host);
}

function hideLauncher() {
  const host = document.getElementById(HOST_ID);
  if (host) host.hidden = true;
}

document.addEventListener('genealogy:archive-ready', installLauncher, { once: true });
document.addEventListener('genealogy:language-changed', () => {
  const host = document.getElementById(HOST_ID);
  if (host?.shadowRoot) updateCopy(host.shadowRoot);
});
document.getElementById('signOut')?.addEventListener('click', hideLauncher);
window.addEventListener('load', () => window.setTimeout(installLauncher, 700));
window.setTimeout(installLauncher, 1400);
if (APP && !APP.classList.contains('hidden')) installLauncher();
