import './person-photos-v1.js';

const treeCanvas = document.getElementById('treeCanvas');
const treePanel = document.querySelector('.tree-panel');
const panelHead = document.querySelector('.tree-panel .panel-head');
const centreSelect = document.getElementById('centreSelect');
const palette = ['#e7bea0', '#b8d5de', '#cbd6a6', '#d2c2df'];

function af() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}

function ensureLegend() {
  if (!treePanel || !panelHead) return null;
  let legend = document.getElementById('lineageLegend');
  if (legend) return legend;
  legend = document.createElement('div');
  legend.id = 'lineageLegend';
  legend.className = 'lineage-legend';
  legend.setAttribute('aria-label', 'Lineage colour key');
  panelHead.insertAdjacentElement('afterend', legend);
  return legend;
}

function centreCardName(svg, personId) {
  if (!personId) return '';
  const card = [...svg.querySelectorAll('.family-centre-person[data-person-id]')]
    .find((node) => node.dataset.personId === personId);
  return card?.querySelector('.family-centre-name')?.textContent?.trim() || '';
}

function familyLegendItems(svg) {
  const cards = [...svg.querySelectorAll('.family-centre-person[data-person-id]')];
  if (cards.length < 2) return null;

  const centreId = centreSelect?.value || '';
  const centreName = centreCardName(svg, centreId)
    || cards[0]?.querySelector('.family-centre-name')?.textContent?.trim()
    || (af() ? 'Geselekteerde persoon' : 'Selected person');
  const partnerCard = cards.find((node) => node.dataset.personId !== centreId) || cards[1];
  const partnerName = partnerCard?.querySelector('.family-centre-name')?.textContent?.trim()
    || (af() ? 'Lewensmaat' : 'Spouse/partner');

  const paternal = af() ? 'vaderlike lyn' : 'paternal line';
  const maternal = af() ? 'moederlike lyn' : 'maternal line';
  return [
    { colour: palette[0], label: `${centreName} – ${paternal}` },
    { colour: palette[1], label: `${centreName} – ${maternal}` },
    { colour: palette[2], label: `${partnerName} – ${paternal}` },
    { colour: palette[3], label: `${partnerName} – ${maternal}` },
  ];
}

function ancestryLegendItems() {
  return [
    { colour: palette[0], label: af() ? 'Vaderlike lyn' : 'Paternal line' },
    { colour: palette[1], label: af() ? 'Moederlike lyn' : 'Maternal line' },
  ];
}

function renderLegend() {
  const legend = ensureLegend();
  if (!legend) return;
  const svg = treeCanvas?.querySelector(':scope > svg');
  if (!svg) {
    legend.replaceChildren();
    return;
  }

  // Do not infer family mode from aria-label text: that label is translated and
  // has changed between renderer versions. Two centre person cards are the
  // structural signal that a couple fan is actually on screen.
  const items = familyLegendItems(svg) || ancestryLegendItems();
  legend.setAttribute('aria-label', af() ? 'Kleursleutel vir familielyne' : 'Lineage colour key');
  legend.innerHTML = items.map((item) => `
    <span class="lineage-key-item">
      <span class="lineage-swatch" style="--lineage-colour:${item.colour}"></span>
      <span>${item.label}</span>
    </span>`).join('');
}

if (treeCanvas) {
  new MutationObserver(() => window.setTimeout(renderLegend, 0))
    .observe(treeCanvas, { childList: true, subtree: false });
}

document.addEventListener('change', (event) => {
  if (['treeViewMode', 'generationDepth', 'centreSelect'].includes(event.target?.id)) {
    window.setTimeout(renderLegend, 60);
  }
});

document.addEventListener('genealogy:archive-ready', () => window.setTimeout(renderLegend, 0));
document.addEventListener('genealogy:language-changed', () => window.setTimeout(renderLegend, 0));
renderLegend();
