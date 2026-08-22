const treeCanvas = document.getElementById('treeCanvas');

function ensureCentreClip(svg) {
  const ns = 'http://www.w3.org/2000/svg';
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(ns, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  let clip = defs.querySelector('#familyCentreClip');
  if (!clip) {
    clip = document.createElementNS(ns, 'clipPath');
    clip.setAttribute('id', 'familyCentreClip');
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '600');
    circle.setAttribute('cy', '600');
    circle.setAttribute('r', '164');
    clip.appendChild(circle);
    defs.appendChild(clip);
  }
  return clip;
}

function childFirstName(labelText) {
  return String(labelText || '').trim().split(/\s+/)[0] || '';
}

function setChildLabel(label, firstName, x) {
  const ns = 'http://www.w3.org/2000/svg';
  const currentKey = `${firstName}|${x}`;
  if (label.dataset.centrePolishKey === currentKey) return;
  label.dataset.centrePolishKey = currentKey;
  label.textContent = '';
  label.setAttribute('x', String(x));
  label.setAttribute('y', '700');
  label.setAttribute('text-anchor', 'middle');

  if (firstName.includes('-') && firstName.length > 10) {
    const [left, ...rest] = firstName.split('-');
    const right = rest.join('-');
    const line1 = document.createElementNS(ns, 'tspan');
    line1.setAttribute('x', String(x));
    line1.setAttribute('y', '696');
    line1.textContent = `${left}-`;
    label.appendChild(line1);
    const line2 = document.createElementNS(ns, 'tspan');
    line2.setAttribute('x', String(x));
    line2.setAttribute('y', '706');
    line2.textContent = right;
    label.appendChild(line2);
    return;
  }

  label.textContent = firstName;
}

function polishFamilyCentre() {
  const svg = treeCanvas?.querySelector('svg');
  if (!svg) return;
  const disc = svg.querySelector('.family-centre-disc');
  const nodes = [...svg.querySelectorAll('.family-child-node')];
  if (!disc || !nodes.length) return;

  disc.setAttribute('r', '166');
  ensureCentreClip(svg);

  const spacing = nodes.length <= 5 ? 52 : 44;
  const startX = 600 - ((nodes.length - 1) * spacing) / 2;

  nodes.forEach((node, index) => {
    const x = startX + index * spacing;
    const circle = node.querySelector('.family-child-circle');
    const initial = node.querySelector('.family-child-initial');
    const label = node.querySelector('.family-child-label');
    if (!circle || !initial || !label) return;

    const firstName = childFirstName(label.textContent);
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', '664');
    circle.setAttribute('r', '21');
    initial.setAttribute('x', String(x));
    initial.setAttribute('y', '668');
    setChildLabel(label, firstName, x);
    node.setAttribute('clip-path', 'url(#familyCentreClip)');
  });
}

if (treeCanvas) {
  // Watch only for the rendered SVG being replaced. Observing descendants caused
  // this visual polish to trigger itself repeatedly in Safari.
  const observer = new MutationObserver(() => window.setTimeout(polishFamilyCentre, 0));
  observer.observe(treeCanvas, { childList: true });
  window.addEventListener('load', () => window.setTimeout(polishFamilyCentre, 300));
}
