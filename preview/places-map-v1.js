import { supabase } from '../supabase-client-v1.js';
import { preferredFamilyPartnerEntry } from '../relationship-rules-v1.js';

const LEAFLET_MODULE = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm';
const PALETTE = ['#e7bea0', '#b8d5de', '#cbd6a6', '#d2c2df'];
let leafletPromise = null;
let activeMap = null;
let renderToken = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function personName(person) {
  return [person?.preferred_name || person?.given_names, person?.surname].filter(Boolean).join(' ') || 'Unknown person';
}

function eventDate(record) {
  if (record?.date_text) return record.date_text;
  if (record?.date_from && record?.date_to && record.date_from !== record.date_to) return `${record.date_from} to ${record.date_to}`;
  return record?.date_from || record?.date_to || 'Date not established';
}

function placeName(record) {
  return record?.historical_place_name || record?.place || record?.place_ref?.canonical_name || 'Place wording not recorded';
}

function coordinates(record) {
  const lat = record?.latitude ?? record?.place_ref?.latitude;
  const lng = record?.longitude ?? record?.place_ref?.longitude;
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  const pair = [Number(lat), Number(lng)];
  return pair.every(Number.isFinite) ? pair : null;
}

function active(relationship) {
  return relationship?.is_active !== false;
}

function parentsByChild(relationships) {
  const map = new Map();
  relationships.forEach((relationship) => {
    if (!active(relationship) || relationship.relationship_type !== 'parent') return;
    const list = map.get(relationship.person2_id) || [];
    list.push(relationship.person1_id);
    map.set(relationship.person2_id, list);
  });
  return map;
}

function partnerEntry(personId, relationships, peopleById) {
  const entries = relationships
    .filter((relationship) => active(relationship)
      && ['spouse', 'partner', 'former_spouse'].includes(relationship.relationship_type)
      && (relationship.person1_id === personId || relationship.person2_id === personId))
    .map((relationship) => ({
      relationship,
      person: peopleById.get(relationship.person1_id === personId ? relationship.person2_id : relationship.person1_id),
    }))
    .filter((entry) => entry.person);
  return preferredFamilyPartnerEntry(entries);
}

function parentPair(personId, parents, peopleById) {
  const items = (parents.get(personId) || []).map((id) => peopleById.get(id)).filter(Boolean);
  const father = items.find((person) => person.gender === 'male') || null;
  const mother = items.find((person) => person.gender === 'female') || null;
  const rest = items.filter((person) => person !== father && person !== mother);
  return [father || rest.shift() || null, mother || rest.shift() || null];
}

function ancestorSet(rootId, parents) {
  const result = new Set();
  const stack = rootId ? [rootId] : [];
  while (stack.length) {
    const id = stack.pop();
    if (!id || result.has(id)) continue;
    result.add(id);
    (parents.get(id) || []).forEach((parentId) => stack.push(parentId));
  }
  return result;
}

function branchDefinitions(centre, partner, parents, peopleById) {
  const centreParents = parentPair(centre.id, parents, peopleById);
  const partnerParents = partner ? parentPair(partner.id, parents, peopleById) : [null, null];
  const roots = [
    [centreParents[0], `${personName(centre)} - paternal`],
    [centreParents[1], `${personName(centre)} - maternal`],
    ...(partner ? [
      [partnerParents[0], `${personName(partner)} - paternal`],
      [partnerParents[1], `${personName(partner)} - maternal`],
    ] : []),
  ];
  return roots.map(([root, label], index) => ({
    root,
    label,
    colour: PALETTE[index],
    ids: root ? ancestorSet(root.id, parents) : new Set(),
  }));
}

function branchIndexes(personId, branches) {
  const indexes = [];
  branches.forEach((branch, index) => {
    if (branch.ids.has(personId)) indexes.push(index);
  });
  return indexes;
}

function markerColour(personId, branches) {
  const indexes = branchIndexes(personId, branches);
  return indexes.length === 1 ? branches[indexes[0]].colour : '#75695f';
}

function importance(record, context = false) {
  const text = [record?.title, record?.narrative, record?.event_type].filter(Boolean).join(' ');
  if (/\b(concentration camp|war|battle|attack|siege|massacre|internment|prisoner of war|pow)\b/i.test(text)) return 11;
  if (context || ['migration', 'immigration', 'emigration', 'military_service', 'property', 'farm', 'work', 'employment'].includes(String(record?.event_type || '').toLowerCase())) return 8;
  return 6;
}

