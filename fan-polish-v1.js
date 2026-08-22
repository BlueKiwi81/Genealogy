import './person-photos-v1.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const treeCanvas = document.getElementById('treeCanvas');
const treePanel = document.querySelector('.tree-panel');
const panelHead = document.querySelector('.tree-panel .panel-head');
const centreSelect = document.getElementById('centreSelect');
const personName = document.getElementById('personName');
const personDetails = document.getElementById('personDetails');
const modeSelect = () => document.getElementById('treeViewMode');

const palette = [
  { key: 'paternal', colour: '#e7bea0', ancestry: 'Paternal line', family: "Selected person's paternal line" },
  { key: 'maternal', colour: '#b8d5de', ancestry: 'Maternal line', family: "Selected person's maternal line" },
  { key: 'partner-paternal', colour: '#cbd6a6', family: "Spouse/partner's paternal line" },
  { key: 'partner-maternal', colour: '#d2c2df', family: "Spouse/partner's maternal line" },
];

let people = [];
let relationships = [];
let byCanonicalName = new Map();
let byId = new Map();

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ');
}
function firstLegalName(person) {
  const first = String(person?.given_names || '').trim().split(/\s+/)[0] || '';
  return [first, person?.surname?.trim()].filter(Boolean).join(' ');
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
function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function personById(id) { return byId.get(id) || null; }
function childrenOf(id) {
  return relationships.filter((r) => r.relationship_type === 'parent' && r.person1_id === id).map((r) => personById(r.person2_id)).filter(Boolean);
}
function partnerEdges(id) {
  return relationships.filter((r) => ['spouse','partner','former_spouse'].includes(r.relationship_type) && (r.person1_id === id || r.person2_id === id)).map((relationship) => ({
    relationship,
    person: personById(relationship.person1_id === id ? relationship.person2_id : relationship.person1_id),
  })).filter((entry) => entry.person);
}
function siblingsOf(id) {
  const parentIds = relationships.filter((r) => r.relationship_type === 'parent' && r.person2_id === id).map((r) => r.person1_id);
  const ids = new Set();
  relationships.forEach((r) => {
    if (r.relationship_type === 'parent' && parentIds.includes(r.person1_id) && r.person2_id !== id) ids.add(r.person2_id);
    if (r.relationship_type === 'sibling' && (r.person1_id === id || r.person2_id === id)) ids.add(r.person1_id === id ? r.person2_id : r.person1_id);
  });
  return [...ids].map(personById).filter(Boolean);
}
function rebuildMaps() {
  byCanonicalName = new Map();
  byId = new Map();
  people.forEach((person) => {
    const key = canonicalName(person);
    if (!byCanonicalName.has(key)) byCanonicalName.set(key, person);
    byId.set(person.id, person);
  });
}
function polishFanLabels() {
  if (!treeCanvas || !people.length) return;
  treeCanvas.querySelectorAll('g.person-node[aria-label]').forEach((group) => {
    const person = byCanonicalName.get(group.getAttribute('aria-label') || '');
    const label = group.querySelector('.enhanced-fan-label');
    if (!person || !label) return;
    const desired = compactFanName(person);
    if (label.textContent !== desired) label.textContent = desired;
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
  const desired = items.map((item) => `
    <span class="lineage-key-item">
      <span class="lineage-swatch" style="--lineage-colour:${item.colour}"></span>
      <span>${familyMode ? item.family : item.ancestry}</span>
    </span>`).join('');
  if (legend.innerHTML !== desired) legend.innerHTML = desired;
}
function renderDetails(person) {
  if (!person || !personName || !personDetails) return;
  personName.textContent = canonicalName(person);
  const rows = [];
  if (person.preferred_name && ['documented','strong','family_supplied'].includes(person.preferred_name_status)) rows.push(['Known as', person.preferred_name]);
  const life = [formatDate(person.birth_date), formatDate(person.death_date)].filter(Boolean).join(' - ');
  if (life) rows.push(['Life', life]);
  if (person.birth_place) rows.push(['Birthplace', person.birth_place]);
  if (person.death_place) rows.push(['Death place', person.death_place]);
  if (person.occupation_summary) rows.push(['Occupation', person.occupation_summary]);
  partnerEdges(person.id).forEach(({ person: partner, relationship }) => {
    const label = relationship.relationship_type === 'former_spouse' || relationship.relationship_status === 'ended' ? 'Former spouse' : relationship.relationship_type === 'partner' ? 'Partner' : 'Spouse';
    rows.push([label, `${canonicalName(partner)}${relationship.date_note ? ` - ${relationship.date_note}` : ''}`]);
  });
  rows.push(['Source status', String(person.source_status || 'unresolved').replaceAll('_', ' ')]);
  if (person.narrative_summary) rows.push(['Family note', person.narrative_summary]);
  const children = childrenOf(person.id);
  if (children.length) rows.push(['Children', children.map(canonicalName).join(', ')]);
  const siblings = siblingsOf(person.id);
  if (siblings.length) rows.push(['Siblings', siblings.map(canonicalName).join(', ')]);
  personDetails.innerHTML = rows.map(([label, value]) => `<div class="detail-line"><strong>${esc(label)}</strong>${esc(value)}</div>`).join('');
}
function currentFamilyCandidates() {
  const centre = personById(centreSelect?.value);
  if (!centre) return [];
  const currentPartner = partnerEdges(centre.id).find(({ relationship }) => relationship.relationship_status === 'current' && relationship.relationship_type !== 'former_spouse')?.person;
  return currentPartner ? [centre, currentPartner] : [centre];
}
function resolveClickedPerson(target) {
  const wedge = target.closest('g.person-node[aria-label]');
  if (wedge) return byCanonicalName.get(wedge.getAttribute('aria-label')) || null;
  const centreCard = target.closest('.family-centre-person');
  if (centreCard) {
    const label = centreCard.querySelector('.family-centre-name')?.textContent?.trim();
    return currentFamilyCandidates().find((person) => firstLegalName(person) === label) || null;
  }
  const childNode = target.closest('.family-child-node');
  if (childNode) {
    const firstName = childNode.querySelector('.family-child-label')?.textContent?.trim().replace(/-\s*/g, '-') || '';
    const family = currentFamilyCandidates();
    const children = family.length === 2
      ? childrenOf(family[0].id).filter((child) => childrenOf(family[1].id).some((other) => other.id === child.id))
      : childrenOf(family[0]?.id);
    return children.find((child) => String(child.given_names || '').trim().split(/\s+/)[0] === firstName) || null;
  }
  return null;
}
function polishRenderedTree() {
  polishFanLabels();
  renderLegend();
}
async function loadData() {
  const [peopleResult, relationshipResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,preferred_name,preferred_name_status,birth_date,death_date,birth_place,death_place,occupation_summary,narrative_summary,source_status'),
    supabase.from('relationships').select('*'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationshipResult.error) throw relationshipResult.error;
  people = peopleResult.data || [];
  relationships = relationshipResult.data || [];
  rebuildMaps();
  polishRenderedTree();
}

if (treeCanvas) {
  const observer = new MutationObserver(() => window.setTimeout(polishRenderedTree, 0));
  observer.observe(treeCanvas, { childList: true });
  treeCanvas.addEventListener('click', (event) => {
    const person = resolveClickedPerson(event.target);
    if (person) renderDetails(person);
  });
  treeCanvas.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const person = resolveClickedPerson(event.target);
    if (person) { event.preventDefault(); renderDetails(person); }
  });
}

document.addEventListener('change', (event) => {
  if (event.target === modeSelect() || event.target?.id === 'generationDepth' || event.target?.id === 'centreSelect') {
    window.setTimeout(polishRenderedTree, 60);
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session && !people.length) loadData().catch(() => {});
});
const { data: { session } } = await supabase.auth.getSession();
if (session) await loadData().catch(() => {});
