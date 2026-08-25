import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(URL, KEY);
const select = document.getElementById('centreSelect');
const state = { people: [], relationships: [], byId: new Map(), viewerId: null, distances: new Map(), loaded: false };

function nameOf(p) { return [p?.given_names?.trim(), p?.surname?.trim()].filter(Boolean).join(' ') || 'Unnamed person'; }
function years(p) {
  const b = p?.birth_date?.slice(0,4) || '';
  const d = p?.death_date?.slice(0,4) || '';
  return b && d ? `${b}-${d}` : b ? `b. ${b}` : d ? `d. ${d}` : '';
}
function labelOf(p) { const y = years(p); return `${nameOf(p)}${y ? ` (${y})` : ''}`; }
function active(r) { return r?.is_active !== false; }
function searchText(p) { return [nameOf(p), p?.preferred_name, p?.birth_place, years(p)].filter(Boolean).join(' ').toLowerCase(); }

function buildDistances() {
  state.distances = new Map();
  const origin = state.viewerId || select?.value;
  if (!origin) return;
  const adjacency = new Map();
  const add = (a,b) => { const s = adjacency.get(a) || new Set(); s.add(b); adjacency.set(a,s); };
  state.relationships.forEach((r) => {
    if (!active(r) || !['parent','sibling','spouse','partner','former_spouse'].includes(r.relationship_type)) return;
    add(r.person1_id,r.person2_id); add(r.person2_id,r.person1_id);
  });
  const queue = [origin];
  state.distances.set(origin,0);
  while (queue.length) {
    const id = queue.shift();
    const distance = state.distances.get(id) + 1;
    (adjacency.get(id) || []).forEach((next) => {
      if (state.distances.has(next)) return;
      state.distances.set(next,distance); queue.push(next);
    });
  }
}

function rebuild(term='') {
  if (!state.loaded || !select) return;
  const selected = select.value;
  const needle = term.trim().toLowerCase();
  const list = state.people
    .filter((p) => !needle || searchText(p).includes(needle))
    .sort((a,b) => {
      const da = state.distances.get(a.id) ?? 99999;
      const db = state.distances.get(b.id) ?? 99999;
      return da - db || nameOf(a).localeCompare(nameOf(b));
    });
  if (selected && !list.some((p) => p.id === selected) && state.byId.has(selected)) list.unshift(state.byId.get(selected));
  select.replaceChildren();
  list.forEach((p,index) => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = needle && p.id === selected && index === 0 && !searchText(p).includes(needle)
      ? `Current - ${labelOf(p)}` : labelOf(p);
    select.appendChild(option);
  });
  if (selected && [...select.options].some((o) => o.value === selected)) select.value = selected;
}

function installSearch() {
  if (!select || document.getElementById('centreSearch')) return;
  const input = document.createElement('input');
  input.id = 'centreSearch';
  input.className = 'centre-search-input';
  input.type = 'search';
  input.autocomplete = 'off';
  input.placeholder = 'Search family...';
  input.setAttribute('aria-label','Search centre person');
  select.insertAdjacentElement('beforebegin',input);
  input.addEventListener('input',() => rebuild(input.value));
  select.addEventListener('change',() => {
    input.value = '';
    window.setTimeout(() => rebuild(''),0);
  });
}

async function load(session) {
  const [peopleResult, relResult, profileResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,preferred_name,birth_date,death_date,birth_place,is_active'),
    supabase.from('relationships').select('person1_id,person2_id,relationship_type,is_active'),
    session?.user?.id ? supabase.from('app_users').select('person_id').eq('user_id',session.user.id).maybeSingle() : Promise.resolve({data:null,error:null}),
  ]);
  if (peopleResult.error || relResult.error) return;
  state.people = (peopleResult.data || []).filter((p) => p.is_active !== false);
  state.relationships = (relResult.data || []).filter(active);
  state.byId = new Map(state.people.map((p) => [p.id,p]));
  state.viewerId = profileResult.error ? null : profileResult.data?.person_id || null;
  state.loaded = true;
  buildDistances();
  rebuild('');
}

installSearch();
supabase.auth.onAuthStateChange((_event,session) => { if (session) load(session); });
const { data:{ session } } = await supabase.auth.getSession();
if (session) await load(session);
