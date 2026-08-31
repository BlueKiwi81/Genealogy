import { renderPlacesMap, teardownPlacesMap } from './places-map-v1.js';

const ui = {
  home: document.getElementById('previewHome'),
  explore: document.getElementById('previewExploreArea'),
  story: document.getElementById('storyArea'),
  centreSelect: document.getElementById('centreSelect'),
  treeCanvas: document.getElementById('treeCanvas'),
  treeStatus: document.getElementById('treeStatus'),
  viewTitle: document.getElementById('viewTitle'),
  viewSummary: document.getElementById('viewSummary'),
  treeEyebrow: document.getElementById('previewTreeEyebrow'),
  treeHeading: document.getElementById('previewTreeHeading'),
};

function primaryTab(view) {
  return document.querySelector(`.preview-primary-tab[data-preview-view="${view}"]`);
}

function treeModeButton(mode) {
  return document.querySelector(`[data-preview-tree-mode="${mode}"]`);
}

function nativeMode() {
  return document.getElementById('treeViewMode');
}

function generationLabel() {
  return document.getElementById('generationDepth')?.closest('label') || null;
}

function activatePrimary(view) {
  document.querySelectorAll('.preview-primary-tab[data-preview-view]').forEach((button) => {
    const active = button.dataset.previewView === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function setNativeMode(value) {
  const select = nativeMode();
  if (!select) return;
  if (select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function ensureCoupleFan() {
  const treeActive = primaryTab('tree')?.classList.contains('is-active');
  const fanActive = treeModeButton('fan')?.classList.contains('is-active');
  if (!treeActive || !fanActive) return;
  const select = nativeMode();
  if (!select || select.value === 'family') return;
  window.setTimeout(() => {
    if (primaryTab('tree')?.classList.contains('is-active') && treeModeButton('fan')?.classList.contains('is-active')) {
      setNativeMode('family');
    }
  }, 0);
}

async function openPlaces() {
  teardownPlacesMap();
  activatePrimary('places');
  document.body.classList.add('preview-places-mode');
  document.body.classList.remove('preview-group-mode');
  ui.home?.classList.add('hidden');
  ui.story?.classList.add('hidden');
  ui.explore?.classList.remove('hidden');
  if (generationLabel()) generationLabel().hidden = true;

  if (ui.treeEyebrow) ui.treeEyebrow.textContent = 'Family geography';
  if (ui.treeHeading) ui.treeHeading.textContent = 'Our family map';
  if (ui.viewTitle) ui.viewTitle.textContent = 'Places & Journeys';
  if (ui.viewSummary) ui.viewSummary.textContent = 'Family events, movements and historical context shown on the same geography, while keeping contextual history separate from personal-presence claims.';

  // Keep the core renderer out of its own map mode. The preview map is isolated
  // from the production map so Leaflet cannot cover the preview navigation.
  setNativeMode('ancestry');
  if (ui.treeStatus) ui.treeStatus.textContent = 'Loading family places and journeys...';

  window.setTimeout(async () => {
    try {
      await renderPlacesMap({
        centreId: ui.centreSelect?.value,
        canvas: ui.treeCanvas,
        status: ui.treeStatus,
      });
    } catch (error) {
      if (ui.treeStatus) ui.treeStatus.textContent = `Places & Journeys could not load: ${error?.message || 'unknown error'}`;
      if (ui.treeCanvas) ui.treeCanvas.innerHTML = `<div class="preview-map-loading"><strong>Map unavailable</strong><span>${String(error?.message || 'The map could not be loaded.')}</span><button type="button" class="button secondary" data-preview-map-back>Back to Family Tree</button></div>`;
    }
  }, 80);
}

function leavePlaces() {
  if (!primaryTab('places')?.classList.contains('is-active')) return;
  teardownPlacesMap();
  document.body.classList.remove('preview-places-mode');
}

// Capture Places clicks before the original preview-shell handler switches the
// core archive into production map mode.
document.addEventListener('click', (event) => {
  const places = event.target.closest('[data-preview-view="places"]');
  if (places) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openPlaces();
    return;
  }

  const back = event.target.closest('[data-preview-map-back]');
  if (back) {
    event.preventDefault();
    leavePlaces();
    primaryTab('tree')?.click();
    return;
  }

  const destination = event.target.closest('[data-preview-view]');
  if (destination && destination.dataset.previewView !== 'places') leavePlaces();
}, true);

// The preferred fan is the couple-centred four-quarter fan whenever an eligible
// spouse/partner exists. relationship-rules-v1 keeps a spouse whose relationship
// ended by death, and excludes divorce.
document.addEventListener('change', (event) => {
  if (event.target?.id === 'treeViewMode') ensureCoupleFan();
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-preview-tree-mode="fan"], [data-preview-view="tree"]')) {
    window.setTimeout(ensureCoupleFan, 20);
  }
});

// A centre-person change while Places is open should rebuild the map around that
// person's family without leaving behind the previous Leaflet instance.
ui.centreSelect?.addEventListener('change', () => {
  if (!primaryTab('places')?.classList.contains('is-active')) return;
  window.setTimeout(() => void openPlaces(), 40);
});