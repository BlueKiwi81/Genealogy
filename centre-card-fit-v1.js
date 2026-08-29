import { supabase } from './supabase-client-v1.js';

const treeCanvas = document.getElementById('treeCanvas');
let fitTimer = null;
let mapAccessTimer = null;
let mapAnchorPersonId = null;
let mapFeatureEnabled = false;

function fitCentreCards() {
  const svg = treeCanvas?.querySelector(':scope > svg');
  if (!svg) return;

  const disc = svg.querySelector('.family-centre-disc');
  const cards = [...svg.querySelectorAll('.family-centre-person')];
  if (!disc || !cards.length) return;

  // This module used to apply a second, slightly different centre layout after
  // centre-family-polish had already positioned the couple. That produced the
  // visible "correct -> wrong -> correct -> wrong" flicker while the delayed
  // settling timers fired. Keep one canonical geometry across both modules.
  disc.setAttribute('r', '166');

  if (cards.length === 2) {
    // Preserve the proven outer edges of the stable layout, but use more of the
    // unused space towards the middle. This gives longer name combinations more
    // room without pushing either card back through the edge of the centre disc.
    const outerLeft = 441;
    const outerRight = 759;
    const cardWidth = 150;
    const gap = outerRight - outerLeft - (cardWidth * 2); // 18px
    const cardLefts = [outerLeft, outerLeft + cardWidth + gap];
    const centres = cardLefts.map((left) => left + cardWidth / 2);
    const cardHeight = 50;
    const cardY = 530;
    const linkY = 555;

    cards.forEach((card, index) => {
      const x = centres[index];
      const rect = card.querySelector('.family-centre-card');
      const name = card.querySelector('.family-centre-name');
      const sub = card.querySelector('.family-centre-sub');
      if (!rect || !name) return;

      rect.setAttribute('x', String(cardLefts[index]));
      rect.setAttribute('y', String(cardY));
      rect.setAttribute('width', String(cardWidth));
      rect.setAttribute('height', String(cardHeight));
      rect.setAttribute('rx', '12');

      name.setAttribute('x', String(x));
      name.setAttribute('y', String(cardY + 29));
      const nameLength = (name.textContent || '').trim().length;
      name.setAttribute('font-size', nameLength > 24 ? '9.8' : nameLength > 20 ? '10.6' : nameLength > 17 ? '11.5' : '12.5');

      if (sub) {
        name.setAttribute('y', String(cardY + 20));
        sub.setAttribute('x', String(x));
        sub.setAttribute('y', String(cardY + 36));
      }
    });

    const link = svg.querySelector('.family-couple-link');
    if (link) {
      link.setAttribute('x1', String(centres[0]));
      link.setAttribute('x2', String(centres[1]));
      link.setAttribute('y1', String(linkY));
      link.setAttribute('y2', String(linkY));
    }

    const connectorGroup = svg.querySelector('.family-household-connectors');
    const connectorLines = connectorGroup ? [...connectorGroup.querySelectorAll('.family-household-line')] : [];
    if (connectorLines[0]) connectorLines[0].setAttribute('y1', String(linkY));

    const firstCard = cards[0];
    if (firstCard?.parentElement === svg) {
      if (connectorGroup) svg.insertBefore(connectorGroup, firstCard);
      if (link) svg.insertBefore(link, firstCard);
    }
    return;
  }

  const card = cards[0];
  const rect = card?.querySelector('.family-centre-card');
  const name = card?.querySelector('.family-centre-name');
  if (!rect || !name) return;
  rect.setAttribute('x', '528');
  rect.setAttribute('y', '545');
  rect.setAttribute('width', '144');
  rect.setAttribute('height', '50');
  rect.setAttribute('rx', '12');
  name.setAttribute('x', '600');
  name.setAttribute('y', '574');
}

function scheduleFit(delay = 0) {
  window.clearTimeout(fitTimer);
  fitTimer = window.setTimeout(fitCentreCards, delay);
}

function scheduleFitBurst(delays = [0, 80, 220, 500, 1000, 2200, 5000]) {
  delays.forEach((delay) => window.setTimeout(() => scheduleFit(0), delay));
}

function isMapAnchorProfile() {
  const select = document.getElementById('centreSelect');
  return Boolean(mapFeatureEnabled && mapAnchorPersonId && select?.value === mapAnchorPersonId);
}

