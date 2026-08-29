const FAMILY_NOTE_LABELS = new Set(['family note', 'familienota']);
const pending = new WeakMap();
let scanQueued = false;

function language() {
  return window.GenealogyI18n?.language || document.documentElement.lang || 'en';
}

function valueTextNode(line, strong) {
  return [...line.childNodes].find((node) => node instanceof Text && node !== strong && (node.nodeValue || '').trim()) || null;
}

function preserveWhitespace(original, translated) {
  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';
  return `${leading}${translated}${trailing}`;
}

async function translateFamilyNote(line) {
  const strong = line.querySelector(':scope > strong');
  if (!strong) return;
  const label = String(strong.textContent || '').trim().toLowerCase();
  if (!FAMILY_NOTE_LABELS.has(label)) return;

  const node = valueTextNode(line, strong);
  if (!node) return;

  if (!line.dataset.aiFamilyNoteSource) {
    line.dataset.aiFamilyNoteSource = node.nodeValue || '';
  }
  const source = line.dataset.aiFamilyNoteSource;

  if (language() !== 'af') {
    if (node.nodeValue !== source) node.nodeValue = source;
    line.dataset.aiFamilyNoteRendered = 'en';
    delete line.dataset.aiFamilyNoteAttempt;
    return;
  }

  const clean = source.trim();
  if (!clean || clean.length < 4) return;
  if (pending.has(line)) return;

  const attemptKey = `af|${clean}`;
  if (line.dataset.aiFamilyNoteAttempt === attemptKey) return;
  line.dataset.aiFamilyNoteAttempt = attemptKey;

  const task = (async () => {
    try {
      const translated = await window.GenealogyI18n?.translateNarrative?.(clean, 'family_note');
      if (!translated || translated === clean || language() !== 'af' || !node.isConnected) return;
      const desired = preserveWhitespace(source, translated);
      if (node.nodeValue !== desired) node.nodeValue = desired;
      line.dataset.aiFamilyNoteRendered = 'af';
    } finally {
      pending.delete(line);
    }
  })();

  pending.set(line, task);
}

function scan() {
  scanQueued = false;
  document.querySelectorAll('.detail-line').forEach((line) => void translateFamilyNote(line));
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  window.setTimeout(scan, 0);
}

document.addEventListener('genealogy:language-changed', queueScan);

const observer = new MutationObserver(queueScan);
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

queueScan();
