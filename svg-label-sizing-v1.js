const canvas = document.getElementById('treeCanvas');

function compactFrontierName(value) {
  let text = String(value || '').trim();
  if (!text) return text;

  // Frontier labels often carry an evidence-grade explanation after a spaced
  // hyphen. That belongs in the popup/title, not around the fan wedge.
  text = text.split(/\s+-\s+/)[0].trim();

  // A few older labels embedded lifespan evidence directly in the label.
  // Keep the identity here and let the date line carry chronology.
  text = text
    .replace(/,\s*b\.\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}.*$/i, '')
    .replace(/,\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s*-\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}.*$/i, '')
    .trim();

  if (text.length > 52) return `${text.slice(0, 49).trimEnd()}...`;
  return text;
}

function compactFrontierDate(value) {
  const text = String(value || '').trim();
  if (!text) return text;

  const parts = text.split(' | ');
  const suffix = parts.length > 1 ? parts.pop() : '';
  let core = parts.join(' | ').trim();

  if (core.length > 34) {
    const birth = core.match(/\bb\.\s*[^;,.]*?(\d{4})\b/i);
    const death = core.match(/\bd\.\s*[^;,.]*?(\d{4})\b/i);
    core = birth && death ? `${birth[1]}-${death[1]}` : 'dates in details';
  }

  return [core, suffix].filter(Boolean).join(' | ');
}

function applySvgLabelSizes() {
  if (!canvas) return;
  canvas.querySelectorAll('text[font-size]').forEach((node) => {
    const size = node.getAttribute('font-size');
    if (size) node.style.fontSize = `${size}px`;
  });

  canvas.querySelectorAll('text.frontier-fan-label textPath').forEach((node) => {
    node.textContent = compactFrontierName(node.textContent);
  });
  canvas.querySelectorAll('text.frontier-fan-date textPath').forEach((node) => {
    node.textContent = compactFrontierDate(node.textContent);
  });
}

if (canvas) {
  new MutationObserver(() => applySvgLabelSizes()).observe(canvas, { childList: true, subtree: true });
  applySvgLabelSizes();
}
