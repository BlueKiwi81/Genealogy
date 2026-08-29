import { supabase } from './supabase-client-v1.js';
import { isDivorcedRelationship } from './relationship-rules-v1.js';
import { recordName, surnameSearchText } from './person-name-v1.js';

const select = document.getElementById('centreSelect');
const state = { people: [], relationships: [], byId: new Map(), viewerId: null, distances: new Map(), loaded: false };

function nameOf(p) { return recordName(p, { unknown: 'Unnamed person' }); }
function years(p) {
  const b = p?.birth_date?.slice(0, 4) || '';
  const d = p?.death_date?.slice(0, 4) || '';
  return b && d ? `${b}-${d}` : b ? `b. ${b}` : d ? `d. ${d}` : '';
}
function labelOf(p) { const y = years(p); return `${nameOf(p)}${y ? ` (${y})` : ''}`; }
function active(r) { return r?.is_active !== false; }
function searchText(p) { return [nameOf(p), surnameSearchText(p), p?.preferred_name, p?.birth_place, years(p)].filter(Boolean).join(' ').toLowerCase(); }
function getPerson(id) { return state.byId.get(id) || null; }
function uniquePeople(ids) { return [...new Set(ids)].map(getPerson).filter(Boolean); }

function parentIds(id) {
  return state.relationships.filter(r => active(r) && r.relationship_type === 'parent' && r.person2_id === id).map(r => r.person1_id);
}
function childIds(id) {
  return state.relationships.filter(r => active(r) && r.relationship_type === 'parent' && r.person1_id === id).map(r => r.person2_id);
}
function siblingIds(id) {
  const ids = new Set();
  const parents = new Set(parentIds(id));
  state.relationships.forEach(r => {
    if (!active(r)) return;
    if (r.relationship_type === 'sibling' && (r.person1_id === id || r.person2_id === id)) {
      ids.add(r.person1_id === id ? r.person2_id : r.person1_id);
    }
    if (r.relationship_type === 'parent' && parents.has(r.person1_id) && r.person2_id !== id) ids.add(r.person2_id);
  });
  return [...ids];
}
function partnerIds(id) {
  return state.relationships
    .filter(r => active(r) && ['spouse', 'partner'].includes(r.relationship_type) && !isDivorcedRelationship(r)
      && (r.person1_id === id || r.person2_id === id))
    .sort((a, b) => {
      const rank = r => (r.relationship_status === 'current' && r.relationship_type !== 'former_spouse' ? 3 : r.relationship_status === 'ended_by_death' ? 2 : 1);
      return rank(b) - rank(a);
    })
    .map(r => r.person1_id === id ? r.person2_id : r.person1_id);
}
function filterGender(ids, gender) { return ids.filter(id => getPerson(id)?.gender === gender); }
function parentsOfMany(ids) { return uniquePeople(ids.flatMap(parentIds)).map(p => p.id); }
function childrenOfMany(ids) { return uniquePeople(ids.flatMap(childIds)).map(p => p.id); }
function siblingsOfMany(ids) { return uniquePeople(ids.flatMap(siblingIds)).map(p => p.id); }
function partnersOfMany(ids) { return uniquePeople(ids.flatMap(partnerIds)).map(p => p.id); }

function relationStep(ids, relation) {
  if (!ids.length) return [];
  if (relation === 'parents') return parentsOfMany(ids);
  if (relation === 'mother') return filterGender(parentsOfMany(ids), 'female');
  if (relation === 'father') return filterGender(parentsOfMany(ids), 'male');
  if (relation === 'children') return childrenOfMany(ids);
  if (relation === 'son') return filterGender(childrenOfMany(ids), 'male');
  if (relation === 'daughter') return filterGender(childrenOfMany(ids), 'female');
  if (relation === 'siblings') return siblingsOfMany(ids);
  if (relation === 'brother') return filterGender(siblingsOfMany(ids), 'male');
  if (relation === 'sister') return filterGender(siblingsOfMany(ids), 'female');
  if (relation === 'spouse') return partnersOfMany(ids);
  if (relation === 'wife') return filterGender(partnersOfMany(ids), 'female');
  if (relation === 'husband') return filterGender(partnersOfMany(ids), 'male');
  if (relation === 'grandparents') return parentsOfMany(parentsOfMany(ids));
  if (relation === 'grandmother') return filterGender(parentsOfMany(parentsOfMany(ids)), 'female');
  if (relation === 'grandfather') return filterGender(parentsOfMany(parentsOfMany(ids)), 'male');
  if (relation === 'maternal grandmother') return filterGender(parentsOfMany(filterGender(parentsOfMany(ids), 'female')), 'female');
  if (relation === 'maternal grandfather') return filterGender(parentsOfMany(filterGender(parentsOfMany(ids), 'female')), 'male');
  if (relation === 'paternal grandmother') return filterGender(parentsOfMany(filterGender(parentsOfMany(ids), 'male')), 'female');
  if (relation === 'paternal grandfather') return filterGender(parentsOfMany(filterGender(parentsOfMany(ids), 'male')), 'male');
  if (relation === 'uncle') return filterGender(siblingsOfMany(parentsOfMany(ids)), 'male');
  if (relation === 'aunt') return filterGender(siblingsOfMany(parentsOfMany(ids)), 'female');
  return ids;
}

