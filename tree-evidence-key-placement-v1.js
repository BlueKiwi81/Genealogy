const appArea = document.getElementById('appArea');
const key = document.getElementById('treeEvidenceKey');

function ensureRegion() {
  const workspace = appArea?.querySelector('.workspace');
  if (!workspace) return null;
  let region = document.getElementById('treeBelowTools');
  if (!region) {
    region = document.createElement('section');
    region.id = 'treeBelowTools';
    region.className = 'post-tree-tools';
    region.setAttribute('aria-label', 'Family tools and contributions');
    workspace.insertAdjacentElement('afterend', region);
  } else if (workspace.nextElementSibling !== region) {
    workspace.insertAdjacentElement('afterend', region);
  }
  return region;
}

function installStyles() {
  if (document.getElementById('treeEvidenceKeyPlacementStyles')) return;
  const style = document.createElement('style');
  style.id = 'treeEvidenceKeyPlacementStyles';
  style.textContent = `
    #treeEvidenceKey.tree-key-wide{padding:12px 16px;margin:0}
    #treeEvidenceKey.tree-key-wide .eyebrow{margin-bottom:2px}
    #treeEvidenceKey.tree-key-wide h2{font-size:1rem;margin:0 0 3px}
    #treeEvidenceKey.tree-key-wide .tree-key-intro{margin:0 0 9px;font-size:11px}
    #treeEvidenceKey.tree-key-wide .tree-key-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px 16px}
    #treeEvidenceKey.tree-key-wide .tree-key-row{grid-template-columns:48px 1fr;gap:8px;font-size:11px;line-height:1.26}
    #treeEvidenceKey.tree-key-wide .tree-key-row strong{font-size:11px}
    #treeEvidenceKey.tree-key-wide .tree-key-swatch{width:44px;height:15px}
    #treeEvidenceKey.tree-key-wide .tree-key-frontier i{width:13px;height:15px}
    #treeEvidenceKey.tree-key-wide .tree-key-question{width:19px;height:19px;font-size:11px}
    #treeEvidenceKey.tree-key-wide .tree-key-note{margin-top:8px;padding-top:7px;font-size:10px}
    @media(max-width:980px){#treeEvidenceKey.tree-key-wide .tree-key-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:640px){#treeEvidenceKey.tree-key-wide .tree-key-grid{grid-template-columns:1fr}#treeEvidenceKey.tree-key-wide{padding:12px 14px}}
  `;
  document.head.appendChild(style);
}

function placeKey() {
  if (!key) return;
  const region = ensureRegion();
  if (!region) return;
  installStyles();
  key.classList.add('tree-key-wide');
  const contribution = document.getElementById('contributionWorkbench');
  if (contribution?.parentElement === region) {
    if (key.nextElementSibling !== contribution) region.insertBefore(key, contribution);
  } else if (region.firstElementChild !== key) {
    region.prepend(key);
  }
}

placeKey();
window.addEventListener('load', placeKey);
document.addEventListener('genealogy:archive-ready', placeKey);
document.addEventListener('genealogy:language-changed', placeKey);
window.setTimeout(placeKey, 60);
window.setTimeout(placeKey, 240);
