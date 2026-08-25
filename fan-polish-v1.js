import './person-photos-v1.js';

const treeCanvas = document.getElementById('treeCanvas');
const treePanel = document.querySelector('.tree-panel');
const panelHead = document.querySelector('.tree-panel .panel-head');
const palette = [
  { colour: '#e7bea0', ancestry: 'Paternal line', family: "Selected person's paternal line" },
  { colour: '#b8d5de', ancestry: 'Maternal line', family: "Selected person's maternal line" },
  { colour: '#cbd6a6', family: "Spouse/partner's paternal line" },
  { colour: '#d2c2df', family: "Spouse/partner's maternal line" },
];

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

function renderLegend() {
  const legend = ensureLegend();
  if (!legend) return;
  const svg = treeCanvas?.querySelector(':scope > svg');
  if (!svg) {
    legend.replaceChildren();
    return;
  }
  const familyMode = svg.getAttribute('aria-label')?.startsWith('Family fan');
  const items = familyMode ? palette : palette.slice(0, 2);
  legend.innerHTML = items.map((item) => `
    <span class="lineage-key-item">
      <span class="lineage-swatch" style="--lineage-colour:${item.colour}"></span>
      <span>${familyMode ? item.family : item.ancestry}</span>
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
renderLegend();
