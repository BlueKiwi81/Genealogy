const viewport = document.getElementById('treeSnapshotViewport');

function compactGivenLabel(value) {
  const text = String(value || '').trim();
  return text ? text.split(/\s+/)[0] : '';
}

function setTextOnce(node) {
  if (!node) return;
  const current = String(node.textContent || '').trim();
  if (!node.dataset.fullLabel && current) node.dataset.fullLabel = current;
  const full = node.dataset.fullLabel || current;
  const wanted = compactGivenLabel(full);
  if (wanted && current !== wanted) node.textContent = wanted;
  if (full) node.setAttribute('aria-label', full);
}

function fitFamilyCentre() {
  const svg = viewport?.querySelector('.tree-snapshot-svg');
  if (!svg) return;

  const centreDisc = svg.querySelector('.tree-snapshot-centre');
  const cards = [...svg.querySelectorAll('.tree-snapshot-centre-card')];
  const centreNames = [...svg.querySelectorAll('.tree-snapshot-centre-name')];
  const coupleLink = svg.querySelector('.tree-snapshot-couple-link');
  const childCircles = [...svg.querySelectorAll('.tree-snapshot-child')];
  const childInitials = [...svg.querySelectorAll('.tree-snapshot-child-initial')];
  const childLabels = [...svg.querySelectorAll('.tree-snapshot-child-label')];

  if (cards.length < 2 || centreNames.length < 2) return;

  centreDisc?.setAttribute('r', '168');

  const coupleX = [526, 674];
  cards.slice(0, 2).forEach((rect, index) => {
    rect.setAttribute('x', String(coupleX[index] - 63));
    rect.setAttribute('y', '526');
    rect.setAttribute('width', '126');
    rect.setAttribute('height', '48');
    rect.setAttribute('rx', '14');
  });

  centreNames.slice(0, 2).forEach((text, index) => {
    setTextOnce(text);
    text.setAttribute('x', String(coupleX[index]));
    text.setAttribute('y', '556');
    text.style.fontSize = '16px';
  });

  if (coupleLink) {
    coupleLink.setAttribute('x1', '589');
    coupleLink.setAttribute('y1', '550');
    coupleLink.setAttribute('x2', '611');
    coupleLink.setAttribute('y2', '550');
  }

  const count = childCircles.length;
  if (!count) return;
  const span = count === 1 ? 0 : Math.min(216, Math.max(86, (count - 1) * 54));

  childCircles.forEach((circle, index) => {
    const x = count === 1 ? 600 : 600 - span / 2 + span * index / (count - 1);
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', '652');
    circle.setAttribute('r', '18');

    const initial = childInitials[index];
    if (initial) {
      initial.setAttribute('x', String(x));
      initial.setAttribute('y', '657');
      initial.style.fontSize = '14px';
    }

    const label = childLabels[index];
    if (label) {
      setTextOnce(label);
      label.setAttribute('x', String(x));
      label.setAttribute('y', '683');
      const length = String(label.textContent || '').length;
      label.style.fontSize = length > 10 ? '8.8px' : count >= 5 ? '9.5px' : '10.5px';
    }
  });
}

let frame = null;
function scheduleFit() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = null;
    fitFamilyCentre();
  });
}

if (viewport) {
  const observer = new MutationObserver(scheduleFit);
  observer.observe(viewport, { childList: true, subtree: true });
  scheduleFit();
}