function evidenceLabel(status) {
  if (['documented', 'strong'].includes(status)) return 'Documented';
  if (status === 'family_supplied') return 'Family evidence';
  return 'Research frontier';
}

function popupForEvent(event, peopleById) {
  return `<div class="preview-map-popup"><strong>${esc(event.title || String(event.event_type || 'Family event').replaceAll('_', ' '))}</strong><span>${esc(personName(peopleById.get(event.person_id)))}</span><span>${esc(eventDate(event))}</span><span>${esc(placeName(event))}</span><small>${esc(evidenceLabel(event.source_status))}</small>${event.narrative ? `<p>${esc(event.narrative)}</p>` : ''}</div>`;
}

function popupForContext(context, peopleById) {
  return `<div class="preview-map-popup"><strong>${esc(context.title || 'Historical context')}</strong><span>${esc(eventDate(context))}</span><span>${esc(placeName(context))}</span><small>${esc(evidenceLabel(context.source_status))} - context for ${esc(personName(peopleById.get(context.anchor_person_id)))}, not automatically a personal-presence claim</small>${context.narrative ? `<p>${esc(context.narrative)}</p>` : ''}</div>`;
}

function arrowHtml(colour, angle) {
  return `<span class="preview-map-arrow" style="--preview-map-arrow-colour:${esc(colour)};--preview-map-arrow-angle:${angle.toFixed(2)}deg"></span>`;
}

function arrowPoint(from, to) {
  const fraction = 0.76;
  const lat = from[0] + (to[0] - from[0]) * fraction;
  const lng = from[1] + (to[1] - from[1]) * fraction;
  const dx = to[1] - from[1];
  const dy = -(to[0] - from[0]);
  return { point: [lat, lng], angle: Math.atan2(dy, dx) * 180 / Math.PI };
}

async function loadData() {
  const [peopleResult, relationshipsResult, eventsResult, contextsResult, routesResult] = await Promise.all([
    supabase.from('people').select('id,given_names,preferred_name,surname,gender,birth_date,death_date,is_active'),
    supabase.from('relationships').select('person1_id,person2_id,relationship_type,relationship_status,source_status,is_active'),
    supabase.from('life_events').select('id,person_id,event_type,date_from,date_to,date_text,place,historical_place_name,latitude,longitude,title,narrative,source_status,place_ref:places(id,canonical_name,latitude,longitude)').eq('map_visibility', true).eq('is_active', true),
    supabase.from('map_context_items').select('id,anchor_person_id,context_type,family_link_status,title,date_from,date_to,date_text,narrative,source_status,place_ref:places(id,canonical_name,latitude,longitude)').eq('map_visibility', true).eq('is_active', true),
    supabase.from('life_event_routes').select('id,from_event_id,to_event_id,movement_type,route_status,notes').eq('is_active', true),
  ]);
  for (const result of [peopleResult, relationshipsResult, eventsResult, contextsResult, routesResult]) {
    if (result.error) throw result.error;
  }
  return {
    people: (peopleResult.data || []).filter((person) => person.is_active !== false),
    relationships: (relationshipsResult.data || []).filter(active),
    events: eventsResult.data || [],
    contexts: contextsResult.data || [],
    routes: routesResult.data || [],
  };
}

export function teardownPlacesMap() {
  renderToken += 1;
  if (activeMap) {
    activeMap.remove();
    activeMap = null;
  }
}