const relationPattern = /maternal grandmother|maternal grandfather|paternal grandmother|paternal grandfather|grandparents?|grandmothers?|grandfathers?|parents?|mothers?|moms?|mums?|fathers?|dads?|brothers?|sisters?|siblings?|wives?|wife|husbands?|spouses?|partners?|children|child|kids?|sons?|daughters?|uncles?|aunts?/g;

function normalizeQuestion(raw) {
  return raw.toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/brothers?\s+(?:or|and)\s+sisters?|sisters?\s+(?:or|and)\s+brothers?/g, 'siblings')
    .replace(/brothers?\s+or\s+siblings?|sisters?\s+or\s+siblings?/g, 'siblings')
    .replace(/\bmoms?\b|\bmums?\b/g, 'mother')
    .replace(/\bdads?\b/g, 'father')
    .replace(/\bkids?\b|\bchild\b/g, 'children')
    .replace(/['’]s\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalRelation(token) {
  if (/^mother/.test(token)) return 'mother';
  if (/^father/.test(token)) return 'father';
  if (/^parent/.test(token)) return 'parents';
  if (/^brother/.test(token)) return 'brother';
  if (/^sister/.test(token)) return 'sister';
  if (/^sibling/.test(token)) return 'siblings';
  if (/^wife|^wives/.test(token)) return 'wife';
  if (/^husband/.test(token)) return 'husband';
  if (/^spouse|^partner/.test(token)) return 'spouse';
  if (/^children/.test(token)) return 'children';
  if (/^son/.test(token)) return 'son';
  if (/^daughter/.test(token)) return 'daughter';
  if (/^maternal grandmother/.test(token)) return 'maternal grandmother';
  if (/^maternal grandfather/.test(token)) return 'maternal grandfather';
  if (/^paternal grandmother/.test(token)) return 'paternal grandmother';
  if (/^paternal grandfather/.test(token)) return 'paternal grandfather';
  if (/^grandmother/.test(token)) return 'grandmother';
  if (/^grandfather/.test(token)) return 'grandfather';
  if (/^grandparent/.test(token)) return 'grandparents';
  if (/^uncle/.test(token)) return 'uncle';
  if (/^aunt/.test(token)) return 'aunt';
  return token;
}

function interpretQuestion(raw) {
  const normalized = normalizeQuestion(raw);
  const relationWords = [...normalized.matchAll(relationPattern)].map(m => canonicalRelation(m[0]));
  const looksRelational = /\bmy\b/.test(normalized) || /\b(who|what|which|show|find|tell)\b/.test(normalized) || relationWords.length > 1;
  if (!looksRelational || !relationWords.length) return null;
  let ids = [state.viewerId || select?.value].filter(Boolean);
  relationWords.forEach(step => { ids = relationStep(ids, step); });
  return { relations: relationWords, people: uniquePeople(ids) };
}

function buildDistances() {
  state.distances = new Map();
  const origin = state.viewerId || select?.value;
  if (!origin) return;
  const adjacency = new Map();
  const add = (a, b) => { const s = adjacency.get(a) || new Set(); s.add(b); adjacency.set(a, s); };
  state.relationships.forEach(r => {
    if (!active(r) || !['parent', 'sibling', 'spouse', 'partner'].includes(r.relationship_type) || isDivorcedRelationship(r)) return;
    add(r.person1_id, r.person2_id); add(r.person2_id, r.person1_id);
  });
  const queue = [origin];
  state.distances.set(origin, 0);
  while (queue.length) {
    const id = queue.shift();
    const distance = state.distances.get(id) + 1;
    (adjacency.get(id) || []).forEach(next => {
      if (state.distances.has(next)) return;
      state.distances.set(next, distance); queue.push(next);
    });
  }
}

function ranked(list) {
  return [...list].sort((a, b) => {
    const da = state.distances.get(a.id) ?? 99999;
    const db = state.distances.get(b.id) ?? 99999;
    return da - db || nameOf(a).localeCompare(nameOf(b));
  });
}

function rebuildDefault() {
  if (!state.loaded || !select) return;
  const selected = select.value;
  const list = ranked(state.people);
  select.replaceChildren();
  list.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = labelOf(p);
    select.appendChild(option);
  });
  if (selected && [...select.options].some(o => o.value === selected)) select.value = selected;
}

