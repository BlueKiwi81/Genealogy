const FRONTIER_STORAGE_KEY = 'genealogyShowResearchFrontier';

function installStyles() {
  if (document.getElementById('researchFrontierStyles')) return;
  const style = document.createElement('style');
  style.id = 'researchFrontierStyles';
  style.textContent = `
    .frontier-toggle-row{white-space:nowrap;align-self:end;margin:0 0 2px 0}
    .research-frontier-node{cursor:help}
    .frontier-fan-label{fill:#303030!important}
    .frontier-fan-date{fill:#4f4f4f!important}
    @media(max-width:900px){.frontier-toggle-row{margin-left:0}}
  `;
  document.head.appendChild(style);
}

function emitChange() {
  document.dispatchEvent(new CustomEvent('genealogy:research-frontier-changed', {
    detail: { enabled: localStorage.getItem(FRONTIER_STORAGE_KEY) === '1' },
  }));
}

function installToggle() {
  if (document.getElementById('frontierToggle')) return;
  const centreSelect = document.getElementById('centreSelect');
  const panelHead = centreSelect?.closest('.panel-head');
  if (!centreSelect || !panelHead) return;

  installStyles();
  const label = document.createElement('label');
  label.className = 'check-row frontier-toggle-row';
  label.title = 'Show lower-confidence research candidates and locality or household leads in grey. This layer is weaker than the normal hypothesis shading and does not change canonical parentage.';

  const checkbox = document.createElement('input');
  checkbox.id = 'frontierToggle';
  checkbox.type = 'checkbox';
  checkbox.checked = localStorage.getItem(FRONTIER_STORAGE_KEY) === '1';

  const span = document.createElement('span');
  span.textContent = 'Research frontier';
  label.append(checkbox, span);
  panelHead.appendChild(label);

  checkbox.addEventListener('change', () => {
    localStorage.setItem(FRONTIER_STORAGE_KEY, checkbox.checked ? '1' : '0');
    emitChange();
  });
}

window.__genealogyResearchFrontierEnabled = () => localStorage.getItem(FRONTIER_STORAGE_KEY) === '1';
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installToggle);
else installToggle();

Promise.allSettled([
  import('./tree-ui-polish-v1.js?v=2'),
  import('./tree-control-deck-v1.js?v=3'),
  import('./frontier-alternates-v1.js?v=2'),
]);
