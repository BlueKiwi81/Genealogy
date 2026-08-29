const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');

const CARD_LEFT = 441;
const CARD_RIGHT = 609;
const CENTRE_LEFT = 516;
const CENTRE_RIGHT = 684;

function setX(node, value) {
  if (!node) return;
  const wanted = String(value);
  if (node.getAttribute('x') !== wanted) node.setAttribute('x', wanted);
}

function positionCard(card, side) {
  if (!card) return;
  const centre = side === 'right' ? CENTRE_RIGHT : CENTRE_LEFT;
  const left = side === 'right' ? CARD_RIGHT : CARD_LEFT;
  const rect = card.querySelector('.family-centre-card');
  const name = card.querySelector('.family-centre-name');
  const sub = card.querySelector('.family-centre-sub');

  if (rect && rect.getAttribute('x') !== String(left)) rect.setAttribute('x', String(left));
  setX(name, centre);
  setX(sub, centre);

  // A few evidence markers are positioned with absolute SVG coordinates rather
  // than relative to the card. Keep them attached if the card changes sides.
  const evidenceMarker = card.querySelector('.lineage-centre-question');
  if (evidenceMarker && name) {
    const y = Number(name.getAttribute('y') || 559);
    const circle = evidenceMarker.querySelector('circle');
    const text = evidenceMarker.querySelector('text');
    if (circle) {
      circle.setAttribute('cx', String(centre + 63));
      circle.setAttribute('cy', String(y - 22));
    }
    if (text) {
      text.setAttribute('x', String(centre + 63));
      text.setAttribute('y', String(y - 18));
    }
  }
}

// The fan renderer currently assigns the centre person's ancestry to the right
// semicircle and the partner's ancestry to the left. Keep the two centre cards
// on those same sides. This rule is based on person identity, not DOM order, so
// later layout polish cannot silently swap the names away from their own ancestry.
function alignFamilyCentre() {
  const svg = treeCanvas?.querySelector('svg[viewBox="0 0 1200 1200"]');
  if (!svg) return;

  const cards = [...svg.querySelectorAll(':scope > .family-centre-person')];
  cards.forEach((card) => card.removeAttribute('transform'));

  if (cards.length === 2) {
    const centreId = centreSelect?.value || '';
    const centreCard = cards.find((card) => card.dataset.personId === centreId) || cards[0];
    const partnerCard = cards.find((card) => card !== centreCard) || cards[1];
    positionCard(centreCard, 'right');
    positionCard(partnerCard, 'left');

    const link = svg.querySelector('.family-couple-link');
    if (link) {
      if (link.getAttribute('x1') !== String(CENTRE_LEFT)) link.setAttribute('x1', String(CENTRE_LEFT));
      if (link.getAttribute('x2') !== String(CENTRE_RIGHT)) link.setAttribute('x2', String(CENTRE_RIGHT));
    }
  }

  svg.querySelectorAll('.family-child-node .family-child-label').forEach((label) => {
    if (label.textContent) label.textContent = '';
    if (label.getAttribute('display') !== 'none') label.setAttribute('display', 'none');
    if (label.getAttribute('aria-hidden') !== 'true') label.setAttribute('aria-hidden', 'true');
  });
}

function scheduleAlignment() {
  [5, 85, 225, 505, 1005, 2205, 5005].forEach((delay) => setTimeout(alignFamilyCentre, delay));
}

if (treeCanvas) {
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      alignFamilyCentre();
    });
  });
  observer.observe(treeCanvas, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['x', 'y', 'width', 'height'],
  });
}

centreSelect?.addEventListener('change', scheduleAlignment);
document.getElementById('treeViewMode')?.addEventListener('change', scheduleAlignment);
document.addEventListener('genealogy:known-as-updated', scheduleAlignment);
document.addEventListener('genealogy:archive-ready', scheduleAlignment);
scheduleAlignment();
