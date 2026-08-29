function isAfrikaans() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}

const COPY = {
  en: {
    heading: 'Before you submit',
    intro: "First click the person or fan cell that the information belongs to. Then check the name below. Your comment, correction, story or uploaded record will be linked to that person's family record.",
    linked: 'Linked to:',
    linkedNote: "Anything you submit now will be attached to this person's record.",
    none: 'No person selected.',
    noneNote: 'Click the person or fan cell that your information belongs to before submitting.',
  },
  af: {
    heading: 'Voordat jy indien',
    intro: "Klik eers op die persoon of waaiersel aan wie die inligting behoort. Kontroleer dan die naam hieronder. Jou kommentaar, regstelling, storie of opgelaaide rekord sal aan daardie persoon se familierekord gekoppel word.",
    linked: 'Gekoppel aan:',
    linkedNote: "Enigiets wat jy nou indien, sal aan hierdie persoon se rekord gekoppel word.",
    none: 'Geen persoon gekies nie.',
    noneNote: 'Klik op die persoon of waaiersel aan wie jou inligting behoort voordat jy dit indien.',
  },
};

let applying = false;

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function applyContributionGuideLanguage() {
  if (applying) return;
  const guide = document.getElementById('contributionGuide');
  if (!guide) return;

  applying = true;
  try {
    // This small dynamic block is managed here because source-upload-v1.js
    // rewrites it whenever the selected person changes.
    guide.setAttribute('data-i18n-ignore', '');
    const copy = isAfrikaans() ? COPY.af : COPY.en;
    setText(guide.querySelector(':scope > strong'), copy.heading);
    setText(guide.querySelector(':scope > p'), copy.intro);

    const target = guide.querySelector('#contributionTarget');
    if (!target) return;
    const needsSelection = target.classList.contains('needs-selection');
    setText(target.querySelector('strong'), needsSelection ? copy.none : copy.linked);
    setText(target.querySelector('span'), needsSelection ? copy.noneNote : copy.linkedNote);
  } finally {
    applying = false;
  }
}

document.addEventListener('genealogy:language-changed', applyContributionGuideLanguage);

const observer = new MutationObserver((mutations) => {
  if (applying) return;
  const relevant = mutations.some((mutation) => {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    return target?.closest?.('#contributionGuide') || [...(mutation.addedNodes || [])].some((node) => node instanceof Element && (node.id === 'contributionGuide' || node.querySelector?.('#contributionGuide')));
  });
  if (relevant) queueMicrotask(applyContributionGuideLanguage);
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
applyContributionGuideLanguage();
