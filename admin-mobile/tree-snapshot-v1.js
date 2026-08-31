import { supabase } from '../supabase-client-v1.js';
import { preferredFamilyPartnerEntry } from '../relationship-rules-v1.js';
import { ancestryName } from '../person-name-v1.js';

const DEPTH_CAP = 6;
const PALETTE = ['#e7bea0', '#b8d5de', '#cbd6a6', '#d2c2df'];
const SOURCE_RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };

const card = document.getElementById('treeSnapshotCard');
const viewport = document.getElementById('treeSnapshotViewport');
const depthBadge = document.getElementById('treeSnapshotDepth');
const note = document.getElementById('treeSnapshotNote');
const zoomButton = document.getElementById('treeSnapshotZoom');
const adminApp = document.getElementById('adminApp');
const refreshButton = document.getElementById('refreshButton');

let loadedUserId = null;
let loadingForUserId = null;

function addMapEntry(map, key, value) {
  const list = map.get(key) || [];
  list.push(value);
  map.set(key, list);
}

function firstName(person) {
  return ancestryName(person, { shortGiven: true }) || person?.given_names || person?.surname || 'Unknown';
}

function years(person) {
  const birth = person?.birth_date?.slice(0, 4) || '';
  const death = person?.death_date?.slice(0, 4) || '';
  if (birth && death) return `${birth}-${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return '';
}

function polar(radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return [600 + radius * Math.cos(radians), 600 + radius * Math.sin(radians)];
}

function sectorPath(innerRadius, outerRadius, startAngle, endAngle) {
  const p1 = polar(outerRadius, startAngle);
  const p2 = polar(outerRadius, endAngle);
  const p3 = polar(innerRadius, endAngle);
  const p4 = polar(innerRadius, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${p1[0]} ${p1[1]} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`;
}

function branchIndex(slot, level, familyMode) {
  const rootBranches = familyMode ? 4 : 2;
  const slotsAtLevel = rootBranches * (2 ** level);
  return Math.min(rootBranches - 1, Math.floor(slot / (slotsAtLevel / rootBranches)));
}

