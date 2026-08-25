const panel = document.querySelector('.tree-panel');
const head = panel?.querySelector('.panel-head');
const status = document.getElementById('treeStatus');
let attempts = 0;

function make(tag, className, text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function findPrintButton() {
  return [...(panel?.querySelectorAll('button') || [])].find(button => /print this view/i.test(button.textContent || '')) || null;
}
function ensureDeck() {
  if (!panel || !head) return null;
  let deck = document.getElementById('treeControlDeck');
  if (deck) return deck;

  deck = make('section', 'tree-control-deck');
  deck.id = 'treeControlDeck';
  deck.setAttribute('aria-label', 'Family tree controls');

  const primary = make('div', 'tree-control-primary');
  primary.dataset.deckPrimary = '1';
  const secondary = make('div', 'tree-control-secondary');
  secondary.dataset.deckSecondary = '1';

  const perspective = make('div', 'deck-block deck-perspective');
  perspective.dataset.deckPerspective = '1';
  perspective.appendChild(make('div', 'deck-kicker', 'Perspective'));

  const evidence = make('div', 'deck-block deck-evidence');
  evidence.dataset.deckEvidence = '1';
  evidence.appendChild(make('div', 'deck-kicker', 'Evidence'));
  evidence.appendChild(make('div', 'deck-help', 'Grey marks active research leads below the normal hypothesis level.'));

  const output = make('div', 'deck-block deck-output');
  output.dataset.deckOutput = '1';
  output.appendChild(make('div', 'deck-kicker', 'Output'));

  secondary.append(perspective, evidence, output);
  deck.append(primary, secondary);
  head.insertAdjacentElement('afterend', deck);
  return deck;
}
function arrange() {
  const deck = ensureDeck();
  if (!deck) return;
  const primary = deck.querySelector('[data-deck-primary]');
  const perspectiveBlock = deck.querySelector('[data-deck-perspective]');
  const evidenceBlock = deck.querySelector('[data-deck-evidence]');
  const outputBlock = deck.querySelector('[data-deck-output]');

  const centreLabel = panel.querySelector('.select-label:has(#centreSelect)');
  if (centreLabel && centreLabel.parentElement !== primary) {
    centreLabel.classList.add('deck-centre');
    primary.prepend(centreLabel);
  }

  const enhanced = panel.querySelector('.enhanced-tree-controls');
  if (enhanced && enhanced.parentElement !== primary) {
    enhanced.classList.add('deck-view-controls');
    primary.appendChild(enhanced);
  }

  const perspective = panel.querySelector('#treePerspectiveSwitch');
  if (perspective && perspective.parentElement !== perspectiveBlock) perspectiveBlock.appendChild(perspective);

  const frontier = panel.querySelector('.frontier-toggle-row');
  if (frontier && frontier.parentElement !== evidenceBlock) {
    const helper = evidenceBlock.querySelector('.deck-help');
    evidenceBlock.insertBefore(frontier, helper || null);
  }

  const print = findPrintButton();
  if (print && print.parentElement !== outputBlock) outputBlock.appendChild(print);

  const legend = panel.querySelector('.lineage-legend');
  if (legend && legend.previousElementSibling !== deck) deck.insertAdjacentElement('afterend', legend);

  updateSummary();

  const complete = centreLabel && enhanced && perspective && frontier;
  attempts += 1;
  if (!complete && attempts < 60) window.setTimeout(arrange, 100);
}
function autoMax() {
  const select = document.getElementById('generationDepth');
  const auto = [...(select?.options || [])].find(option => option.value === 'auto');
  const match = auto?.textContent?.match(/\((\d+)\)/);
  return match ? Number(match[1]) : null;
}
function updateSummary() {
  const select = document.getElementById('generationDepth');
  const summary = document.getElementById('viewSummary');
  if (!select || !summary || panel?.classList.contains('snapshot-active')) return;
  const max = autoMax();
  if (select.value === 'auto') {
    summary.textContent = max
      ? `Showing the full current research depth of ${max} generations. The depth will grow automatically as the frontier moves.`
      : 'Showing the full current research depth. The depth will grow automatically as the frontier moves.';
  } else {
    const shown = Number(select.value) || select.value;
    summary.textContent = max && Number(shown) < max
      ? `Showing ${shown} generations for a cleaner view. Auto can expand this to the current research depth of ${max} generations.`
      : `Showing ${shown} generations. Choose Auto whenever you want the full current research depth.`;
  }
}
function installStyles() {
  if (document.getElementById('treeControlDeckStyles')) return;
  const style = document.createElement('style');
  style.id = 'treeControlDeckStyles';
  style.textContent = `
    .tree-panel>.panel-head{align-items:center!important;margin-bottom:12px!important}
    .tree-control-deck{display:grid;gap:12px;margin:0 0 12px;padding:14px;border:1px solid #ded3c6;border-radius:16px;background:linear-gradient(180deg,#fffdf9 0%,#faf5ed 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}
    .tree-control-primary{display:grid;grid-template-columns:minmax(360px,1.8fr) minmax(360px,1fr);gap:14px;align-items:end}
    .tree-control-primary>.deck-centre{width:auto!important;min-width:0!important;margin:0!important}
    .deck-centre{display:grid!important;grid-template-columns:minmax(0,1fr);gap:5px}
    .deck-centre #centreSearch{margin:0!important;padding:10px 12px!important;border-radius:11px!important;background:#fffdf9!important}
    .deck-centre #centreSearch+.centre-search-help{margin-top:-1px!important}
    .deck-centre #centreSelect{margin-top:0!important}
    .deck-view-controls{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px!important;align-items:end!important;margin:0!important;width:100%!important}
    .deck-view-controls .enhanced-select-label{min-width:0!important;width:auto!important}
    .deck-view-controls select{min-width:0!important;width:100%!important}
    .tree-control-secondary{display:grid;grid-template-columns:minmax(310px,1.45fr) minmax(280px,1fr) auto;gap:12px;align-items:center;padding-top:12px;border-top:1px solid #e5dbcf}
    .deck-block{min-width:0}
    .deck-kicker{margin:0 0 6px;color:#817468;font:800 9px/1.1 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}
    .deck-help{margin-top:5px;max-width:38ch;color:#85786d;font:600 10px/1.35 Arial,sans-serif}
    .deck-perspective .tree-perspective-switch{margin:0!important;width:100%!important;max-width:390px!important;background:#eee4d7!important}
    .deck-perspective .tree-perspective-switch button{flex:1!important;white-space:nowrap}
    .deck-evidence .frontier-toggle-row{margin:0!important;align-self:auto!important;display:flex!important;align-items:center!important;gap:8px!important}
    .deck-evidence .frontier-toggle-row span{font-size:13px!important}
    .deck-output{justify-self:end;text-align:right}
    .deck-output button{margin:0!important;min-height:42px!important;white-space:nowrap}
    .tree-control-deck+.lineage-legend{margin:0 0 10px!important;padding:9px 11px!important;border-radius:12px!important;background:#fbf7f0!important}
    .tree-panel>#treeStatus{margin-top:6px!important}
    @media(max-width:1050px){.tree-control-primary{grid-template-columns:1fr}.tree-control-secondary{grid-template-columns:1fr 1fr}.deck-output{grid-column:1/-1;justify-self:start;text-align:left}}
    @media(max-width:720px){.tree-control-deck{padding:11px}.tree-control-secondary{grid-template-columns:1fr}.deck-output{grid-column:auto}.deck-perspective .tree-perspective-switch{max-width:none!important}.deck-view-controls{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

installStyles();
arrange();
document.addEventListener('change', event => {
  if (['generationDepth','treeViewMode','centreSelect'].includes(event.target?.id)) window.setTimeout(() => { arrange(); updateSummary(); }, 0);
});
document.addEventListener('genealogy:research-frontier-changed', () => window.setTimeout(arrange, 30));
window.addEventListener('load', () => window.setTimeout(arrange, 150));
