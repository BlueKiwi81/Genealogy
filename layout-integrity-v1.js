import './research-cost-disclosure-v1.js?v=4';
import './birthday-calendar-collapse-v1.js?v=2';
import './unknown-parent-evidence-v1.js?v=2';
import './unknown-parent-editor-v1.js?v=1';
import './person-uncertainty-consolidator-v1.js?v=2';
import './research-assistant-v1.js?v=3';
import './family-bot-v1.js?v=1';
import './research-assistant-refinement-v1.js?v=1';
import './research-assistant-progress-v1.js?v=1';
import './fan-reading-mode-v1.js?v=3';
import './contribution-tab-names-v1.js?v=1';
import './workbench-default-state-v1.js?v=1';
import './generation-depth-ui-v1.js?v=2';
import './fan-zoom-pan-v1.js?v=1';

let arrangeFrame = null;
let verifyTimer = null;
let observedTreePanel = null;
let treeResizeObserver = null;

function ensureStyles() {
  if (document.getElementById('layoutIntegrityV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'layoutIntegrityV1Styles';
  style.textContent = `
    @media (min-width: 1041px) {
      #appArea .workspace > .side-column {
        align-self: start !important;
        position: relative !important;
        min-height: 0 !important;
        height: var(--tree-workspace-height, auto) !important;
      }
      #personPanel.selected-person-sticky {
        position: sticky !important;
        top: 14px !important;
        max-height: min(calc(100vh - 28px), var(--tree-workspace-height, calc(100vh - 28px))) !important;
        overflow: auto !important;
        overscroll-behavior: contain !important;
        scrollbar-gutter: stable;
        transform: none !important;
        will-change: auto !important;
      }
    }
    @media (max-width: 1040px) {
      #appArea .workspace > .side-column {
        height: auto !important;
      }
      #personPanel.selected-person-sticky {
        position: static !important;
        max-height: none !important;
        overflow: visible !important;
        transform: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureToolRegion(workspace) {
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

function placeFamilyTools(region, sideColumn, personPanel) {
  const contribution = document.getElementById('contributionWorkbench');
  const calendar = document.getElementById('birthdayCalendarWorkbench');
  const birthdayPanel = document.getElementById('birthdayCalendarPanel');

  if (contribution && contribution.parentElement !== region) region.appendChild(contribution);
  if (calendar && calendar.parentElement !== region) region.appendChild(calendar);

  if (birthdayPanel) {
    const calendarBody = calendar?.querySelector('.birthday-calendar-workbench-body');
    if (calendarBody && birthdayPanel.parentElement !== calendarBody) calendarBody.appendChild(birthdayPanel);
    else if (!calendarBody && birthdayPanel.parentElement !== region) region.appendChild(birthdayPanel);
  }

  if (contribution && region.firstElementChild !== contribution) region.prepend(contribution);
  if (calendar && contribution && contribution.nextElementSibling !== calendar) contribution.insertAdjacentElement('afterend', calendar);

  if (!sideColumn) return;
  [...sideColumn.children].forEach((child) => {
    if (child === personPanel) return;

    if (child.id === 'birthdayCalendarPanel' || child.querySelector?.('#birthdayCalendarPanel')) {
      const body = calendar?.querySelector('.birthday-calendar-workbench-body');
      (body || region).appendChild(child);
      return;
    }

    if (child.querySelector?.('#contributionForm')) {
      const body = contribution?.querySelector('.contribution-workbench-body');
      (body || region).appendChild(child);
    }
  });
}

function syncWorkspaceBoundary(workspace, treePanel, sideColumn) {
  if (!workspace || !treePanel || !sideColumn) return;
  if (!window.matchMedia('(min-width: 1041px)').matches) {
    sideColumn.style.removeProperty('--tree-workspace-height');
    return;
  }
  const height = Math.max(0, Math.ceil(treePanel.getBoundingClientRect().height));
  if (!height) return;
  sideColumn.style.setProperty('--tree-workspace-height', `${height}px`);
}

function observeTreePanel(treePanel) {
  if (observedTreePanel === treePanel) return;
  treeResizeObserver?.disconnect();
  observedTreePanel = treePanel || null;
  if (!treePanel || typeof ResizeObserver === 'undefined') return;
  treeResizeObserver = new ResizeObserver(scheduleArrange);
  treeResizeObserver.observe(treePanel);
}

function layoutIsSane(workspace, region, sideColumn, personPanel) {
  if (!workspace || !region) return false;
  if (workspace.nextElementSibling !== region) return false;
  if (personPanel && sideColumn && personPanel.parentElement !== sideColumn) return false;
  if (sideColumn && [...sideColumn.children].some((child) => child !== personPanel)) return false;

  const contribution = document.getElementById('contributionWorkbench');
  const calendar = document.getElementById('birthdayCalendarWorkbench');
  const birthdayPanel = document.getElementById('birthdayCalendarPanel');
  if (contribution && contribution.parentElement !== region) return false;
  if (calendar && calendar.parentElement !== region) return false;
  if (birthdayPanel && birthdayPanel.closest('.side-column')) return false;
  return true;
}

function verifyLayoutSoon() {
  window.clearTimeout(verifyTimer);
  verifyTimer = window.setTimeout(() => {
    const workspace = document.querySelector('#appArea .workspace');
    if (!workspace) return;
    const region = document.getElementById('treeBelowTools');
    const sideColumn = workspace.querySelector('.side-column');
    const personPanel = document.getElementById('personPanel');
    if (!layoutIsSane(workspace, region, sideColumn, personPanel)) scheduleArrange();
    else syncWorkspaceBoundary(workspace, workspace.querySelector('.tree-panel'), sideColumn);
  }, 160);
}

function enforceLayout() {
  arrangeFrame = null;
  ensureStyles();
  const workspace = document.querySelector('#appArea .workspace');
  if (!workspace) return;

  const treePanel = workspace.querySelector('.tree-panel');
  const sideColumn = workspace.querySelector('.side-column');
  const personPanel = document.getElementById('personPanel');
  const region = ensureToolRegion(workspace);

  if (personPanel && sideColumn && personPanel.parentElement !== sideColumn) sideColumn.prepend(personPanel);
  if (personPanel) personPanel.classList.add('selected-person-sticky');

  placeFamilyTools(region, sideColumn, personPanel);
  syncWorkspaceBoundary(workspace, treePanel, sideColumn);
  observeTreePanel(treePanel);
  verifyLayoutSoon();
}

function scheduleArrange() {
  if (arrangeFrame !== null) return;
  arrangeFrame = window.requestAnimationFrame(enforceLayout);
}

function settleLayout() {
  scheduleArrange();
  window.setTimeout(scheduleArrange, 60);
  window.setTimeout(scheduleArrange, 240);
  window.setTimeout(scheduleArrange, 800);
}

new MutationObserver(scheduleArrange).observe(document.body, { childList: true, subtree: true });
window.addEventListener('resize', settleLayout, { passive: true });
document.addEventListener('genealogy:archive-ready', settleLayout);
document.addEventListener('genealogy:language-changed', settleLayout);
window.addEventListener('load', settleLayout);
settleLayout();
