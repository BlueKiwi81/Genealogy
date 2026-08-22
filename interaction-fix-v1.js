import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const canvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
const personName = document.getElementById('personName');
const personDetails = document.getElementById('personDetails');

let people = [];
let relationships = [];
let byId = new Map();
let byCanonical = new Map();

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ');
}
function firstLegalName(person) {
  const first = String(person?.given_names || '').trim().split(/\s+/)[0] || '';
  return [first, person?.surname?.trim()].filter(Boolean).join(' ');
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
  if (wedge) return byCanonical.get(wedge.getAttribute('aria-label')) || null;

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
async function loadData() {
  const [peopleResult, relationResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,preferred_name,preferred_name_status,birth_date,death_date,birth_place,death_place,occupation_summary,narrative_summary,source_status'),
    supabase.from('relationships').select('*'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationResult.error) throw relationResult.error;
  people = peopleResult.data || [];
  relationships = relationResult.data || [];
  byId = new Map(people.map((person) => [person.id, person]));
  byCanonical = new Map(people.map((person) => [canonicalName(person), person]));
}

canvas?.addEventListener('click', (event) => {
  const person = resolveClickedPerson(event.target);
  if (person) renderDetails(person);
});

canvas?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const person = resolveClickedPerson(event.target);
  if (person) { event.preventDefault(); renderDetails(person); }
});

const { data: { session } } = await supabase.auth.getSession();
if (session) await loadData().catch(() => {});
supabase.auth.onAuthStateChange((_event, nextSession) => { if (nextSession && !people.length) loadData().catch(() => {}); });
