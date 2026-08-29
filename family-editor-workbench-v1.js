const editorArea = document.getElementById('editorArea');

function installStyles() {
  if (document.getElementById('familyEditorWorkbenchV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'familyEditorWorkbenchV1Styles';
  style.textContent = `
    #familyEditorWorkbench {
      margin-top: 20px;
      padding: 0;
      overflow: hidden;
    }
    #familyEditorWorkbench > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      min-height: 88px;
      padding: 20px;
      cursor: pointer;
      list-style: none;
      user-select: none;
      background: linear-gradient(90deg, rgba(236,224,209,.46), rgba(255,253,248,.12));
    }
    #familyEditorWorkbench > summary::-webkit-details-marker { display: none; }
    #familyEditorWorkbench .family-editor-summary-copy { display: grid; gap: 4px; }
    #familyEditorWorkbench .family-editor-summary-copy .eyebrow { margin: 0; }
    #familyEditorWorkbench .family-editor-summary-title {
      display: block;
      margin: 0;
      font: 600 1.35rem/1.2 Georgia, "Times New Roman", serif;
      color: var(--ink);
    }
    #familyEditorWorkbench .family-editor-summary-copy small {
      color: var(--muted);
      font: .82rem/1.4 Arial, sans-serif;
    }
    #familyEditorWorkbench .family-editor-indicator {
      display: grid;
      place-items: center;
      flex: 0 0 34px;
      width: 34px;
      height: 34px;
      border: 1px solid var(--line);
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
      font: 700 1.25rem/1 Arial, sans-serif;
      transition: transform .16s ease;
    }
    #familyEditorWorkbench[open] .family-editor-indicator { transform: rotate(45deg); }
    #familyEditorWorkbenchBody {
      border-top: 1px solid var(--line);
      padding: 20px;
    }
    #familyEditorWorkbench #editorArea {
      margin-top: 0;
    }
    #familyEditorWorkbench #editorArea > .editor-heading {
      justify-content: flex-end;
      margin-bottom: 14px;
    }
    #familyEditorWorkbench #editorArea > .editor-heading > div {
      display: none;
    }
    #familyEditorWorkbench #editorArea > #editorMessage:empty {
      display: none;
    }
    @media (max-width: 650px) {
      #familyEditorWorkbench > summary { min-height: 82px; padding: 18px; }
      #familyEditorWorkbenchBody { padding: 16px; }
    }
    @media print { #familyEditorWorkbench { display: none !important; } }
  `;
  document.head.appendChild(style);
}

function buildWorkbench() {
  if (!editorArea || document.getElementById('familyEditorWorkbench')) return;
  installStyles();
  const details = document.createElement('details');
  details.id = 'familyEditorWorkbench';
  details.className = 'panel family-editor-workbench';
  details.innerHTML = `
    <summary>
      <span class="family-editor-summary-copy">
        <span class="eyebrow">Archive management</span>
        <strong class="family-editor-summary-title">Family editor</strong>
        <small>Review family access, submissions and archive work.</small>
      </span>
      <span class="family-editor-indicator" aria-hidden="true">+</span>
    </summary>
    <div id="familyEditorWorkbenchBody"></div>`;
  editorArea.insertAdjacentElement('beforebegin', details);
  details.querySelector('#familyEditorWorkbenchBody').appendChild(editorArea);

  const syncVisibility = () => {
    details.hidden = editorArea.classList.contains('hidden');
    if (details.hidden) details.open = false;
  };
  new MutationObserver(syncVisibility).observe(editorArea, { attributes: true, attributeFilter: ['class'] });
  syncVisibility();
}

buildWorkbench();
