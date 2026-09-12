let arrangeTimer = null;

function lang() { return window.GenealogyI18n?.language || document.documentElement.lang || 'en'; }
function copy(en, af) { return lang() === 'af' ? af : en; }

function ensureBelowTreeTools(workspace) {
  let region = document.getElementById('treeBelowTools');
  if (!region) {
    region = document.createElement('section');
    region.id = 'treeBelowTools';
    region.className = 'post-tree-tools';
    region.setAttribute('aria-label', 'Family tools and contributions');
  }
  if (workspace.nextElementSibling !== region) workspace.insertAdjacentElement('afterend', region);
  return region;
}

function installEvidenceKeyStyles() {
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

function makeCalendarCompact(panel) {
  if (!panel || panel.dataset.bottomLayout === '1') return;
  panel.dataset.bottomLayout = '1';
  panel.classList.add('birthday-calendar-bottom');
  const field = panel.querySelector(':scope > .birthday-calendar-field');
  const help = panel.querySelector(':scope > .birthday-calendar-help');
  const checks = [...panel.querySelectorAll(':scope > .birthday-calendar-check')];
  if (field && checks.length) {
    const grid = document.createElement('div');
    grid.className = 'birthday-calendar-config-grid';
    const scopeBlock = document.createElement('div');
    scopeBlock.className = 'birthday-calendar-scope-block';
    scopeBlock.appendChild(field);
    if (help) scopeBlock.appendChild(help);
    const checksBlock = document.createElement('div');
    checksBlock.className = 'birthday-calendar-checks-block';
    checks.forEach((row) => checksBlock.appendChild(row));
    grid.append(scopeBlock, checksBlock);
    const actions = panel.querySelector(':scope > .birthday-calendar-actions');
    if (actions) panel.insertBefore(grid, actions);
    else panel.appendChild(grid);
  }
}

function ensureContributionWorkbench(panel, region) {
  if (!panel) return null;
  let details = document.getElementById('contributionWorkbench');
  if (!details) {
    details = document.createElement('details');
    details.id = 'contributionWorkbench';
    details.className = 'panel contribution-workbench';
    const summary = document.createElement('summary');
    summary.innerHTML = '<span><span class="eyebrow contribution-summary-kicker"></span><strong class="contribution-summary-title"></strong><small class="contribution-summary-copy"></small></span><span class="contribution-workbench-indicator" aria-hidden="true">+</span>';
    const body = document.createElement('div');
    body.className = 'contribution-workbench-body';
    details.append(summary, body);
    region.appendChild(details);
  }
  if (details.parentElement !== region) region.appendChild(details);
  const body = details.querySelector('.contribution-workbench-body');
  if (body && panel.parentElement !== body) {
    panel.classList.remove('panel');
    panel.classList.add('contribution-panel-inner');
    body.appendChild(panel);
  }
  return details;
}

function ensureCalendarWorkbench(panel, region) {
  if (!panel) return null;
  let details = document.getElementById('birthdayCalendarWorkbench');
  if (!details) {
    details = document.createElement('details');
    details.id = 'birthdayCalendarWorkbench';
    details.className = 'panel birthday-calendar-workbench';
    const summary = document.createElement('summary');
    summary.innerHTML = '<span><span class="eyebrow birthday-summary-kicker"></span><strong class="birthday-summary-title"></strong><small class="birthday-summary-copy"></small></span><span class="contribution-workbench-indicator" aria-hidden="true">+</span>';
    const body = document.createElement('div');
    body.className = 'birthday-calendar-workbench-body';
    details.append(summary, body);
    region.appendChild(details);
  }
  if (details.parentElement !== region) region.appendChild(details);
  const body = details.querySelector('.birthday-calendar-workbench-body');
  if (body && panel.parentElement !== body) {
    panel.classList.remove('panel');
    body.appendChild(panel);
  }
  return details;
}

function bindPersonPanel(panel) {
  if (!panel) return;
  panel.classList.add('selected-person-sticky');
  panel.classList.remove('selected-person-static');
  if (panel.dataset.stickyLayoutBound === '1') return;
  panel.dataset.stickyLayoutBound = '1';
  const name = document.getElementById('personName');
  if (name) {
    const observer = new MutationObserver(() => { panel.scrollTop = 0; });
    observer.observe(name, { childList: true, subtree: true, characterData: true });
  }
}

function installContributionLink() {
  const cards = [...document.querySelectorAll('#appArea > .intro-grid > .panel')];
  if (cards[0]) cards[0].classList.add('intro-current-view');
  const model = cards[1];
  if (!model) return;
  model.classList.add('intro-contribution-model');
  let link = document.getElementById('contributionModelLink');
  if (!link) {
    link = document.createElement('button');
    link.id = 'contributionModelLink';
    link.type = 'button';
    link.className = 'button secondary contribution-model-link';
    link.addEventListener('click', () => {
      const workbench = document.getElementById('contributionWorkbench');
      if (!workbench) return;
      workbench.open = true;
      window.setTimeout(() => workbench.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
    });
    model.appendChild(link);
  }
}

function syncCopy() {
  const contribution = document.getElementById('contributionWorkbench');
  if (contribution) {
    contribution.querySelector('.contribution-summary-kicker').textContent = copy('Help build the archive', 'Help bou aan die argief');
    contribution.querySelector('.contribution-summary-title').textContent = copy('Suggest information', 'Stel inligting voor');
    contribution.querySelector('.contribution-summary-copy').textContent = copy('Add a correction, story, relationship, person, photograph or source.', 'Voeg ’n regstelling, storie, verwantskap, persoon, foto of bron by.');
  }
  const calendar = document.getElementById('birthdayCalendarWorkbench');
  if (calendar) {
    calendar.querySelector('.birthday-summary-kicker').textContent = copy('Family tools', 'Familiehulpmiddels');
    calendar.querySelector('.birthday-summary-title').textContent = copy('Birthday calendar', 'Verjaarsdagkalender');
    calendar.querySelector('.birthday-summary-copy').textContent = copy('Set it once, or open this later to manage your subscription.', 'Stel dit een keer op, of maak dit later oop om jou intekening te bestuur.');
  }
  const link = document.getElementById('contributionModelLink');
  if (link) link.textContent = copy('Add information', 'Voeg inligting by');
}

function placeBelowTreeItems(region, key, contribution, calendar) {
  if (key) {
    installEvidenceKeyStyles();
    key.classList.add('tree-key-wide');
    if (key.parentElement !== region) region.prepend(key);
    else if (region.firstElementChild !== key) region.prepend(key);
  }

  if (contribution) {
    if (contribution.parentElement !== region) region.appendChild(contribution);
    const targetPrevious = key || null;
    if (targetPrevious) {
      if (targetPrevious.nextElementSibling !== contribution) targetPrevious.insertAdjacentElement('afterend', contribution);
    } else if (region.firstElementChild !== contribution) {
      region.prepend(contribution);
    }
  }

  if (calendar) {
    if (calendar.parentElement !== region) region.appendChild(calendar);
    if (contribution && contribution.nextElementSibling !== calendar) contribution.insertAdjacentElement('afterend', calendar);
  }
}

function arrangeWorkspace() {
  arrangeTimer = null;
  const appArea = document.getElementById('appArea');
  const workspace = appArea?.querySelector('.workspace');
  if (!workspace) return;

  const sideColumn = workspace.querySelector('.side-column');
  const personPanel = document.getElementById('personPanel');
  if (personPanel && sideColumn && personPanel.parentElement !== sideColumn) sideColumn.prepend(personPanel);
  bindPersonPanel(personPanel);

  const region = ensureBelowTreeTools(workspace);
  const key = document.getElementById('treeEvidenceKey');
  const contributionPanel = document.getElementById('contributionForm')?.closest('section');
  const contribution = ensureContributionWorkbench(contributionPanel, region);

  const birthdayPanel = document.getElementById('birthdayCalendarPanel');
  if (birthdayPanel) makeCalendarCompact(birthdayPanel);
  const calendar = ensureCalendarWorkbench(birthdayPanel, region);

  placeBelowTreeItems(region, key, contribution, calendar);

  // The right-hand column belongs to the selected person only.
  if (sideColumn) {
    [...sideColumn.children].forEach((child) => {
      if (child === personPanel) return;
      if (child === key) {
        region.prepend(child);
        return;
      }
      if (child.id === 'birthdayCalendarPanel') {
        const body = document.querySelector('#birthdayCalendarWorkbench .birthday-calendar-workbench-body');
        if (body) body.appendChild(child);
      }
    });
  }

  placeBelowTreeItems(region, key, contribution, calendar);
  installContributionLink();
  syncCopy();
}

function scheduleArrange() {
  window.clearTimeout(arrangeTimer);
  arrangeTimer = window.setTimeout(arrangeWorkspace, 80);
}

const observer = new MutationObserver(scheduleArrange);
observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener('genealogy:archive-ready', scheduleArrange);
document.addEventListener('genealogy:language-changed', () => { scheduleArrange(); window.setTimeout(syncCopy, 80); });
window.addEventListener('load', scheduleArrange);
scheduleArrange();
