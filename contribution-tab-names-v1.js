let tabLabelFrame = null;
let applyingTabLabels = false;

function isAfrikaans() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}

function labelFor(mode) {
  const af = isAfrikaans();
  if (mode === 'share') return af ? 'Deel inligting' : 'Share information';
  if (mode === 'assist' || mode === 'upload') return af ? 'Navorsingsassistent' : 'Research assistant';
  if (mode === 'research') return af ? 'Navorsingsgids' : 'Research guide';
  return '';
}

function applyContributionTabNames() {
  tabLabelFrame = null;
  if (applyingTabLabels) return;
  applyingTabLabels = true;
  try {
    const tabs = document.getElementById('contributionModeTabs');
    if (!tabs) return;

    // The former upload tab is now the research-assistant tab. Normal record
    // uploads live inside Share information via Photo, document or source.
    const legacyUpload = tabs.querySelector('[data-mode="upload"]');
    if (legacyUpload) legacyUpload.dataset.mode = 'assist';

    tabs.querySelectorAll('[data-mode]').forEach((button) => {
      const value = labelFor(button.dataset.mode);
      if (value && button.textContent !== value) button.textContent = value;
    });

    const guide = document.getElementById('researchHelpPanel');
    const guideEyebrow = guide?.querySelector('.research-intro .eyebrow');
    const guideName = isAfrikaans() ? 'Navorsingsgids' : 'Research guide';
    if (guideEyebrow && guideEyebrow.textContent !== guideName) guideEyebrow.textContent = guideName;

    const assistant = document.getElementById('researchAssistantPanel');
    if (assistant) assistant.setAttribute('aria-label', isAfrikaans() ? 'Navorsingsassistent' : 'Research assistant');
  } finally {
    applyingTabLabels = false;
  }
}

function scheduleContributionTabNames() {
  if (tabLabelFrame !== null) return;
  tabLabelFrame = window.requestAnimationFrame(applyContributionTabNames);
}

new MutationObserver((mutations) => {
  if (applyingTabLabels) return;
  if (mutations.some((mutation) => mutation.type === 'characterData' || mutation.addedNodes?.length)) {
    scheduleContributionTabNames();
  }
}).observe(document.body, { childList:true, subtree:true, characterData:true });

document.addEventListener('genealogy:archive-ready', scheduleContributionTabNames);
document.addEventListener('genealogy:language-changed', scheduleContributionTabNames);
window.addEventListener('load', scheduleContributionTabNames);
scheduleContributionTabNames();
