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
  const contributionPanel = document.getElementById('contributionForm')?.closest('section');
  const contribution = ensureContributionWorkbench(contributionPanel, region);

  const birthdayPanel = document.getElementById('birthdayCalendarPanel');
  if (birthdayPanel) makeCalendarCompact(birthdayPanel);
  const calendar = ensureCalendarWorkbench(birthdayPanel, region);

  if (contribution && region.firstElementChild !== contribution) region.prepend(contribution);
  if (calendar && contribution && contribution.nextElementSibling !== calendar) contribution.insertAdjacentElement('afterend', calendar);

  // The right-hand column belongs to the selected person only. Dynamic family tools
  // are always moved into the full-width tool region below the fan.
  if (sideColumn) {
    [...sideColumn.children].forEach((child) => {
      if (child === personPanel) return;
      if (child.id === 'birthdayCalendarPanel') {
        const body = document.querySelector('#birthdayCalendarWorkbench .birthday-calendar-workbench-body');
        if (body) body.appendChild(child);
      }
    });
  }

  installContributionLink();
  syncCopy();
}

function scheduleArrange() {
  window.clearTimeout(arrangeTimer);
  arrangeTimer = window.setTimeout(arrangeWorkspace, 30);
}

const observer = new MutationObserver(scheduleArrange);
observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener('genealogy:language-changed', () => { scheduleArrange(); window.setTimeout(syncCopy, 40); });
window.addEventListener('load', scheduleArrange);
scheduleArrange();
