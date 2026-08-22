import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const treeCanvas = document.getElementById('treeCanvas');
const treePanel = document.querySelector('.tree-panel');
const panelHead = document.querySelector('.tree-panel .panel-head');
const modeSelect = () => document.getElementById('treeViewMode');

const palette = [
  { key: 'paternal', colour: '#e7bea0', ancestry: 'Paternal line', family: "Selected person's paternal line" },
  { key: 'maternal', colour: '#b8d5de', ancestry: 'Maternal line', family: "Selected person's maternal line" },
  { key: 'partner-paternal', colour: '#cbd6a6', family: "Spouse/partner's paternal line" },
  { key: 'partner-maternal', colour: '#d2c2df', family: "Spouse/partner's maternal line" },
];

let people = [];
let byCanonicalName = new Map();

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ');
}

function middleInitial(token) {
  const pieces = String(token || '').split('-').filter(Boolean);
  return pieces.map((piece) => {
    const match = piece.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/);
    return match ? match[0].toUpperCase() : '';
  }).filter(Boolean).join('-');
}

function compactFanName(person) {
  const given = String(person?.given_names || '').trim().split(/\s+/).filter(Boolean);
  const first = given.shift() || '';
  const initials = given.map(middleInitial).filter(Boolean).join(' ');
  return [first, initials, person?.surname?.trim()].filter(Boolean).join(' ');
}

function rebuildNameMap() {
  byCanonicalName = new Map();
  people.forEach((person) => {
    const key = canonicalName(person);
    if (!byCanonicalName.has(key)) byCanonicalName.set(key, person);
  });
}

function polishFanLabels() {
  if (!treeCanvas || !people.length) return;
  treeCanvas.querySelectorAll('g.person-node[aria-label]').forEach((group) => {
    const fullName = group.getAttribute('aria-label') || '';
    const person = byCanonicalName.get(fullName);
    const label = group.querySelector('.enhanced-fan-label');
    if (person && label) label.textContent = compactFanName(person);
  });
}

function ensureLegend() {
  if (!treePanel || !panelHead) return null;
  let legend = document.getElementById('lineageLegend');
  if (legend) return legend;
  legend = document.createElement('div');
  legend.id = 'lineageLegend';
  legend.className = 'lineage-legend';
  legend.setAttribute('aria-label', 'Lineage colour key');
  panelHead.insertAdjacentElement('afterend', legend);
  return legend;
}

function familyFanIsVisible() {
  const svg = treeCanvas?.querySelector('svg');
  return Boolean(svg?.getAttribute('aria-label')?.startsWith('Family fan'));
}

function renderLegend() {
  const legend = ensureLegend();
  if (!legend) return;
  const familyMode = familyFanIsVisible();
  const items = familyMode ? palette : palette.slice(0, 2);
  legend.innerHTML = items.map((item) => `
    <span class="lineage-key-item">
      <span class="lineage-swatch" style="--lineage-colour:${item.colour}"></span>
      <span>${familyMode ? item.family : item.ancestry}</span>
    </span>`).join('');
}

function polishRenderedTree() {
  polishFanLabels();
  renderLegend();
}

async function loadPeople() {
  const { data, error } = await supabase
    .from('people')
    .select('id,given_names,surname');
  if (error) throw error;
  people = data || [];
  rebuildNameMap();
  polishRenderedTree();
}

if (treeCanvas) {
  const observer = new MutationObserver(() => window.setTimeout(polishRenderedTree, 0));
  observer.observe(treeCanvas, { childList: true, subtree: true });
}

document.addEventListener('change', (event) => {
  if (event.target === modeSelect() || event.target?.id === 'generationDepth' || event.target?.id === 'centreSelect') {
    window.setTimeout(polishRenderedTree, 60);
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session && !people.length) loadPeople().catch(() => {});
});

const { data: { session } } = await supabase.auth.getSession();
if (session) await loadPeople().catch(() => {});
