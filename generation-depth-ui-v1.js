function language() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af' ? 'af' : 'en';
}

function copy(en, af) {
  return language() === 'af' ? af : en;
}

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function numericDepths(select) {
  return [...select.options]
    .map((option) => Number(option.value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function visibleGenerationOffset() {
  const mode = document.getElementById('treeViewMode')?.value || 'family';
  const svg = document.querySelector('#treeCanvas > svg');
  if (!svg) return mode === 'family' ? 2 : 1;
  const familyMode = mode === 'family' && svg.querySelectorAll('.family-centre-person').length >= 2;
  const hasChildren = Boolean(familyMode && svg.querySelector('.family-child-node'));
  return 1 + (hasChildren ? 1 : 0);
}

function ensureLabel(select) {
  const label = select.closest('label');
  if (!label) return;
  let text = label.querySelector('.generation-depth-label-text');
  if (!text) {
    const firstText = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (firstText) firstText.textContent = '';
    text = document.createElement('span');
    text.className = 'generation-depth-label-text';
    label.insertBefore(text, select);
  }
  setText(text, copy('Fan depth', 'Waaierdiepte'));
}

function relabelDepthControl() {
  const select = document.getElementById('generationDepth');
  if (!select || select.dataset.relabelling === '1') return;
  const depths = numericDepths(select);
  if (!depths.length) return;

  select.dataset.relabelling = '1';
  try {
    const max = Math.max(...depths);
    const offset = visibleGenerationOffset();
    ensureLabel(select);
    select.title = copy(
      'The number is the ancestor rings around the centre. In family view the centre generation and visible children add to the total generations you can see.',
      'Die getal is die voorouer-ringe rondom die middelpunt. In familie-aansig tel die middelgenerasie en sigbare kinders by die totale generasies wat jy kan sien.'
    );

    [...select.options].forEach((option) => {
      if (option.value === 'auto') {
        const visible = max + offset;
        setText(option, copy(
          `All available — ${max} rings · ${visible} visible generations`,
          `Alle beskikbaar — ${max} ringe · ${visible} sigbare generasies`
        ));
        return;
      }
      const depth = Number(option.value);
      if (!Number.isFinite(depth)) return;
      const visible = depth + offset;
      setText(option, copy(
        `${depth} rings · ${visible} visible generations`,
        `${depth} ringe · ${visible} sigbare generasies`
      ));
    });
  } finally {
    select.dataset.relabelling = '0';
  }
}

let frame = null;
function schedule() {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    relabelDepthControl();
  });
}

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
document.addEventListener('genealogy:archive-ready', schedule);
document.addEventListener('genealogy:language-changed', schedule);
document.getElementById('treeViewMode')?.addEventListener('change', schedule);
window.addEventListener('load', schedule);
schedule();
