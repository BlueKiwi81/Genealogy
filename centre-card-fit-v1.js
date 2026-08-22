const treeCanvas = document.getElementById('treeCanvas');
let fitTimer = null;

function fitCentreCards() {
  const svg = treeCanvas?.querySelector(':scope > svg');
  if (!svg) return;

  const disc = svg.querySelector('.family-centre-disc');
  const cards = [...svg.querySelectorAll('.family-centre-person')];
  if (!disc || !cards.length) return;

  // Keep the couple cards comfortably inside the circular centre rather than
  // allowing their rounded corners to sit on or beyond the circumference.
  disc.setAttribute('r', '166');

  const centres = cards.length === 2 ? [522, 678] : [600];
  const cardWidth = cards.length === 2 ? 132 : 144;
  const halfWidth = cardWidth / 2;
  const cardY = cards.length === 2 ? 530 : 545;
  const cardHeight = 50;

  cards.forEach((card, index) => {
    const x = centres[index] ?? 600;
    const rect = card.querySelector('.family-centre-card');
    const name = card.querySelector('.family-centre-name');
    const sub = card.querySelector('.family-centre-sub');
    if (!rect || !name || !sub) return;

    rect.setAttribute('x', String(x - halfWidth));
    rect.setAttribute('y', String(cardY));
    rect.setAttribute('width', String(cardWidth));
    rect.setAttribute('height', String(cardHeight));
    rect.setAttribute('rx', '12');

    name.setAttribute('x', String(x));
    name.setAttribute('y', String(cardY + 21));
    const nameLength = (name.textContent || '').trim().length;
    name.setAttribute('font-size', nameLength > 20 ? '10.5' : nameLength > 16 ? '11.5' : '12.5');

    sub.setAttribute('x', String(x));
    sub.setAttribute('y', String(cardY + 37));
  });

  const link = svg.querySelector('.family-couple-link');
  if (link && cards.length === 2) {
    link.setAttribute('x1', '590');
    link.setAttribute('x2', '610');
    link.setAttribute('y1', '555');
    link.setAttribute('y2', '555');
  }
}

function scheduleFit(delay = 0) {
  window.clearTimeout(fitTimer);
  fitTimer = window.setTimeout(fitCentreCards, delay);
}

if (treeCanvas) {
  const observer = new MutationObserver((mutations) => {
    const svgChanged = mutations.some((mutation) => [...mutation.addedNodes]
      .some((node) => node.nodeName?.toLowerCase() === 'svg'));
    if (svgChanged) scheduleFit(0);
  });
  observer.observe(treeCanvas, { childList: true, subtree: false });
  window.addEventListener('load', () => scheduleFit(150));
  scheduleFit(150);
}