export async function renderPlacesMap({ centreId, canvas, status }) {
  const token = ++renderToken;
  if (!canvas || !centreId) return;
  teardownPlacesMap();
  const currentToken = renderToken;
  canvas.innerHTML = '<div class="preview-map-loading">Loading family places and journeys...</div>';
  if (status) status.textContent = 'Loading mapped family events...';

  const [L, data] = await Promise.all([
    (leafletPromise ||= import(LEAFLET_MODULE).then((module) => module.default || module)),
    loadData(),
  ]);
  if (currentToken !== renderToken) return;

  const peopleById = new Map(data.people.map((person) => [person.id, person]));
  const centre = peopleById.get(centreId);
  if (!centre) throw new Error('The selected family member is not available for the map.');
  const partner = partnerEntry(centre.id, data.relationships, peopleById)?.person || null;
  const parents = parentsByChild(data.relationships);
  const branches = branchDefinitions(centre, partner, parents, peopleById);
  const includedIds = new Set([centre.id, partner?.id].filter(Boolean));
  branches.forEach((branch) => branch.ids.forEach((id) => includedIds.add(id)));

  const events = data.events.filter((event) => includedIds.has(event.person_id));
  const contexts = data.contexts.filter((context) => includedIds.has(context.anchor_person_id));
  const mappedEvents = events.map((record) => ({ record, coords: coordinates(record) })).filter((entry) => entry.coords);
  const mappedContexts = contexts.map((record) => ({ record, coords: coordinates(record) })).filter((entry) => entry.coords);

  canvas.innerHTML = `<div class="preview-map-shell">
    <div class="preview-map-toolbar"><div><strong>Places &amp; Journeys</strong><span>${esc(personName(centre))}${partner ? ` and ${esc(personName(partner))}` : ''}</span></div><button type="button" class="button secondary" data-preview-map-back>Back to Family Tree</button></div>
    <div class="preview-map-legend">${branches.map((branch) => `<span><i style="--preview-branch:${branch.colour}"></i>${esc(branch.label)}</span>`).join('')}<span><b class="preview-context-key"></b>Historical context</span></div>
    <div id="previewHistoricalMap" class="preview-historical-map" role="region" aria-label="Family places and journeys"></div>
    <div class="preview-map-summary">${mappedEvents.length} family events and ${mappedContexts.length} historical context items have reviewed coordinates. ${events.length - mappedEvents.length + contexts.length - mappedContexts.length} relevant records remain unpinned rather than guessed.</div>
  </div>`;

  const map = L.map('previewHistoricalMap', { zoomControl: true, preferCanvas: true });
  activeMap = map;
  map.attributionControl?.setPrefix(false);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const bounds = L.latLngBounds([]);
  const eventById = new Map(events.map((event) => [event.id, event]));
  mappedEvents.forEach(({ record, coords }) => {
    const colour = markerColour(record.person_id, branches);
    L.circleMarker(coords, {
      radius: importance(record, false),
      color: '#fffaf2',
      weight: 2,
      fillColor: colour,
      fillOpacity: 0.92,
    }).bindPopup(popupForEvent(record, peopleById), { maxWidth: 390 }).addTo(map);
    bounds.extend(coords);
  });

  mappedContexts.forEach(({ record, coords }) => {
    const colour = markerColour(record.anchor_person_id, branches);
    L.circleMarker(coords, {
      radius: importance(record, true),
      color: colour,
      weight: 2,
      dashArray: '4 3',
      fillColor: colour,
      fillOpacity: 0.42,
    }).bindPopup(popupForContext(record, peopleById), { maxWidth: 390 }).addTo(map);
    bounds.extend(coords);
  });

  let routeCount = 0;
  data.routes.forEach((route) => {
    const from = eventById.get(route.from_event_id);
    const to = eventById.get(route.to_event_id);
    const fromCoords = from && coordinates(from);
    const toCoords = to && coordinates(to);
    if (!fromCoords || !toCoords) return;
    const colour = markerColour(from.person_id, branches);
    L.polyline([fromCoords, toCoords], {
      color: colour,
      weight: route.route_status === 'documented' ? 3 : 2,
      opacity: 0.8,
      dashArray: route.route_status === 'documented' ? null : '7 6',
    }).bindPopup(`<div class="preview-map-popup"><strong>${esc(String(route.movement_type || 'Movement').replaceAll('_', ' '))}</strong><span>${esc(route.route_status || 'reviewed')}</span>${route.notes ? `<p>${esc(route.notes)}</p>` : ''}</div>`).addTo(map);
    const arrow = arrowPoint(fromCoords, toCoords);
    L.marker(arrow.point, {
      interactive: false,
      icon: L.divIcon({ className: 'preview-map-arrow-host', html: arrowHtml(colour, arrow.angle), iconSize: [18, 18], iconAnchor: [9, 9] }),
    }).addTo(map);
    routeCount += 1;
  });

  if (bounds.isValid()) map.fitBounds(bounds.pad(0.15), { maxZoom: 8 });
  else map.setView([-29, 25], 5);
  window.setTimeout(() => map.invalidateSize(), 60);
  if (status) status.textContent = `${mappedEvents.length + mappedContexts.length} mapped items shown across the family branches, with ${routeCount} reviewed movement route${routeCount === 1 ? '' : 's'}.`;
}