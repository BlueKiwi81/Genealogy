const APP = document.getElementById('appArea');
let loading = false;

function installStyles() {
  if (document.getElementById('familyBotLauncherV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'familyBotLauncherV2Styles';
  style.textContent = `
    .family-bot-v2-launcher{position:fixed;left:18px;bottom:18px;z-index:1200;width:58px;height:58px;border-radius:50%;border:1px solid #8c7967;background:#4a3b2f;color:#fff;box-shadow:0 12px 28px rgba(47,37,29,.22);display:grid;place-items:center;cursor:pointer;padding:0}
    .family-bot-v2-launcher:hover{transform:translateY(-1px)}
    .family-bot-v2-launcher:focus-visible{outline:3px solid #d7b28f;outline-offset:3px}
    .family-bot-v2-launcher[disabled]{opacity:.65;cursor:wait;transform:none}
    .family-bot-v2-droid{position:relative;width:32px;height:36px}
    .family-bot-v2-head{position:absolute;left:5px;top:1px;width:22px;height:14px;border:2px solid currentColor;border-radius:9px 9px 5px 5px}
    .family-bot-v2-head:before,.family-bot-v2-head:after{content:"";position:absolute;top:4px;width:4px;height:4px;border-radius:50%;background:currentColor}
    .family-bot-v2-head:before{left:4px}.family-bot-v2-head:after{right:4px}
    .family-bot-v2-neck{position:absolute;left:14px;top:18px;width:4px;height:4px;background:currentColor}
    .family-bot-v2-body{position:absolute;left:6px;top:22px;width:20px;height:11px;border:2px solid currentColor;border-radius:5px}
    .family-bot-v2-body:after{content:"K3";position:absolute;inset:0;display:grid;place-items:center;font:800 6px/1 Arial,sans-serif;letter-spacing:.04em}
    .family-bot-v2-foot{position:absolute;left:10px;top:35px;width:12px;border-top:2px solid currentColor}
    @media(max-width:600px){.family-bot-v2-launcher{left:12px;bottom:12px;width:54px;height:54px}}
    @media(prefers-reduced-motion:reduce){.family-bot-v2-launcher:hover{transform:none}}
  `;
  document.head.appendChild(style);
}

async function openBot() {
  if (loading) return;
  loading = true;
  const button = document.getElementById('familyBotV2Launcher');
  if (button) button.disabled = true;
  try {
    const module = await import('./family-bot-conversation-v2.js?v=1');
    if (typeof module.openFamilyBot === 'function') await module.openFamilyBot();
    else throw new Error('K-3 conversation module did not initialise');
  } catch (error) {
    console.error('K-3 failed to open', error);
    window.alert('K-3 could not open just now. The family tree is still safe to use. Please try again later.');
  } finally {
    loading = false;
    if (button) button.disabled = false;
  }
}

function installLauncher() {
  if (!APP || APP.classList.contains('hidden') || document.getElementById('familyBotV2Launcher')) return;
  installStyles();
  const button = document.createElement('button');
  button.id = 'familyBotV2Launcher';
  button.className = 'family-bot-v2-launcher';
  button.type = 'button';
  button.setAttribute('aria-label', 'Ask K-3 about the family archive');
  button.innerHTML = '<span class="family-bot-v2-droid" aria-hidden="true"><i class="family-bot-v2-head"></i><i class="family-bot-v2-neck"></i><i class="family-bot-v2-body"></i><i class="family-bot-v2-foot"></i></span>';
  button.addEventListener('click', openBot);
  document.body.appendChild(button);
}

document.addEventListener('genealogy:archive-ready', installLauncher, { once: true });
if (APP && !APP.classList.contains('hidden')) installLauncher();
