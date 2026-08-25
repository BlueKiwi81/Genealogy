import { supabase } from './supabase-client-v1.js';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_MODULE = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/+esm`;
const LEAFLET_CSS = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const MAP_CSS = './map-view-v1.css?v=1';
const EVIDENCE_LABELS = { documented: 'Documented', family: 'Family evidence', frontier: 'Research frontier' };
let leafletPromise = null;
let dataPromise = null;
let activeMap = null;
let renderSequence = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ') || 'Unknown person';
}

function firstName(person) {
  return person?.preferred_name?.trim() || person?.given_names?.trim().split(/\s+/)[0] || canonicalName(person);
}

function ensureStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

async function leaflet() {
  ensureStylesheet('genealogyMapViewStyles', MAP_CSS);
  ensureStylesheet('genealogyLeafletStyles', LEAFLET_CSS);
  leafletPromise ||= import(LEAFLET_MODULE).then((module) => module.default || module);
  return leafletPromise;
}

async function mapData() {
  dataPromise ||= Promise.all([
    supabase.from('life_events')
      .select('id,person_id,event_type,date_from,date_to,date_text,date_precision,place,historical_place_name,latitude,longitude,location_precision,title,narrative,source_status,source_reference,place_ref:places(id,canonical_name,historical_names,latitude,longitude,coordinate_precision,notes)')
      .eq('map_visibility', true).eq('is_active', true),
    supabase.from('life_event_routes')
      .select('id,from_event_id,to_event_id,movement_type,route_status,source_reference,notes')
      .eq('is_active', true),
  ]).then(([eventsResult, routesResult]) => {
    if (eventsResult.error) throw eventsResult.error;
    if (routesResult.error) throw routesResult.error;
    return { events: eventsResult.data || [], routes: routesResult.data || [] };
  });
  return dataPromise;
}

function parentMap(relationships) {
  const map = new Map();
  relationships.forEach((relationship) => {
    if (relationship?.is_active === false || relationship.relationship_type !== 'parent') return;
    const list = map.get(relationship.person2_id) || [];
    list.push(relationship.person1_id);
    map.set(relationship.person2_id, list);
  });
  return map;
}

function parentPair(personId, parents, peopleById) {
  const entries = (parents.get(personId) || []).map((id) => peopleById.get(id)).filter(Boolean);
  const father = entries.find((person) => person.gender === 'male') || null;
  const mother = entries.find((person) => person.gender === 'female') || null;
  const remaining = entries.filter((person) => person !== father && person !== mother);
  return [father || remaining.shift() || null, mother || remaining.shift() || null];
}

function ancestorIds(root, parents) {
  const ids = new Set();
  const stack = root ? [root.id] : [];
  while (stack.length) {
    const id = stack.pop();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    (parents.get(id) || []).forEach((parentId) => stack.push(parentId));
  }
  return ids;
}

function branchesFor(centre, partner, people, relationships, palette) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const parents = parentMap(relationships);
  const [centreFather, centreMother] = parentPair(centre.id, parents, peopleById);
  const [partnerFather, partnerMother] = partner ? parentPair(partner.id, parents, peopleById) : [null, null];
  const definitions = [
    [centreFather, `${firstName(centre)} - paternal branch`],
    [centreMother, `${firstName(centre)} - maternal branch`],
    ...(partner ? [
      [partnerFather, `${firstName(partner)} - paternal branch`],
      [partnerMother, `${firstName(partner)} - maternal branch`],
    ] : []),
  ];
  return definitions.map(([root, label], index) => ({
    index, root, label, colour: palette[index], ids: ancestorIds(root, parents),
  }));
}

function evidenceGroup(status) {
  if (['documented', 'strong'].includes(status)) return 'documented';
  if (status === 'family_supplied') return 'family';
  return 'frontier';
}

function eventYear(event) {
  const value = event.date_from || event.date_to || '';
  const year = Number(String(value).slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
}

function eventCoordinates(event) {
  const latitude = event.latitude ?? event.place_ref?.latitude;
  const longitude = event.longitude ?? event.place_ref?.longitude;
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  return [Number(latitude), Number(longitude)];
}

function formatEventType(type) {
  return String(type || 'presence').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function popupHtml(name, events, peopleById, eventBranches, branches) {
  const rows = events.map((event) => {
    const branchIndexes = eventBranches.get(event.id) || [];
    const branchText = branchIndexes.length
      ? branchIndexes.map((index) => branches[index]?.label).filter(Boolean).join(', ')
      : 'Centre person/couple';
    return `<div class="map-popup-event"><strong>${esc(canonicalName(peopleById.get(event.person_id)))}</strong><span>${esc(event.date_text || event.date_from || 'Date not established')} - ${esc(formatEventType(event.event_type))}</span><span class="map-popup-meta">${esc(branchText)} | ${esc(EVIDENCE_LABELS[evidenceGroup(event.source_status)])}</span>${event.source_reference ? `<span class="map-popup-source">${esc(event.source_reference)}</span>` : ''}</div>`;
  }).join('');
  return `<div class="map-popup"><h3>${esc(name)}</h3>${rows}</div>`;
}

function routePopup(route) {
  const status = route.route_status === 'inferred' ? 'Movement inferred from documented locations. The actual route and date of relocation have not yet been established.' : route.route_status === 'research_frontier' ? 'Research-frontier movement. This is not canonical.' : 'Documented movement.';
  return `<div class="map-route-popup"><strong>${esc(formatEventType(route.movement_type))}</strong><br>${esc(status)}${route.source_reference ? `<br>${esc(route.source_reference)}` : ''}</div>`;
}

function setStatus(message) {
  const status = document.getElementById('treeStatus');
  if (status) status.textContent = message;
}

export function teardownMapView() {
  renderSequence += 1;
  if (activeMap) {
    activeMap.remove();
    activeMap = null;
  }
}

export async function renderMapView({ centre, partner, people, relationships, palette }) {
  const sequence = ++renderSequence;
  teardownMapView();
  const canvas = document.getElementById('treeCanvas');
  if (!canvas) return;
  const [L, data] = await Promise.all([leaflet(), mapData()]);
  if (sequence + 1 !== renderSequence || document.getElementById('treeViewMode')?.value !== 'map') return;

  const branches = branchesFor(centre, partner, people, relationships, palette);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const centralIds = new Set([centre.id, partner?.id].filter(Boolean));
  const personBranches = new Map();
  branches.forEach((branch) => branch.ids.forEach((personId) => {
    const list = personBranches.get(personId) || [];
    list.push(branch.index);
    personBranches.set(personId, list);
  }));
  const relevantEvents = data.events.filter((event) => centralIds.has(event.person_id) || personBranches.has(event.person_id));
  const years = relevantEvents.map(eventYear).filter((year) => year !== null);
  const minYear = years.length ? Math.min(...years) : 1800;
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

  canvas.innerHTML = `<div class="map-view-shell"><section class="map-view-controls" aria-label="Map filters"><div><p class="map-filter-title">Dynamic family branches</p><div id="mapBranchLegend" class="map-branch-legend"></div></div><div class="map-filter-stack"><div><p class="map-filter-title">Evidence layers</p><div class="map-evidence-filters"><label><input type="checkbox" data-map-evidence="documented" checked> Documented</label><label><input type="checkbox" data-map-evidence="family"> Family evidence</label><label><input type="checkbox" data-map-evidence="frontier"> Research frontier</label></div></div><div><p class="map-filter-title">Time period</p><div class="map-time-row"><span id="mapYearFromLabel">${minYear}</span><div class="map-time-inputs"><input id="mapYearFrom" type="range" min="${minYear}" max="${maxYear}" value="${minYear}" aria-label="Map start year"><input id="mapYearTo" type="range" min="${minYear}" max="${maxYear}" value="${maxYear}" aria-label="Map end year"></div><span id="mapYearToLabel">${maxYear}</span></div></div></div></section><div id="historicalMap" class="historical-map" role="region" aria-label="Historical family locations"></div><section class="map-view-notes"><div id="mapRouteNote" class="map-note"></div><div id="mapUnresolvedNote" class="map-note"></div></section></div>`;

  const legend = document.getElementById('mapBranchLegend');
  branches.forEach((branch) => {
    const count = relevantEvents.filter((event) => (personBranches.get(event.person_id) || []).includes(branch.index)).length;
    const item = document.createElement('div');
    item.className = `map-branch-key${count ? '' : ' is-empty'}`;
    item.innerHTML = `<span class="map-branch-swatch" style="--map-branch-colour:${branch.colour}"></span><span>${esc(branch.label)}<small>${count ? `${count} event${count === 1 ? '' : 's'}` : 'Insufficient research data for this period'}</small></span>`;
    legend?.appendChild(item);
  });

  const map = L.map('historicalMap', { zoomControl: true, preferCanvas: true });
  activeMap = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  const locationLayer = L.layerGroup().addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  const bounds = L.latLngBounds([]);

  const controls = {
    from: document.getElementById('mapYearFrom'),
    to: document.getElementById('mapYearTo'),
    fromLabel: document.getElementById('mapYearFromLabel'),
    toLabel: document.getElementById('mapYearToLabel'),
    evidence: [...document.querySelectorAll('[data-map-evidence]')],
  };

  function renderLayers() {
    if (sequence + 1 !== renderSequence) return;
    let fromYear = Number(controls.from?.value || minYear);
    let toYear = Number(controls.to?.value || maxYear);
    if (fromYear > toYear) [fromYear, toYear] = [toYear, fromYear];
    if (controls.fromLabel) controls.fromLabel.textContent = String(fromYear);
    if (controls.toLabel) controls.toLabel.textContent = String(toYear);
    const enabledEvidence = new Set(controls.evidence.filter((input) => input.checked).map((input) => input.dataset.mapEvidence));
    const visible = relevantEvents.filter((event) => {
      const year = eventYear(event);
      return enabledEvidence.has(evidenceGroup(event.source_status)) && (year === null || (year >= fromYear && year <= toYear));
    });
    const visibleById = new Map(visible.map((event) => [event.id, event]));
    const eventBranches = new Map(visible.map((event) => [event.id, personBranches.get(event.person_id) || []]));
    const groups = new Map();
    const unresolved = [];
    visible.forEach((event) => {
      const coordinates = eventCoordinates(event);
      if (!coordinates) { unresolved.push(event); return; }
      const key = `${coordinates[0].toFixed(5)},${coordinates[1].toFixed(5)}`;
      const group = groups.get(key) || { coordinates, events: [], name: event.place_ref?.canonical_name || event.place || 'Recorded place' };
      group.events.push(event);
      groups.set(key, group);
    });

    locationLayer.clearLayers();
    routeLayer.clearLayers();
    groups.forEach((group) => {
      const indexes = [...new Set(group.events.flatMap((event) => eventBranches.get(event.id) || []))];
      const colour = indexes.length === 1 ? branches[indexes[0]]?.colour : '#6f665e';
      const marker = L.circleMarker(group.coordinates, {
        radius: Math.min(14, 6 + Math.sqrt(group.events.length) * 2),
        color: colour || '#6f665e', fillColor: colour || '#6f665e', fillOpacity: .78, weight: 2,
      }).bindPopup(popupHtml(group.name, group.events, peopleById, eventBranches, branches), { maxWidth: 380 });
      marker.addTo(locationLayer);
      bounds.extend(group.coordinates);
    });

    let shownRoutes = 0;
    data.routes.forEach((route) => {
      const fromEvent = visibleById.get(route.from_event_id);
      const toEvent = visibleById.get(route.to_event_id);
      const fromCoordinates = fromEvent && eventCoordinates(fromEvent);
      const toCoordinates = toEvent && eventCoordinates(toEvent);
      if (!fromCoordinates || !toCoordinates) return;
      if (route.route_status === 'research_frontier' && !enabledEvidence.has('frontier')) return;
      const colour = route.route_status === 'research_frontier' ? '#777' : '#554a40';
      L.polyline([fromCoordinates, toCoordinates], {
        color: colour, weight: 2.5, opacity: .78,
        dashArray: route.route_status === 'documented' ? null : route.route_status === 'inferred' ? '8 7' : '3 7',
      }).bindPopup(routePopup(route)).addTo(routeLayer);
      shownRoutes += 1;
    });

    const routeNote = document.getElementById('mapRouteNote');
    if (routeNote) routeNote.innerHTML = shownRoutes
      ? `<strong>Movement evidence</strong>${shownRoutes} separately reviewed route${shownRoutes === 1 ? '' : 's'} shown. Solid is documented; dashed is inferred.`
      : '<strong>No movement line is being claimed</strong>Known locations are shown without connecting them because no explicit movement route has yet been reviewed for this selection.';
    const unresolvedNote = document.getElementById('mapUnresolvedNote');
    if (unresolvedNote) unresolvedNote.innerHTML = unresolved.length
      ? `<strong>Insufficient location data</strong>The following records remain unpinned rather than guessed:<ul class="map-unresolved-list">${unresolved.map((event) => `<li>${esc(event.date_text || 'Undated')} - ${esc(event.place || event.title)}</li>`).join('')}</ul>`
      : '<strong>Mapped records</strong>Every visible event in the selected period has at least a reviewed locality centroid.';
    setStatus(`${visible.length} event${visible.length === 1 ? '' : 's'} shown across ${groups.size} mapped location${groups.size === 1 ? '' : 's'}; ${unresolved.length} left unpinned.`);
  }

  controls.evidence.forEach((input) => input.addEventListener('change', renderLayers));
  controls.from?.addEventListener('input', renderLayers);
  controls.to?.addEventListener('input', renderLayers);
  renderLayers();
  if (bounds.isValid()) map.fitBounds(bounds.pad(.14), { maxZoom: 8 });
  else map.setView([-29.0, 25.0], 5);
  window.setTimeout(() => map.invalidateSize(), 50);
}
