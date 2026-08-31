import { supabase } from './supabase-client-v1.js';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_MODULE = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/+esm`;
const LEAFLET_CSS = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const MAP_CSS = './map-view-v2.css?v=1';
const EVIDENCE_LABELS = { documented: 'Documented', family: 'Family evidence', frontier: 'Research frontier' };
const CONTEXT_TYPE_LABELS = {
  family_history: 'Family history',
  historical_context: 'Historical context',
  research_frontier: 'Research frontier',
  community_context: 'Community context',
};
const FAMILY_LINK_LABELS = {
  direct_family: 'Direct family history',
  line_context: 'Family-line context - not proof of personal presence',
  candidate_cluster: 'Candidate family cluster - relationship unproved',
  oral_tradition: 'Oral tradition - not documentary',
};
const LOCATION_LABELS = {
  exact: 'Exact location', property: 'Property-level location', locality: 'Locality centroid',
  district: 'District-level location', region: 'Regional location', country: 'Country-level location',
  unknown: 'Location precision not established',
};
const IMPORTANCE_LABELS = {
  ordinary: 'Family event',
  notable: 'Notable family / historical event',
  major: 'Major historical event',
};
const MAJOR_EVENT_PATTERN = /\b(concentration camp|camp system|war|wartime|battle|attack|siege|massacre|internment|prisoner of war|pow)\b/i;
const NOTABLE_EVENT_TYPES = new Set(['migration', 'immigration', 'emigration', 'military_service', 'military', 'property', 'farm', 'work', 'employment']);
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
  const existing = document.getElementById(id);
  if (existing) {
    if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
    return;
  }
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
    supabase.from('map_context_items')
      .select('id,anchor_person_id,context_type,family_link_status,title,date_from,date_to,date_text,date_precision,location_precision,narrative,source_status,source_reference,place_ref:places(id,canonical_name,historical_names,latitude,longitude,coordinate_precision,notes)')
      .eq('map_visibility', true).eq('is_active', true),
    supabase.from('life_event_routes')
      .select('id,from_event_id,to_event_id,movement_type,route_status,source_reference,notes')
      .eq('is_active', true),
  ]).then(([eventsResult, contextsResult, routesResult]) => {
    if (eventsResult.error) throw eventsResult.error;
    if (contextsResult.error) throw contextsResult.error;
    if (routesResult.error) throw routesResult.error;
    return {
      events: eventsResult.data || [],
      contexts: contextsResult.data || [],
      routes: routesResult.data || [],
    };
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

function recordYear(record) {
  const value = record.date_from || record.date_to || '';
  const year = Number(String(value).slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
}

function recordCoordinates(record) {
  const latitude = record.latitude ?? record.place_ref?.latitude;
  const longitude = record.longitude ?? record.place_ref?.longitude;
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  const coordinates = [Number(latitude), Number(longitude)];
  return coordinates.every(Number.isFinite) ? coordinates : null;
}

function formatEventType(type) {
  return String(type || 'presence').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatRecordDate(record) {
  if (record.date_text) return record.date_text;
  if (record.date_from && record.date_to && record.date_from !== record.date_to) return `${record.date_from} to ${record.date_to}`;
  return record.date_from || record.date_to || 'Date not established';
}

function recordPlaceName(record) {
  return record.historical_place_name || record.place || record.place_ref?.canonical_name || 'Place wording not recorded';
}

function locationLabel(record) {
  const precision = record.location_precision && record.location_precision !== 'unknown'
    ? record.location_precision
    : record.place_ref?.coordinate_precision || 'unknown';
  return LOCATION_LABELS[precision] || LOCATION_LABELS.unknown;
}

function markerBackground(indexes, branches) {
  const colours = [...new Set(indexes.map((index) => branches[index]?.colour).filter(Boolean))];
  if (!colours.length) return '#6f665e';
  if (colours.length === 1) return colours[0];
  const segment = 100 / colours.length;
  return `conic-gradient(${colours.map((colour, index) => `${colour} ${index * segment}% ${(index + 1) * segment}%`).join(',')})`;
}

function markerSolidColour(indexes, branches) {
  const colours = [...new Set(indexes.map((index) => branches[index]?.colour).filter(Boolean))];
  return colours.length === 1 ? colours[0] : '#554a40';
}

function recordImportance(record, kind) {
  const text = [record.title, record.narrative, record.place, record.place_ref?.canonical_name, record.date_text].filter(Boolean).join(' ');
  if (MAJOR_EVENT_PATTERN.test(text)) return 'major';
  if (kind === 'event' && NOTABLE_EVENT_TYPES.has(String(record.event_type || '').toLowerCase())) return 'notable';
  if (kind === 'context' && ['family_history', 'historical_context'].includes(record.context_type)) return 'notable';
  return 'ordinary';
}

function dotHtml(record, kind, indexes, branches, offset) {
  const background = markerBackground(indexes, branches);
  const importance = recordImportance(record, kind);
  const evidence = evidenceGroup(record.source_status);
  const classes = [
    'map-event-dot',
    `map-event-dot--${importance}`,
    kind === 'context' ? 'map-event-dot--context' : 'map-event-dot--family',
    `map-event-dot--evidence-${evidence}`,
  ];
  return `<span class="${classes.join(' ')}" style="--map-dot-fill:${esc(background)};--map-dot-offset-x:${offset.x}px;--map-dot-offset-y:${offset.y}px" aria-hidden="true"></span>`;
}

function branchTextFor(indexes, branches) {
  return indexes.length
    ? indexes.map((index) => branches[index]?.label).filter(Boolean).join(', ')
    : 'Centre person/couple';
}

function eventPopupRows(events, peopleById, eventBranches, branches) {
  return events.map((event) => {
    const eventTitle = event.title || formatEventType(event.event_type);
    const importance = recordImportance(event, 'event');
    return `<article class="map-popup-event">
      <p class="map-popup-event-type">Family event - ${esc(eventTitle)}</p>
      <strong class="map-popup-person">${esc(canonicalName(peopleById.get(event.person_id)))}</strong>
      <span class="map-popup-when">${esc(formatRecordDate(event))} | ${esc(formatEventType(event.event_type))}</span>
      <span class="map-popup-place">${esc(recordPlaceName(event))}</span>
      <span class="map-popup-meta"><span>${esc(EVIDENCE_LABELS[evidenceGroup(event.source_status)])}</span><span>${esc(locationLabel(event))}</span><span>${esc(IMPORTANCE_LABELS[importance])}</span><span>${esc(branchTextFor(eventBranches.get(event.id) || [], branches))}</span></span>
      ${event.narrative ? `<p class="map-popup-narrative">${esc(event.narrative)}</p>` : ''}
      ${event.source_reference ? `<details class="map-popup-source"><summary>Source or record</summary><p>${esc(event.source_reference)}</p></details>` : ''}
    </article>`;
  }).join('');
}

function contextPopupRows(contexts, peopleById, contextBranches, branches) {
  return contexts.map((context) => {
    const anchor = peopleById.get(context.anchor_person_id);
    const contextLabel = CONTEXT_TYPE_LABELS[context.context_type] || 'Historical context';
    const linkLabel = FAMILY_LINK_LABELS[context.family_link_status] || 'Family relationship not yet classified';
    const importance = recordImportance(context, 'context');
    return `<article class="map-popup-event map-popup-context">
      <p class="map-popup-event-type">${esc(contextLabel)}</p>
      <strong class="map-popup-person">${esc(context.title)}</strong>
      <span class="map-popup-when">${esc(formatRecordDate(context))}</span>
      <span class="map-popup-place">${esc(recordPlaceName(context))}</span>
      <span class="map-popup-meta"><span>${esc(EVIDENCE_LABELS[evidenceGroup(context.source_status)])}</span><span>${esc(locationLabel(context))}</span><span>${esc(IMPORTANCE_LABELS[importance])}</span><span>${esc(linkLabel)}</span><span>${esc(branchTextFor(contextBranches.get(context.id) || [], branches))}</span></span>
      <p class="map-popup-anchor">Shown because it is relevant to ${esc(canonicalName(anchor))}'s branch. This is not automatically a personal-presence claim.</p>
      ${context.narrative ? `<p class="map-popup-narrative">${esc(context.narrative)}</p>` : ''}
      ${context.source_reference ? `<details class="map-popup-source"><summary>Source or research basis</summary><p>${esc(context.source_reference)}</p></details>` : ''}
    </article>`;
  }).join('');
}

function popupHtml(name, events, contexts, peopleById, eventBranches, contextBranches, branches) {
  const mode = events.length && contexts.length ? 'mixed' : contexts.length ? 'context' : 'event';
  const kicker = mode === 'mixed' ? 'Family event and historical context' : mode === 'context' ? 'Historical / research context' : 'Family event';
  return `<div class="map-popup"><p class="map-popup-kicker">${esc(kicker)}</p><h3>${esc(name)}</h3>${eventPopupRows(events, peopleById, eventBranches, branches)}${contextPopupRows(contexts, peopleById, contextBranches, branches)}</div>`;
}

function routePopup(route) {
  const status = route.route_status === 'inferred'
    ? 'Movement inferred from documented locations. The actual route and date of relocation have not yet been established.'
    : route.route_status === 'research_frontier'
      ? 'Research-frontier movement. This is not canonical.'
      : 'Documented movement.';
  return `<div class="map-route-popup"><strong>${esc(formatEventType(route.movement_type))}</strong><br>${esc(status)}${route.notes ? `<br>${esc(route.notes)}` : ''}${route.source_reference ? `<br>${esc(route.source_reference)}` : ''}</div>`;
}

function setStatus(message) {
  const status = document.getElementById('treeStatus');
  if (status) status.textContent = message;
}

function coordinateKey(coordinates) {
  return `${coordinates[0].toFixed(5)},${coordinates[1].toFixed(5)}`;
}

function offsetsForCount(count) {
  if (count <= 1) return [{ x: 0, y: 0 }];
  const radius = count <= 3 ? 9 : count <= 6 ? 13 : 17;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
  });
}

function arrowGeometry(fromCoordinates, toCoordinates) {
  const fraction = 0.78;
  const latitude = fromCoordinates[0] + (toCoordinates[0] - fromCoordinates[0]) * fraction;
  const longitude = fromCoordinates[1] + (toCoordinates[1] - fromCoordinates[1]) * fraction;
  const dx = toCoordinates[1] - fromCoordinates[1];
  const dy = -(toCoordinates[0] - fromCoordinates[0]);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return { coordinates: [latitude, longitude], angle };
}

function arrowHtml(colour, angle) {
  return `<span class="map-route-arrow" style="--map-route-colour:${esc(colour)};--map-route-angle:${angle.toFixed(2)}deg" aria-hidden="true"></span>`;
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
  const relevantContexts = data.contexts.filter((context) => centralIds.has(context.anchor_person_id) || personBranches.has(context.anchor_person_id));
  const years = [...relevantEvents, ...relevantContexts].map(recordYear).filter((year) => year !== null);
  const minYear = years.length ? Math.min(...years) : 1800;
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

  canvas.innerHTML = `<div class="map-view-shell">
    <section class="map-view-controls" aria-label="Map filters">
      <div>
        <p class="map-filter-title">Dynamic family branches</p>
        <div id="mapBranchLegend" class="map-branch-legend"></div>
        <div class="map-symbol-language" aria-label="Map symbol guide">
          <p class="map-filter-title">How to read the map</p>
          <div class="map-symbol-grid">
            <span><i class="map-symbol-dot is-small"></i> ordinary event</span>
            <span><i class="map-symbol-dot is-medium"></i> notable event</span>
            <span><i class="map-symbol-dot is-large"></i> major event</span>
            <span><i class="map-symbol-route"></i> movement</span>
          </div>
          <p class="map-filter-help">Each dot is one event. Larger dots mark events with greater historical weight. Ringed dots are historical or research context rather than a claim that an ancestor was personally present.</p>
        </div>
      </div>
      <div class="map-filter-stack">
        <div><p class="map-filter-title">Map content</p><div class="map-content-filters"><label><input type="checkbox" data-map-content="event" checked> Family events</label><label><input type="checkbox" data-map-content="context" checked> Historical / research context</label></div></div>
        <div><p class="map-filter-title">Evidence layers</p><div class="map-evidence-filters"><label><input type="checkbox" data-map-evidence="documented" checked> Documented</label><label><input type="checkbox" data-map-evidence="family"> Family evidence</label><label><input type="checkbox" data-map-evidence="frontier"> Research frontier</label></div></div>
        <div><p class="map-filter-title">Time period</p><div class="map-time-row"><span id="mapYearFromLabel">${minYear}</span><div class="map-time-inputs"><input id="mapYearFrom" type="range" min="${minYear}" max="${maxYear}" value="${minYear}" aria-label="Map start year"><input id="mapYearTo" type="range" min="${minYear}" max="${maxYear}" value="${maxYear}" aria-label="Map end year"></div><span id="mapYearToLabel">${maxYear}</span></div></div>
      </div>
    </section>
    <div id="historicalMap" class="historical-map" role="region" aria-label="Historical family events and movements"></div>
    <section class="map-view-notes"><div id="mapRouteNote" class="map-note"></div><div id="mapUnresolvedNote" class="map-note"></div></section>
  </div>`;

  const legend = document.getElementById('mapBranchLegend');
  branches.forEach((branch) => {
    const eventCount = relevantEvents.filter((event) => (personBranches.get(event.person_id) || []).includes(branch.index)).length;
    const contextCount = relevantContexts.filter((context) => (personBranches.get(context.anchor_person_id) || []).includes(branch.index)).length;
    const count = eventCount + contextCount;
    const details = [eventCount ? `${eventCount} event${eventCount === 1 ? '' : 's'}` : '', contextCount ? `${contextCount} context` : ''].filter(Boolean).join(', ');
    const item = document.createElement('div');
    item.className = `map-branch-key${count ? '' : ' is-empty'}`;
    item.innerHTML = `<span class="map-branch-swatch" style="--map-branch-colour:${branch.colour}"></span><span>${esc(branch.label)}<small>${count ? esc(details) : 'Insufficient research data for this period'}</small></span>`;
    legend?.appendChild(item);
  });

  const map = L.map('historicalMap', { zoomControl: true, preferCanvas: false });
  activeMap = map;
  map.attributionControl?.setPrefix(false);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(map);
  const locationLayer = L.layerGroup().addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  let initialBoundsApplied = false;

  const controls = {
    from: document.getElementById('mapYearFrom'),
    to: document.getElementById('mapYearTo'),
    fromLabel: document.getElementById('mapYearFromLabel'),
    toLabel: document.getElementById('mapYearToLabel'),
    evidence: [...document.querySelectorAll('[data-map-evidence]')],
    content: [...document.querySelectorAll('[data-map-content]')],
  };

  function withinTime(record, fromYear, toYear) {
    const year = recordYear(record);
    return year === null || (year >= fromYear && year <= toYear);
  }

  function renderLayers() {
    if (sequence + 1 !== renderSequence) return;
    let fromYear = Number(controls.from?.value || minYear);
    let toYear = Number(controls.to?.value || maxYear);
    if (fromYear > toYear) [fromYear, toYear] = [toYear, fromYear];
    if (controls.fromLabel) controls.fromLabel.textContent = String(fromYear);
    if (controls.toLabel) controls.toLabel.textContent = String(toYear);

    const enabledEvidence = new Set(controls.evidence.filter((input) => input.checked).map((input) => input.dataset.mapEvidence));
    const enabledContent = new Set(controls.content.filter((input) => input.checked).map((input) => input.dataset.mapContent));
    const visibleEvents = enabledContent.has('event') ? relevantEvents.filter((event) => enabledEvidence.has(evidenceGroup(event.source_status)) && withinTime(event, fromYear, toYear)) : [];
    const visibleContexts = enabledContent.has('context') ? relevantContexts.filter((context) => enabledEvidence.has(evidenceGroup(context.source_status)) && withinTime(context, fromYear, toYear)) : [];
    const visibleEventById = new Map(visibleEvents.map((event) => [event.id, event]));
    const eventBranches = new Map(visibleEvents.map((event) => [event.id, personBranches.get(event.person_id) || []]));
    const contextBranches = new Map(visibleContexts.map((context) => [context.id, personBranches.get(context.anchor_person_id) || []]));
    const unresolved = [];
    const mappedRecords = [];

    visibleEvents.forEach((event) => {
      const coordinates = recordCoordinates(event);
      if (coordinates) mappedRecords.push({ record: event, kind: 'event', coordinates, indexes: eventBranches.get(event.id) || [] });
      else unresolved.push({ record: event, kind: 'event' });
    });
    visibleContexts.forEach((context) => {
      const coordinates = recordCoordinates(context);
      if (coordinates) mappedRecords.push({ record: context, kind: 'context', coordinates, indexes: contextBranches.get(context.id) || [] });
      else unresolved.push({ record: context, kind: 'context' });
    });

    const coordinateGroups = new Map();
    mappedRecords.forEach((entry) => {
      const key = coordinateKey(entry.coordinates);
      const list = coordinateGroups.get(key) || [];
      list.push(entry);
      coordinateGroups.set(key, list);
    });
    coordinateGroups.forEach((entries) => {
      const offsets = offsetsForCount(entries.length);
      entries.forEach((entry, index) => { entry.offset = offsets[index] || { x: 0, y: 0 }; });
    });

    locationLayer.clearLayers();
    routeLayer.clearLayers();
    const visibleBounds = L.latLngBounds([]);

    mappedRecords.forEach((entry) => {
      const { record, kind, coordinates, indexes } = entry;
      const name = recordPlaceName(record);
      const importance = recordImportance(record, kind);
      const size = importance === 'major' ? 32 : importance === 'notable' ? 24 : 18;
      const marker = L.marker(coordinates, {
        keyboard: true,
        riseOnHover: true,
        title: kind === 'context' ? `${record.title} - ${name}` : `${canonicalName(peopleById.get(record.person_id))}: ${record.title || formatEventType(record.event_type)} - ${name}`,
        alt: `Open ${kind === 'context' ? 'historical context' : 'family event'} at ${name}`,
        icon: L.divIcon({
          className: 'genealogy-map-marker-host',
          html: dotHtml(record, kind, indexes, branches, entry.offset || { x: 0, y: 0 }),
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          popupAnchor: [entry.offset?.x || 0, -Math.max(12, size / 2) + (entry.offset?.y || 0)],
        }),
      });
      const popup = kind === 'context'
        ? popupHtml(name, [], [record], peopleById, eventBranches, contextBranches, branches)
        : popupHtml(name, [record], [], peopleById, eventBranches, contextBranches, branches);
      marker.bindPopup(popup, { maxWidth: 450, maxHeight: 500 });
      marker.addTo(locationLayer);
      visibleBounds.extend(coordinates);
    });

    let shownRoutes = 0;
    if (enabledContent.has('event')) {
      data.routes.forEach((route) => {
        const fromEvent = visibleEventById.get(route.from_event_id);
        const toEvent = visibleEventById.get(route.to_event_id);
        const fromCoordinates = fromEvent && recordCoordinates(fromEvent);
        const toCoordinates = toEvent && recordCoordinates(toEvent);
        if (!fromCoordinates || !toCoordinates) return;
        if (route.route_status === 'research_frontier' && !enabledEvidence.has('frontier')) return;
        const indexes = [...new Set([...(eventBranches.get(fromEvent.id) || []), ...(eventBranches.get(toEvent.id) || [])])];
        const colour = route.route_status === 'research_frontier' ? '#777' : markerSolidColour(indexes, branches);
        const line = L.polyline([fromCoordinates, toCoordinates], {
          color: colour,
          weight: route.route_status === 'documented' ? 3 : 2.5,
          opacity: route.route_status === 'research_frontier' ? .62 : .84,
          dashArray: route.route_status === 'documented' ? null : route.route_status === 'inferred' ? '8 7' : '3 7',
          lineCap: 'round',
        }).bindPopup(routePopup(route));
        line.addTo(routeLayer);
        const arrow = arrowGeometry(fromCoordinates, toCoordinates);
        L.marker(arrow.coordinates, {
          keyboard: true,
          title: `${formatEventType(route.movement_type)} movement`,
          icon: L.divIcon({
            className: 'map-route-arrow-host',
            html: arrowHtml(colour, arrow.angle),
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).bindPopup(routePopup(route)).addTo(routeLayer);
        shownRoutes += 1;
      });
    }

    const routeNote = document.getElementById('mapRouteNote');
    if (routeNote) routeNote.innerHTML = shownRoutes
      ? `<strong>Movement evidence</strong>${shownRoutes} separately reviewed movement route${shownRoutes === 1 ? '' : 's'} shown with arrowheads. Solid is documented; dashed is inferred; dotted is research frontier.`
      : '<strong>No movement line is being claimed</strong>Known locations are shown as individual dots without connecting them unless an explicit movement route has been separately reviewed.';

    const unresolvedNote = document.getElementById('mapUnresolvedNote');
    if (unresolvedNote) unresolvedNote.innerHTML = unresolved.length
      ? `<strong>Insufficient location data</strong>The following records remain unpinned rather than guessed:<ul class="map-unresolved-list">${unresolved.map(({ record, kind }) => `<li>${esc(formatRecordDate(record))} - ${esc(recordPlaceName(record) || record.title)} (${kind === 'context' ? 'context' : 'event'})</li>`).join('')}</ul>`
      : '<strong>Mapped records</strong>Every visible family event and context item in the selected period has at least a reviewed geographic point.';

    if (!initialBoundsApplied && visibleBounds.isValid()) {
      map.fitBounds(visibleBounds.pad(.14), { maxZoom: 8 });
      initialBoundsApplied = true;
    }
    const mappedPlaces = new Set(mappedRecords.map((entry) => coordinateKey(entry.coordinates))).size;
    const visibleTotal = visibleEvents.length + visibleContexts.length;
    setStatus(`${visibleTotal} map item${visibleTotal === 1 ? '' : 's'} shown as individual event dots across ${mappedPlaces} mapped location${mappedPlaces === 1 ? '' : 's'}: ${visibleEvents.length} family event${visibleEvents.length === 1 ? '' : 's'}, ${visibleContexts.length} context item${visibleContexts.length === 1 ? '' : 's'}; ${shownRoutes} movement route${shownRoutes === 1 ? '' : 's'}; ${unresolved.length} left unpinned.`);
  }

  controls.evidence.forEach((input) => input.addEventListener('change', renderLayers));
  controls.content.forEach((input) => input.addEventListener('change', renderLayers));
  controls.from?.addEventListener('input', renderLayers);
  controls.to?.addEventListener('input', renderLayers);
  renderLayers();
  if (!initialBoundsApplied) map.setView([-29.0, 25.0], 5);
  window.setTimeout(() => map.invalidateSize(), 50);
}
