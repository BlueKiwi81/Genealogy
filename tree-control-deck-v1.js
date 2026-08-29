const panel = document.querySelector('.tree-panel');
const head = panel?.querySelector('.panel-head');
const canvas = document.getElementById('treeCanvas');
const status = document.getElementById('treeStatus');
let attempts = 0;
let mutationTimer = null;
let depthRepairing = false;

function make(tag, className, text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function findPrintButton() {
  return [...(panel?.querySelectorAll('button') || [])]
    .find(button => /print this view/i.test(button.textContent || '')) || null;
}

function addModeCopy(switcher) {
  if (!switcher || switcher.dataset.uxCopy === '1') return;
  switcher.dataset.uxCopy = '1';
  const fan = switcher.querySelector('[data-tree-perspective="fan"]');
  const snapshot = switcher.querySelector('[data-tree-perspective="snapshot"]');
  if (fan) fan.innerHTML = '<span class="explorer-mode-title">Ancestry fan</span><span class="explorer-mode-copy">Where do I come from?</span>';
  if (snapshot) snapshot.innerHTML = '<span class="explorer-mode-title">Family snapshot</span><span class="explorer-mode-copy">How does our family look?</span>';
}

function ensureExplorer() {
  if (!panel || !head) return null;
  let explorer = document.getElementById('treeExplorerControls');
  if (explorer) return explorer;

  explorer = make('section', 'tree-explorer-controls');
  explorer.id = 'treeExplorerControls';
  explorer.setAttribute('aria-label', 'Explore the family tree');

  const main = make('div', 'tree-explorer-main');
  const focus = make('section', 'explorer-card explorer-focus');
  focus.dataset.explorerFocus = '1';
  focus.appendChild(make('div', 'explorer-kicker', 'Find & focus'));
  focus.appendChild(make('p', 'explorer-helper', 'Search by name or ask a relationship question, then choose who sits at the centre.'));

  const perspective = make('section', 'explorer-card explorer-perspective');
  perspective.dataset.explorerPerspective = '1';
  perspective.appendChild(make('div', 'explorer-kicker', 'Choose a view'));
  perspective.appendChild(make('p', 'explorer-helper', 'Switch between the ancestry fan and a family snapshot around the same centre.'));

  main.append(focus, perspective);

  const options = make('div', 'tree-explorer-options');
  const display = make('section', 'explorer-option explorer-display');
  display.dataset.explorerDisplay = '1';
  display.appendChild(make('div', 'explorer-kicker', 'Display'));

  const evidence = make('section', 'explorer-option explorer-evidence');
  evidence.dataset.explorerEvidence = '1';
  evidence.appendChild(make('div', 'explorer-kicker', 'Research layer'));

  const output = make('section', 'explorer-option explorer-output');
  output.dataset.explorerOutput = '1';
  output.appendChild(make('div', 'explorer-kicker', 'Output'));

  options.append(display, evidence, output);
  explorer.append(main, options);
  head.insertAdjacentElement('afterend', explorer);
  return explorer;
}

function repairDepthSelection() {
  if (depthRepairing) return;
  const select = document.getElementById('generationDepth');
  if (!select || !select.options.length || select.value) return;
  const preferred = [...select.options].find(option => option.value === '6')
    || [...select.options].find(option => option.value === 'auto')
    || select.options[0];
  if (!preferred) return;
  depthRepairing = true;
  select.value = preferred.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  queueMicrotask(() => { depthRepairing = false; });
}

function arrange() {
  const explorer = ensureExplorer();
  if (!explorer) return;

  const focus = explorer.querySelector('[data-explorer-focus]');
  const perspectiveCard = explorer.querySelector('[data-explorer-perspective]');
  const display = explorer.querySelector('[data-explorer-display]');
  const evidence = explorer.querySelector('[data-explorer-evidence]');
  const output = explorer.querySelector('[data-explorer-output]');

  const frontier = panel.querySelector('.frontier-toggle-row');
  if (!frontier) {
    attempts += 1;
    if (attempts < 80) window.setTimeout(arrange, 100);
    return;
  }

  const centreLabel = panel.querySelector('.select-label:has(#centreSelect)');
  if (centreLabel && centreLabel.parentElement !== focus) {
    centreLabel.classList.add('explorer-centre');
    focus.appendChild(centreLabel);
  }

  const perspective = panel.querySelector('#treePerspectiveSwitch');
  if (perspective) {
    addModeCopy(perspective);
    if (perspective.parentElement !== perspectiveCard) perspectiveCard.appendChild(perspective);
  }

  const enhanced = panel.querySelector('.enhanced-tree-controls');
  if (enhanced && enhanced.parentElement !== display) {
    enhanced.classList.add('explorer-display-controls');
    display.appendChild(enhanced);
  }

  if (frontier.parentElement !== evidence) {
    frontier.classList.add('explorer-frontier-toggle');
    evidence.appendChild(frontier);
  }
  if (!evidence.querySelector('.explorer-evidence-copy')) {
    evidence.appendChild(make('p', 'explorer-evidence-copy', 'Show lower-confidence leads in grey without changing the evidence-graded tree.'));
  }

  const print = findPrintButton();
  if (print && print.parentElement !== output) {
    print.classList.add('explorer-print');
    output.appendChild(print);
  }

  const legend = panel.querySelector('#lineageLegend');
  if (legend && canvas && legend.previousElementSibling !== canvas) {
    legend.classList.add('tree-legend-dock');
    canvas.insertAdjacentElement('afterend', legend);
  }

  if (status && explorer.nextElementSibling !== status) explorer.insertAdjacentElement('afterend', status);

  repairDepthSelection();
  updateSummary();

  attempts += 1;
  const complete = centreLabel && perspective && enhanced && print && legend;
  if (!complete && attempts < 80) window.setTimeout(arrange, 100);
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
  if (!select || !summary || panel?.classList.contains('snapshot-active') || !select.value) return;
  const max = autoMax();
  if (select.value === 'auto') {
    summary.textContent = max
      ? `Showing the full current research depth of ${max} generations. It will expand automatically as the frontier moves.`
      : 'Showing the full current research depth. It will expand automatically as the frontier moves.';
  } else {
    const shown = Number(select.value) || select.value;
    summary.textContent = max && Number(shown) < max
      ? `Showing ${shown} generations for a cleaner view. Auto can expand this to the current research depth of ${max}.`
      : `Showing ${shown} generations. Choose Auto whenever you want the full current research depth.`;
  }
}

function installStyles() {
  if (document.getElementById('treeExplorerControlStyles')) return;
  const style = document.createElement('style');
  style.id = 'treeExplorerControlStyles';
  style.textContent = `
    .tree-panel>.panel-head{align-items:center!important;margin-bottom:12px!important;padding-bottom:0!important}
    .tree-explorer-controls{display:grid;gap:10px;min-width:0;max-width:100%;box-sizing:border-box;margin:0 0 8px;padding:12px;border:1px solid #ded3c7;border-radius:17px;background:linear-gradient(180deg,#fffdf9 0%,#faf6ef 100%);box-shadow:0 5px 18px rgba(69,52,38,.035),inset 0 1px 0 rgba(255,255,255,.9)}
    .tree-explorer-main{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:10px;min-width:0}
    .explorer-card{min-width:0;padding:12px 13px;border:1px solid rgba(116,95,77,.13);border-radius:13px;background:rgba(255,255,255,.58)}
    .explorer-kicker{margin:0 0 4px;color:#7f7165;font:800 9px/1.1 Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase}
    .explorer-helper,.explorer-evidence-copy{margin:0 0 9px;color:#887b70;font:600 10px/1.4 Arial,sans-serif}
    .explorer-centre{display:grid!important;gap:5px;width:100%!important;margin:0!important;color:#554c44!important}
    .explorer-centre>select{margin-top:0!important}
    .explorer-centre #centreSearch{height:43px;margin:0!important;padding:9px 12px!important;border-color:#cbbdaf!important;border-radius:11px!important;background:#fff!important;font:600 13px/1.2 Arial,sans-serif!important}
    .explorer-centre .centre-search-help{margin:0!important;color:#8b7f74!important;font:600 9.5px/1.35 Arial,sans-serif!important}
    .explorer-centre #centreSelect{height:38px;padding:7px 10px!important;border-radius:10px!important;background:#fffdf9!important;font:700 12px/1.2 Arial,sans-serif!important}
    .explorer-perspective .tree-perspective-switch{display:grid!important;grid-template-columns:1fr 1fr;gap:7px!important;width:100%!important;margin:0!important;padding:0!important;background:transparent!important}
    .explorer-perspective .tree-perspective-switch button{display:flex!important;flex-direction:column;align-items:flex-start;justify-content:center;min-height:72px;padding:10px 12px!important;border:1px solid #d7cabe!important;border-radius:12px!important;background:#faf5ed!important;color:#6a5d52!important;text-align:left!important;box-shadow:none!important}
    .explorer-perspective .tree-perspective-switch button[aria-pressed="true"]{border-color:#8c7865!important;background:#fffdf8!important;color:#342a22!important;box-shadow:0 3px 10px rgba(67,50,36,.09)!important}
    .explorer-mode-title{display:block;font:800 12px/1.15 Arial,sans-serif}
    .explorer-mode-copy{display:block;margin-top:4px;color:#88796b;font:600 10px/1.25 Arial,sans-serif}
    .tree-explorer-options{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,.9fr) minmax(142px,auto);gap:10px;min-width:0;align-items:stretch;padding-top:10px;border-top:1px solid #e6ddd3}
    .explorer-option{min-width:0;padding:9px 11px;border-radius:11px;background:rgba(246,240,232,.58)}
    .explorer-display-controls{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,.72fr);gap:9px!important;align-items:end!important;width:100%!important;margin:0!important}
    .explorer-display-controls .enhanced-select-label{display:grid!important;gap:4px;min-width:0!important;width:auto!important;margin:0!important;color:#665a50!important;font:800 9px/1.1 Arial,sans-serif!important;letter-spacing:.08em!important;text-transform:uppercase}
    .explorer-display-controls select{height:35px;min-width:0!important;width:100%!important;padding:6px 9px!important;border-radius:9px!important;background:#fffdf9!important;font:700 11px/1.2 Arial,sans-serif!important;text-transform:none!important;letter-spacing:0!important}
    .explorer-frontier-toggle{display:flex!important;align-items:center!important;gap:8px!important;margin:5px 0 4px!important;color:#40352c!important;font:800 12px/1.2 Arial,sans-serif!important;cursor:pointer}
    .explorer-frontier-toggle input{width:17px!important;height:17px!important;margin:0!important;accent-color:#66513e}
    .explorer-evidence-copy{margin:5px 0 0!important;max-width:39ch}
    .explorer-output{display:flex;flex-direction:column;justify-content:flex-start;min-width:142px}
    .explorer-output .explorer-print{min-height:38px!important;margin:4px 0 0!important;padding:8px 13px!important;border:1px solid #d4c6b8!important;border-radius:10px!important;background:#eee2d2!important;color:#463a30!important;font:800 11px/1.1 Arial,sans-serif!important;white-space:nowrap}
    .tree-panel>#treeStatus{min-height:0!important;margin:7px 2px 10px!important;color:#4c7852!important;font:700 10.5px/1.35 Arial,sans-serif!important}
    .tree-legend-dock{margin:10px 0 0!important;padding:9px 12px!important;border:0!important;border-top:1px solid #e3d8cc!important;border-radius:0!important;background:transparent!important;justify-content:center!important;color:#776a5f!important;font-size:.7rem!important}
    .tree-panel.snapshot-active .tree-legend-dock{display:none!important}
    .tree-legend-dock .lineage-swatch{width:11px!important;height:11px!important;border-radius:3px!important}
    @media(max-width:1100px){.tree-explorer-main{grid-template-columns:1fr}.tree-explorer-options{grid-template-columns:1fr 1fr}.explorer-output{grid-column:1/-1;min-width:0}.explorer-output .explorer-print{align-self:flex-start}}
    @media(max-width:720px){.tree-explorer-controls{padding:9px}.explorer-card{padding:10px}.tree-explorer-options{grid-template-columns:1fr}.explorer-output{grid-column:auto}.explorer-display-controls{grid-template-columns:1fr}.explorer-perspective .tree-perspective-switch{grid-template-columns:1fr}.explorer-perspective .tree-perspective-switch button{min-height:58px}}
  `;
  document.head.appendChild(style);
}

installStyles();
arrange();

const observer = new MutationObserver(() => {
  window.clearTimeout(mutationTimer);
  mutationTimer = window.setTimeout(() => { arrange(); repairDepthSelection(); }, 20);
});
if (panel) observer.observe(panel, { childList: true, subtree: true });

document.addEventListener('change', event => {
  if (['generationDepth','treeViewMode','centreSelect'].includes(event.target?.id)) {
    window.setTimeout(() => { arrange(); repairDepthSelection(); updateSummary(); }, 0);
  }
});
document.addEventListener('genealogy:research-frontier-changed', () => window.setTimeout(arrange, 25));
window.addEventListener('load', () => window.setTimeout(arrange, 120));