function installStyles() {
  if (document.getElementById('centreNavigationStyles')) return;
  const style = document.createElement('style');
  style.id = 'centreNavigationStyles';
  style.textContent = `
    .centre-search-wrap{position:relative;display:grid;gap:4px;margin-bottom:5px}
    .centre-search-input{width:100%;min-width:260px;padding:8px 10px;border:1px solid rgba(94,73,53,.26);border-radius:9px;background:#fffdf9;color:#30271f;font:600 12px Arial,sans-serif}
    .centre-search-help{font:500 9px/1.25 Arial,sans-serif;color:#7a6d61}
    .centre-search-results{position:absolute;z-index:30;top:100%;left:0;right:0;margin-top:3px;max-height:310px;overflow:auto;border:1px solid rgba(78,62,48,.24);border-radius:12px;background:#fffdf9;box-shadow:0 12px 28px rgba(47,37,28,.16);padding:5px}
    .centre-search-results.hidden{display:none}
    .centre-search-result{display:block;width:100%;border:0;border-radius:8px;background:transparent;padding:8px 9px;text-align:left;cursor:pointer;color:#30271f}
    .centre-search-result:hover,.centre-search-result:focus{background:#f1e7da;outline:none}
    .centre-search-result strong{display:block;font:700 12px/1.2 Georgia,serif}
    .centre-search-result small{display:block;margin-top:2px;font:500 9px/1.25 Arial,sans-serif;color:#74685d}
    .centre-search-empty{padding:9px;font:500 10px/1.35 Arial,sans-serif;color:#74685d}
    @media(max-width:900px){.centre-search-input{min-width:0}}
  `;
  document.head.appendChild(style);
}

function relationCaption(relations) {
  return relations.map(r => r.replace('spouse', 'spouse/partner')).join(' → ');
}

function showResults(term) {
  const results = document.getElementById('centreSearchResults');
  if (!results || !state.loaded) return;
  const query = term.trim();
  if (!query) { results.classList.add('hidden'); results.replaceChildren(); return; }
  const interpretation = interpretQuestion(query);
  let list = [];
  let caption = '';
  if (interpretation) {
    list = ranked(interpretation.people);
    caption = `Relationship query: ${relationCaption(interpretation.relations)}`;
  } else {
    const needle = query.toLowerCase();
    list = ranked(state.people.filter(p => searchText(p).includes(needle))).slice(0, 14);
    caption = 'Name, nickname, place or dates';
  }
  results.replaceChildren();
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'centre-search-empty';
    empty.textContent = interpretation
      ? `I could interpret this as ${relationCaption(interpretation.relations)}, but the current family links do not resolve a person.`
      : 'No matching family member found.';
    results.appendChild(empty);
    results.classList.remove('hidden');
    return;
  }
  list.forEach(p => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'centre-search-result';
    const strong = document.createElement('strong');
    strong.textContent = labelOf(p);
    const small = document.createElement('small');
    small.textContent = caption;
    button.append(strong, small);
    button.addEventListener('click', () => {
      if (![...select.options].some(o => o.value === p.id)) rebuildDefault();
      select.value = p.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const input = document.getElementById('centreSearch');
      if (input) input.value = '';
      results.classList.add('hidden');
      results.replaceChildren();
    });
    results.appendChild(button);
  });
  results.classList.remove('hidden');
}

function installSearch() {
  if (!select || document.getElementById('centreSearch')) return;
  installStyles();
  const wrapper = document.createElement('div');
  wrapper.className = 'centre-search-wrap';
  const input = document.createElement('input');
  input.id = 'centreSearch';
  input.className = 'centre-search-input';
  input.type = 'search';
  input.autocomplete = 'off';
  input.placeholder = 'Search names or ask a family question...';
  input.setAttribute('aria-label', 'Search family or ask a relationship question');
  const help = document.createElement('small');
  help.className = 'centre-search-help';
  help.textContent = 'Try a name, or e.g. “my mother’s brother” or “my wife’s sister”.';
  const results = document.createElement('div');
  results.id = 'centreSearchResults';
  results.className = 'centre-search-results hidden';
  wrapper.append(input, help, results);
  select.insertAdjacentElement('beforebegin', wrapper);
  input.addEventListener('input', () => showResults(input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { input.value = ''; showResults(''); }
  });
  document.addEventListener('click', event => {
    if (!wrapper.contains(event.target)) results.classList.add('hidden');
  });
}

async function load(session) {
  const [peopleResult, relResult, profileResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,birth_surname,current_surname,preferred_name,birth_date,death_date,birth_place,gender,is_active'),
    supabase.from('relationships').select('person1_id,person2_id,relationship_type,relationship_status,is_active'),
    session?.user?.id ? supabase.from('app_users').select('person_id').eq('user_id', session.user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (peopleResult.error || relResult.error) return;
  state.people = (peopleResult.data || []).filter(p => p.is_active !== false);
  state.relationships = (relResult.data || []).filter(active);
  state.byId = new Map(state.people.map(p => [p.id, p]));
  state.viewerId = profileResult.error ? null : profileResult.data?.person_id || null;
  state.loaded = true;
  buildDistances();
  rebuildDefault();
}

installSearch();
supabase.auth.onAuthStateChange((_event, session) => { if (session) load(session); });
const { data: { session } } = await supabase.auth.getSession();
if (session) await load(session);
