const canvas = document.getElementById('treeCanvas');

function applySvgLabelSizes() {
  if (!canvas) return;
  canvas.querySelectorAll('text[font-size]').forEach((node) => {
    const size = node.getAttribute('font-size');
    if (size) node.style.fontSize = `${size}px`;
  });
}

if (canvas) {
  new MutationObserver(() => applySvgLabelSizes()).observe(canvas, { childList: true, subtree: true });
  applySvgLabelSizes();
}