function addCurvedText(group, ns, value, radius, startAngle, endAngle, className, fontSize, id) {
  if (!value) return;
  const span = endAngle - startAngle;
  const pad = Math.min(3, span * 0.08);
  const arcStart = startAngle + pad;
  const arcEnd = endAngle - pad;
  const mid = (arcStart + arcEnd) / 2;
  const reverse = mid > 90 && mid < 270;
  const from = reverse ? arcEnd : arcStart;
  const to = reverse ? arcStart : arcEnd;
  const [x1, y1] = polar(radius, from);
  const [x2, y2] = polar(radius, to);

  const guide = document.createElementNS(ns, 'path');
  guide.setAttribute('id', id);
  guide.setAttribute('d', `M ${x1} ${y1} A ${radius} ${radius} 0 ${span > 180 ? 1 : 0} ${reverse ? 0 : 1} ${x2} ${y2}`);
  guide.setAttribute('class', 'tree-snapshot-guide');
  group.appendChild(guide);

  const text = document.createElementNS(ns, 'text');
  text.setAttribute('class', className);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', String(fontSize));
  const textPath = document.createElementNS(ns, 'textPath');
  textPath.setAttribute('href', `#${id}`);
  textPath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${id}`);
  textPath.setAttribute('startOffset', '50%');
  textPath.textContent = value;
  text.appendChild(textPath);
  group.appendChild(text);
}

function renderSnapshot(people, relationships, centreId) {
  const peopleById = new Map(people.map((item) => [item.id, item]));
  const parentEdgesByChild = new Map();
  const childIdsByParent = new Map();
  const partnerEdgesByPerson = new Map();

  relationships.forEach((relationship) => {
    if (relationship?.is_active === false) return;
    if (relationship.relationship_type === 'parent') {
      addMapEntry(parentEdgesByChild, relationship.person2_id, relationship);
      addMapEntry(childIdsByParent, relationship.person1_id, relationship.person2_id);
    } else if (['spouse', 'partner', 'former_spouse'].includes(relationship.relationship_type)) {
      addMapEntry(partnerEdgesByPerson, relationship.person1_id, relationship);
      addMapEntry(partnerEdgesByPerson, relationship.person2_id, relationship);
    }
  });

  const person = (id) => peopleById.get(id) || null;

  function parentEdgesOf(personId) {
    return (parentEdgesByChild.get(personId) || [])
      .map((relationship) => ({ relationship, person: person(relationship.person1_id) }))
      .filter((entry) => entry.person)
      .sort((a, b) => {
        const rank = (SOURCE_RANK[b.relationship.source_status] || 0) - (SOURCE_RANK[a.relationship.source_status] || 0);
        return rank || firstName(a.person).localeCompare(firstName(b.person));
      });
  }

  function parentPairOf(personId) {
    const candidates = parentEdgesOf(personId);
    const slots = [null, null];
    const used = new Set();
    const father = candidates.findIndex((entry) => entry.person.gender === 'male');
    const mother = candidates.findIndex((entry) => entry.person.gender === 'female');
    if (father >= 0) { slots[0] = candidates[father]; used.add(father); }
    if (mother >= 0) { slots[1] = candidates[mother]; used.add(mother); }
    candidates.forEach((entry, index) => {
      if (used.has(index)) return;
      const open = slots.findIndex((slot) => slot === null);
      if (open >= 0) slots[open] = entry;
    });
    return slots;
  }

  function partnerEdgesOf(personId) {
    return (partnerEdgesByPerson.get(personId) || [])
      .map((relationship) => ({
        relationship,
        person: person(relationship.person1_id === personId ? relationship.person2_id : relationship.person1_id),
      }))
      .filter((entry) => entry.person);
  }

  function childrenOf(personId) {
    return [...new Set(childIdsByParent.get(personId) || [])]
      .map(person)
      .filter(Boolean)
      .sort((a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999'));
  }

  function coupleChildren(a, b) {
    if (!b) return childrenOf(a.id);
    const left = new Set(childrenOf(a.id).map((child) => child.id));
    const right = new Set(childrenOf(b.id).map((child) => child.id));
    const shared = [...left].filter((id) => right.has(id)).map(person).filter(Boolean);
    return shared.length ? shared : [...new Set([...left, ...right])].map(person).filter(Boolean);
  }

  const centre = person(centreId) || people[0];
  if (!centre) throw new Error('No family people are available yet.');
  const partner = preferredFamilyPartnerEntry(partnerEdgesOf(centre.id))?.person || null;
  const familyMode = Boolean(partner);

  let researchMax = 1;
  function walk(id, depth, path) {
    if (!id || depth >= 12 || path.has(id)) return;
    researchMax = Math.max(researchMax, depth + 1);
    const nextPath = new Set(path);
    nextPath.add(id);
    parentEdgesOf(id).forEach(({ person: parent }) => walk(parent.id, depth + 1, nextPath));
  }
  [centre, partner].filter(Boolean).forEach((root) => walk(root.id, 0, new Set()));

  const depth = Math.max(1, Math.min(DEPTH_CAP, researchMax));
  const levels = [];
  let current = familyMode ? [...parentPairOf(centre.id), ...parentPairOf(partner.id)] : parentPairOf(centre.id);
  levels.push(current);
  for (let generation = 1; generation < depth; generation += 1) {
    const next = [];
    current.forEach((entry) => {
      if (!entry?.person) { next.push(null, null); return; }
      next.push(...parentPairOf(entry.person.id));
    });
    levels.push(next);
    current = next;
  }

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 1200 1200');
  svg.setAttribute('class', 'tree-snapshot-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', partner ? `Read-only family fan for ${firstName(centre)} and ${firstName(partner)}` : `Read-only family fan for ${firstName(centre)}`);

  const inner = familyMode ? 180 : 125;
  const gap = 2;
  const thickness = (575 - inner - gap * (depth - 1)) / depth;

  levels.forEach((entries, level) => {
    const step = 360 / entries.length;
    const innerRadius = inner + level * (thickness + gap);
    const outerRadius = innerRadius + thickness;
    entries.forEach((entry, slot) => {
      const group = document.createElementNS(ns, 'g');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', sectorPath(innerRadius, outerRadius, slot * step, (slot + 1) * step));
      path.setAttribute('class', `tree-snapshot-wedge${entry?.person ? '' : ' tree-snapshot-empty'}`);
      if (entry?.person) {
        path.setAttribute('fill', PALETTE[branchIndex(slot, level, familyMode) % PALETTE.length]);
        const status = entry.relationship?.source_status || entry.person.source_status || 'unresolved';
        path.setAttribute('fill-opacity', status === 'hypothesis' ? '.42' : status === 'probable' ? '.62' : status === 'family_supplied' ? '.82' : '.94');
        if (status === 'hypothesis') path.setAttribute('stroke-dasharray', '8 5');
        else if (status === 'probable') path.setAttribute('stroke-dasharray', '5 4');
      }
      group.appendChild(path);

      const textRadius = (innerRadius + outerRadius) / 2;
      const count = (familyMode ? 4 : 2) * (2 ** level);
      const size = count >= 128 ? 6.2 : count >= 64 ? 7.2 : count >= 32 ? 8 : count >= 16 ? 9 : 10.5;
      if (entry?.person) {
        addCurvedText(group, ns, firstName(entry.person), textRadius - 5, slot * step, (slot + 1) * step, 'tree-snapshot-label', size, `snapshot-name-${level}-${slot}`);
        if (years(entry.person)) addCurvedText(group, ns, years(entry.person), textRadius + 10, slot * step, (slot + 1) * step, 'tree-snapshot-date', Math.max(4.8, size - 2), `snapshot-date-${level}-${slot}`);
      } else if (count <= 128) {
        addCurvedText(group, ns, '?', textRadius, slot * step, (slot + 1) * step, 'tree-snapshot-label', size, `snapshot-empty-${level}-${slot}`);
      }
      svg.appendChild(group);
    });
  });

  const centreDisc = document.createElementNS(ns, 'circle');
  centreDisc.setAttribute('cx', '600');
  centreDisc.setAttribute('cy', '600');
  centreDisc.setAttribute('r', familyMode ? '160' : '105');
  centreDisc.setAttribute('class', 'tree-snapshot-centre');
  svg.appendChild(centreDisc);

  if (familyMode) {
    [centre, partner].forEach((item, index) => {
      const x = index ? 685 : 515;
      const y = 555;
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', String(x - 75));
      rect.setAttribute('y', String(y - 27));
      rect.setAttribute('width', '150');
      rect.setAttribute('height', '54');
      rect.setAttribute('rx', '14');
      rect.setAttribute('class', 'tree-snapshot-centre-card');
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y + 6));
      text.setAttribute('class', 'tree-snapshot-centre-name');
      text.textContent = firstName(item);
      svg.append(rect, text);
    });

    const link = document.createElementNS(ns, 'line');
    link.setAttribute('x1', '590');
    link.setAttribute('y1', '555');
    link.setAttribute('x2', '610');
    link.setAttribute('y2', '555');
    link.setAttribute('class', 'tree-snapshot-couple-link');
    svg.appendChild(link);

    const children = coupleChildren(centre, partner);
    const width = Math.min(270, Math.max(170, children.length * 58));
    children.forEach((child, index) => {
      const x = children.length === 1 ? 600 : 600 - width / 2 + width * index / Math.max(1, children.length - 1);
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', '668');
      circle.setAttribute('r', '23');
      circle.setAttribute('class', 'tree-snapshot-child');
      const initial = document.createElementNS(ns, 'text');
      initial.setAttribute('x', String(x));
      initial.setAttribute('y', '674');
      initial.setAttribute('class', 'tree-snapshot-child-initial');
      initial.textContent = String(child.given_names || '?')[0];
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', '708');
      label.setAttribute('class', 'tree-snapshot-child-label');
      label.textContent = firstName(child);
      svg.append(circle, initial, label);
    });
  } else {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', '600');
    text.setAttribute('y', '607');
    text.setAttribute('class', 'tree-snapshot-centre-name');
    text.textContent = firstName(centre);
    svg.appendChild(text);
  }

  viewport.replaceChildren(svg);
  depthBadge.textContent = `${depth} gen`;
  note.textContent = researchMax > DEPTH_CAP
    ? `Read-only overview. Showing ${DEPTH_CAP} of ${researchMax} recorded ancestry generations. Tap Zoom to inspect and scroll.`
    : 'Read-only overview of the current family fan. Tap Zoom to inspect names and scroll.';
}

async function loadSnapshot(force = false) {
  if (!card || !viewport || !adminApp || adminApp.classList.contains('hidden')) return;
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  if (!force && (loadedUserId === userId || loadingForUserId === userId)) return;

  loadingForUserId = userId;
  depthBadge.textContent = 'Loading';
  viewport.innerHTML = '<div class="tree-snapshot-loading">Building the current read-only family fan...</div>';

  try {
    const [profileResult, peopleResult, relationshipsResult] = await Promise.all([
      supabase.from('app_users').select('person_id').eq('user_id', userId).maybeSingle(),
      supabase.from('people').select('id,given_names,preferred_name,preferred_name_status,surname,birth_surname,current_surname,gender,birth_date,death_date,source_status,is_active').order('surname').order('given_names'),
      supabase.from('relationships').select('*'),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (peopleResult.error) throw peopleResult.error;
    if (relationshipsResult.error) throw relationshipsResult.error;

    const people = (peopleResult.data || []).filter((item) => item.is_active !== false);
    const relationships = (relationshipsResult.data || []).filter((item) => item.is_active !== false);
    renderSnapshot(people, relationships, profileResult.data?.person_id || null);
    loadedUserId = userId;
  } catch (error) {
    const message = String(error?.message || '').replace(/[<>]/g, '');
    viewport.innerHTML = `<div class="tree-snapshot-error">The family fan could not load right now.${message ? ` ${message}` : ''}</div>`;
    depthBadge.textContent = 'Unavailable';
    note.textContent = 'The rest of the mobile admin remains available.';
  } finally {
    if (loadingForUserId === userId) loadingForUserId = null;
  }
}

zoomButton?.addEventListener('click', () => {
  const zoomed = viewport.classList.toggle('zoomed');
  zoomButton.textContent = zoomed ? 'Fit' : 'Zoom';
  zoomButton.setAttribute('aria-pressed', String(zoomed));
  if (zoomed) {
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
    });
  } else {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
});

if (adminApp) {
  const observer = new MutationObserver(() => {
    if (!adminApp.classList.contains('hidden')) void loadSnapshot();
  });
  observer.observe(adminApp, { attributes: true, attributeFilter: ['class'] });
}

refreshButton?.addEventListener('click', () => void loadSnapshot(true));

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    loadedUserId = null;
    loadingForUserId = null;
  } else {
    window.setTimeout(() => void loadSnapshot(), 0);
  }
});

if (adminApp && !adminApp.classList.contains('hidden')) void loadSnapshot();
