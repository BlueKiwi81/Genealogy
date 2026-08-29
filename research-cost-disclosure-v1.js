import './research-help-static-i18n-v1.js';

function af() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}

function copy() {
  if (af()) {
    return {
      title: 'Gratis en betaalde navorsingsbronne',
      body: 'Baie van die aanlyn databasisse en indekse wat hier gelys word, kan gratis deursoek word, maar nie elke bron is gratis nie. Sommige webwerwe vra vir intekeninge, rekordbeelde, afskrifte of dokumentherwinning, en onafhanklike navorsers of argief-herwinningsdienste hef normaalweg professionele fooie. Gaan asseblief die verskaffer se huidige voorwaardes en pryse na voordat jy iets bestel of iemand opdrag gee. Insluiting in die Navorsingsgids is ’n navorsingsaanbeveling en nie ’n belofte dat die diens gratis is nie.',
    };
  }
  return {
    title: 'Free and paid research resources',
    body: "Many of the online databases and indexes listed here can be searched without charge, but not every resource is free. Some websites charge for subscriptions, record images, copies or document retrieval, and independent researchers or archive-retrieval services will normally charge professional fees. Please check the provider's current terms and price before ordering or commissioning work. Inclusion in the Research guide is a research recommendation, not a promise that the service is free.",
  };
}

function installResearchCostDisclosure() {
  const panel = document.getElementById('researchHelpPanel');
  if (!panel) return;

  let note = document.getElementById('researchCostDisclosure');
  if (!note) {
    note = document.createElement('div');
    note.id = 'researchCostDisclosure';
    note.className = 'research-cost-disclosure';
    const intro = panel.querySelector('.research-intro');
    if (intro) intro.insertAdjacentElement('afterend', note);
    else panel.prepend(note);
  }
  const language = af() ? 'af' : 'en';
  if (note.dataset.language !== language) {
    const text = copy();
    note.innerHTML = `<strong>${text.title}</strong><p>${text.body}</p>`;
    note.dataset.language = language;
  }

  if (!document.getElementById('researchCostDisclosureStyles')) {
    const style = document.createElement('style');
    style.id = 'researchCostDisclosureStyles';
    style.textContent = `
      .research-cost-disclosure{margin:14px 0;padding:12px 14px;border:1px solid #dbcba9;border-radius:11px;background:#fff9ed;color:#51473d;font:.82rem/1.5 Arial,sans-serif}
      .research-cost-disclosure strong{display:block;margin-bottom:4px;color:#4a3d32}
      .research-cost-disclosure p{margin:0}
    `;
    document.head.appendChild(style);
  }
}

const researchObserver = new MutationObserver(installResearchCostDisclosure);
researchObserver.observe(document.body, { childList:true, subtree:true });
document.addEventListener('genealogy:archive-ready', installResearchCostDisclosure);
document.addEventListener('genealogy:language-changed', installResearchCostDisclosure);
window.addEventListener('load', installResearchCostDisclosure);
installResearchCostDisclosure();
