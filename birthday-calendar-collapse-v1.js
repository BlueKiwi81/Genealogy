function ensureBirthdayCalendarCollapsible() {
  const panel = document.getElementById('birthdayCalendarPanel');
  if (!panel) return;

  let workbench = document.getElementById('birthdayCalendarWorkbench');
  if (!workbench) {
    const region = document.getElementById('treeBelowTools') || document.querySelector('#appArea .workspace')?.parentElement;
    if (!region) return;
    workbench = document.createElement('details');
    workbench.id = 'birthdayCalendarWorkbench';
    workbench.className = 'panel birthday-calendar-workbench';
    workbench.innerHTML = `
      <summary>
        <span>
          <span class="eyebrow birthday-summary-kicker">Family tools</span>
          <strong class="birthday-summary-title">Birthday calendar</strong>
          <small class="birthday-summary-copy">Set it once, or open this later to manage your subscription.</small>
        </span>
        <span class="contribution-workbench-indicator" aria-hidden="true">+</span>
      </summary>
      <div class="birthday-calendar-workbench-body"></div>`;
    const contribution = document.getElementById('contributionWorkbench');
    if (contribution?.parentElement) contribution.insertAdjacentElement('afterend', workbench);
    else region.appendChild(workbench);
  }

  const body = workbench.querySelector('.birthday-calendar-workbench-body');
  if (body && panel.parentElement !== body) body.appendChild(panel);

  if (workbench.dataset.collapseReady !== '1') {
    workbench.dataset.collapseReady = '1';
    // Always begin a fresh page view minimised. Once the user opens it, do not
    // interfere with their choice again during the current session/page render.
    workbench.open = false;
    const summary = workbench.querySelector(':scope > summary');
    summary?.setAttribute('title', 'Open or minimise the birthday calendar');
    summary?.setAttribute('aria-label', 'Birthday calendar. Open or minimise this section.');
  }
}

const birthdayCollapseObserver = new MutationObserver(ensureBirthdayCalendarCollapsible);
birthdayCollapseObserver.observe(document.body, { childList:true, subtree:true });
document.addEventListener('genealogy:archive-ready', ensureBirthdayCalendarCollapsible);
window.addEventListener('load', ensureBirthdayCalendarCollapsible);
ensureBirthdayCalendarCollapsible();