async function loadMapFeatureConfig() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    mapAnchorPersonId = null;
    mapFeatureEnabled = false;
    scheduleMapAccess(0);
    return;
  }

  const { data, error } = await supabase
    .from('app_feature_config')
    .select('anchor_person_id,is_enabled')
    .eq('feature_key', 'family_map_anchor')
    .maybeSingle();

  if (error || !data) {
    mapAnchorPersonId = null;
    mapFeatureEnabled = false;
  } else {
    mapAnchorPersonId = data.anchor_person_id || null;
    mapFeatureEnabled = data.is_enabled !== false;
  }
  scheduleMapAccess(0);
}

function syncMapAccess() {
  const select = document.getElementById('centreSelect');
  const switcher = document.getElementById('treePerspectiveSwitch');
  const modeSelect = document.getElementById('treeViewMode');
  if (!select || !switcher || !modeSelect) return;

  const allowed = isMapAnchorProfile();
  const mapButton = switcher.querySelector('[data-tree-perspective="map"]');
  const mapOption = modeSelect.querySelector('option[value="map"]');

  if (mapButton) {
    mapButton.hidden = !allowed;
    mapButton.style.display = allowed ? '' : 'none';
    mapButton.disabled = !allowed;
    mapButton.setAttribute('aria-hidden', String(!allowed));

    if (allowed) {
      const title = mapButton.querySelector('.explorer-mode-title');
      const copy = mapButton.querySelector('.explorer-mode-copy');
      if (title) title.textContent = 'Map (testing)';
      if (copy) copy.textContent = 'Work in progress';
    }
  }

  if (mapOption) mapOption.disabled = !allowed;

  const helper = switcher.closest('[data-explorer-perspective]')?.querySelector('.explorer-helper');
  if (helper) {
    helper.textContent = allowed
      ? 'Choose the family fan, one-person ancestry, family snapshot or the experimental map around the same centre.'
      : 'Choose the family fan, one-person ancestry or family snapshot around the same centre.';
  }

  if (!allowed && modeSelect.value === 'map') {
    modeSelect.value = 'family';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function scheduleMapAccess(delay = 0) {
  window.clearTimeout(mapAccessTimer);
  mapAccessTimer = window.setTimeout(syncMapAccess, delay);
}

if (treeCanvas) {
  const observer = new MutationObserver((mutations) => {
    const svgChanged = mutations.some((mutation) => [...mutation.addedNodes]
      .some((node) => node.nodeName?.toLowerCase() === 'svg'));
    if (svgChanged) scheduleFitBurst();
  });
  observer.observe(treeCanvas, { childList: true, subtree: false });
}

const controlsObserver = new MutationObserver(() => scheduleMapAccess(20));
controlsObserver.observe(document.body, { childList: true, subtree: true });

// Returning from Map/Family snapshot can replace the fan after the initial
// mutation callback has already run. Reapply the same canonical centre geometry
// through the same settling moments used by centre-family-polish. Because this
// module loads afterwards, the extended geometry is the last write at each step
// rather than visibly alternating between two layouts.
document.addEventListener('change', (event) => {
  if (event.target?.id === 'treeViewMode') {
    if (event.target.value === 'family' || event.target.value === 'ancestry') {
      scheduleFitBurst();
    }
    [0, 60, 180, 450].forEach((delay) => window.setTimeout(syncMapAccess, delay));
  }

  if (event.target?.id === 'centreSelect') {
    scheduleFitBurst();
    [0, 60, 180, 450].forEach((delay) => window.setTimeout(syncMapAccess, delay));
  }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-tree-perspective]');
  if (!button) return;
  if (button.dataset.treePerspective === 'fan' || button.dataset.treePerspective === 'ancestry') {
    scheduleFitBurst();
  }
});

scheduleFitBurst();
[0, 120, 400, 1000, 2500, 5000].forEach((delay) => window.setTimeout(syncMapAccess, delay));

document.addEventListener('genealogy:archive-ready', () => {
  scheduleFitBurst([0, 30, 180, 700]);
  void loadMapFeatureConfig();
  [0, 100, 350, 900].forEach((delay) => window.setTimeout(syncMapAccess, delay));
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    mapAnchorPersonId = null;
    mapFeatureEnabled = false;
    scheduleMapAccess(0);
  }
});

window.addEventListener('load', () => {
  scheduleFitBurst([250, 1300]);
  [100, 500, 1500].forEach((delay) => window.setTimeout(syncMapAccess, delay));
});
