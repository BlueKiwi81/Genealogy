let defaultStateFrame = null;

function applyWorkbenchDefaults() {
  defaultStateFrame = null;
  const contribution = document.getElementById('contributionWorkbench');
  if (contribution && contribution.dataset.initialOpenStateApplied !== '1') {
    contribution.dataset.initialOpenStateApplied = '1';
    contribution.open = true;
  }

  const birthday = document.getElementById('birthdayCalendarWorkbench');
  if (birthday && birthday.dataset.initialOpenStateApplied !== '1') {
    birthday.dataset.initialOpenStateApplied = '1';
    birthday.open = false;
  }
}

function scheduleWorkbenchDefaults() {
  if (defaultStateFrame !== null) return;
  defaultStateFrame = window.requestAnimationFrame(applyWorkbenchDefaults);
}

new MutationObserver(scheduleWorkbenchDefaults).observe(document.body, { childList:true, subtree:true });
document.addEventListener('genealogy:archive-ready', scheduleWorkbenchDefaults);
window.addEventListener('load', scheduleWorkbenchDefaults);
scheduleWorkbenchDefaults();
