import { supabase } from '../supabase-client-v1.js';
import { preferredFamilyPartnerEntry } from '../relationship-rules-v1.js';

const cache = {
  people: [],
  relationships: [],
  byId: new Map(),
  loadedAt: 0,
};

function active(item) {
  return item?.is_active !== false;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function person(id) {
  return cache.byId.get(id) || null;
}

function name(item) {
  if (!item) return 'Unknown';
  return [item.given_names?.trim(), item.surname?.trim()].filter(Boolean).join(' ') || 'Unknown';
}

function years(item) {
  const birth = item?.birth_date?.slice(0, 4) || '';
  const death = item?.death_date?.slice(0, 4) || '';
  if (birth && death) return `${birth}-${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return '';
}

function parentEdges(id) {
  return cache.relationships
    .filter((relationship) => active(relationship) && relationship.relationship_type === 'parent' && relationship.person2_id === id)
    .map((relationship) => ({ relationship, person: person(relationship.person1_id) }))
    .filter((entry) => entry.person);
}

function parentPair(id) {
  const candidates = parentEdges(id);
  const output = [null, null];
  const used = new Set();
  const father = candidates.findIndex((entry) => entry.person.gender === 'male');
  const mother = candidates.findIndex((entry) => entry.person.gender === 'female');
  if (father >= 0) { output[0] = candidates[father]; used.add(father); }
  if (mother >= 0) { output[1] = candidates[mother]; used.add(mother); }
  candidates.forEach((entry, index) => {
    if (used.has(index)) return;
    const open = output.findIndex((value) => value === null);
    if (open >= 0) output[open] = entry;
  });
  return output;
}

function childPeople(id) {
  return cache.relationships
    .filter((relationship) => active(relationship) && relationship.relationship_type === 'parent' && relationship.person1_id === id)
    .map((relationship) => person(relationship.person2_id))
    .filter(Boolean)
    .sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999'));
}

function partnerEntries(id) {
  return cache.relationships
    .filter((relationship) => active(relationship)
      && ['spouse', 'partner', 'former_spouse'].includes(relationship.relationship_type)
      && (relationship.person1_id === id || relationship.person2_id === id))
    .map((relationship) => ({
      relationship,
      person: person(relationship.person1_id === id ? relationship.person2_id : relationship.person1_id),
    }))
    .filter((entry) => entry.person);
}

function currentPartnerEntry(id) {
  return preferredFamilyPartnerEntry(partnerEntries(id)) || null;
}

function coupleChildren(a, b) {
  const left = new Set(childPeople(a.id).map((child) => child.id));
  if (!b) return [...left].map(person).filter(Boolean);
  const right = new Set(childPeople(b.id).map((child) => child.id));
  const shared = [...left].filter((id) => right.has(id));
  const ids = shared.length ? shared : [...new Set([...left, ...right])];
  return ids.map(person).filter(Boolean).sort((x, y) => (x.birth_date || '9999').localeCompare(y.birth_date || '9999'));
}

async function loadData(force = false) {
  if (!force && cache.loadedAt && Date.now() - cache.loadedAt < 15000) return;
  const [peopleResult, relationshipsResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,preferred_name,gender,birth_date,death_date,is_active'),
    supabase.from('relationships').select('person1_id,person2_id,relationship_type,relationship_status,source_status,is_active'),
  ]);
  if (peopleResult.error) throw peopleResult.error;
  if (relationshipsResult.error) throw relationshipsResult.error;
  cache.people = (peopleResult.data || []).filter(active);
  cache.relationships = (relationshipsResult.data || []).filter(active);
  cache.byId = new Map(cache.people.map((item) => [item.id, item]));
  cache.loadedAt = Date.now();
}

function card(item, role = '', compact = false) {
  if (!item) {
    return `<div class="preview-group-person is-empty${compact ? ' is-compact' : ''}"><span>${role ? esc(role) : 'Unknown'}</span><strong>Unknown</strong></div>`;
  }
  return `<button type="button" class="preview-group-person${compact ? ' is-compact' : ''}" data-preview-group-person="${esc(item.id)}">
    ${role ? `<span class="preview-group-role">${esc(role)}</span>` : ''}
    <strong>${esc(name(item))}</strong>
    ${years(item) ? `<small>${esc(years(item))}</small>` : ''}
  </button>`;
}

function parentBranch(focus, heading) {
  const parents = parentPair(focus.id);
  return `<section class="preview-group-branch">
    <p class="preview-group-branch-title">${esc(heading)}</p>
    <div class="preview-group-parent-grid">
      ${parents.map((entry) => {
        const parent = entry?.person || null;
        const grandparents = parent ? parentPair(parent.id) : [null, null];
        return `<div class="preview-group-parent-column">
          <div class="preview-group-grandparents">${grandparents.map((grand) => card(grand?.person || null, 'Grandparent', true)).join('')}</div>
          <span class="preview-group-line"></span>
          ${card(parent, 'Parent')}
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

function descendantBranch(child) {
  const partnerEntry = currentPartnerEntry(child.id);
  const partner = partnerEntry?.person || null;
  const grandchildren = coupleChildren(child, partner);
  return `<article class="preview-group-descendant">
    <div class="preview-group-couple">
      ${card(child, 'Child')}
      ${partner ? `<span class="preview-group-couple-link"></span>${card(partner, partnerEntry.relationship.relationship_type === 'partner' ? 'Partner' : 'Spouse')}` : ''}
    </div>
    ${grandchildren.length ? `<span class="preview-group-line"></span><div class="preview-group-grandchildren">${grandchildren.map((grandchild) => card(grandchild, 'Grandchild', true)).join('')}</div>` : '<p class="preview-group-none">No children recorded</p>'}
  </article>`;
}

export async function renderFamilyGroup({ centreId, canvas, title, summary, status, onSelect }) {
  if (!centreId || !canvas) return;
  status.textContent = 'Building focussed family group...';
  await loadData();
  const focus = person(centreId);
  if (!focus) throw new Error('The selected person is not available in the family group.');
  const partnerEntry = currentPartnerEntry(focus.id);
  const partner = partnerEntry?.person || null;
  const children = coupleChildren(focus, partner);

  const ancestry = `<div class="preview-group-ancestry">
    ${parentBranch(focus, `${name(focus)} - parents and grandparents`)}
    ${partner ? parentBranch(partner, `${name(partner)} - parents and grandparents`) : '<section class="preview-group-branch"><p class="preview-group-branch-title">Partner ancestry</p><p class="preview-group-none">No current partner is linked.</p></section>'}
  </div>`;

  const waist = `<section class="preview-group-waist">
    <p class="preview-group-kicker">Focus generation</p>
    <div class="preview-group-focus-couple">
      ${card(focus, 'Selected person')}
      ${partner ? `<span class="preview-group-couple-link is-wide"></span>${card(partner, partnerEntry.relationship.relationship_type === 'partner' ? 'Partner' : 'Spouse')}` : ''}
    </div>
  </section>`;

  const descendants = `<section class="preview-group-descendants">
    <p class="preview-group-kicker">Children, partners and grandchildren</p>
    ${children.length ? `<div class="preview-group-descendant-grid">${children.map(descendantBranch).join('')}</div>` : '<p class="preview-group-none">No children are currently recorded for this focus family.</p>'}
  </section>`;

  canvas.innerHTML = `<div class="preview-group-scroll"><div class="preview-family-group">
    <p class="preview-group-kicker">Parents and grandparents</p>
    ${ancestry}
    <span class="preview-group-neck"></span>
    ${waist}
    <span class="preview-group-neck"></span>
    ${descendants}
  </div></div>`;

  canvas.querySelectorAll('[data-preview-group-person]').forEach((button) => {
    button.addEventListener('click', () => onSelect?.(button.dataset.previewGroupPerson));
  });

  if (title) title.textContent = partner ? `${name(focus)} & ${name(partner)}` : name(focus);
  if (summary) summary.textContent = 'Parents and grandparents narrow toward the selected person and partner. Their children and later descendants expand below. Siblings are intentionally kept out of the focus generation.';
  if (status) status.textContent = `${children.length} child${children.length === 1 ? '' : 'ren'} shown for the selected family.`;
}
