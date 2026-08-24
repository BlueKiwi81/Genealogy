const FRONTIER_SUPABASE_HOST = 'jkakvpsiiffnidggcqzc.supabase.co';
const FRONTIER_SUPABASE_URL = `https://${FRONTIER_SUPABASE_HOST}`;
const FRONTIER_SUPABASE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const FRONTIER_STORAGE_KEY = 'genealogyShowResearchFrontier';
const FRONTIER_SOURCE_RANK = { documented: 6, strong: 5, family_supplied: 4, probable: 3, hypothesis: 2, unresolved: 1 };
const FRONTIER_RING_RADII = [[112, 190], [192, 280], [282, 375], [377, 470]];

let frontierData = null;
let frontierLoadAt = 0;
let frontierRenderTimer = null;

function frontierOriginalFetch() {
  return window.__genealogyOriginalFetch || window.fetch.bind(window);
}

function frontierAuthHeader() {
  return window.__genealogyAuthHeader || null;
}

function frontierPolar(cx, cy, radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

function frontierSectorPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  const p1 = frontierPolar(cx, cy, outerRadius, startAngle);
  const p2 = frontierPolar(cx, cy, outerRadius, endAngle);
  const p3 = frontierPolar(cx, cy, innerRadius, endAngle);
  const p4 = frontierPolar(cx, cy, innerRadius, startAngle);
  const large = (endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${p1[0]} ${p1[1]} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`;
}

function frontierRotation(mid) {
  let rotation = mid;
  if (mid > 90 && mid < 270) rotation += 180;
  return rotation;
}

function frontierDisplayName(person) {
  if (!person) return 'Unknown';
  const preferred = person.preferred_name?.trim();
  const given = person.given_names?.trim() || '';
  const surname = person.surname?.trim() || '';
  return [preferred || given, surname].filter(Boolean).join(' ');
}

async function frontierLoadData(force = false) {
  const auth = frontierAuthHeader();
  if (!auth) return null;
  const now = Date.now();
  if (!force && frontierData && now - frontierLoadAt < 30000) return frontierData;
  const headers = {
    apikey: FRONTIER_SUPABASE_KEY,
    Authorization: auth,
    Accept: 'application/json',
    'x-genealogy-canonical': '1',
  };
  const fetcher = frontierOriginalFetch();
  const [peopleResponse, relationshipsResponse, candidatesResponse] = await Promise.all([
    fetcher(`${FRONTIER_SUPABASE_URL}/rest/v1/people?select=id,given_names,surname,preferred_name,gender,source_status,is_active`, { headers }),
    fetcher(`${FRONTIER_SUPABASE_URL}/rest/v1/relationships?select=id,person1_id,person2_id,relationship_type,source_status,is_active`, { headers }),
    fetcher(`${FRONTIER_SUPABASE_URL}/rest/v1/research_frontier_candidates?select=id,anchor_person_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active&is_active=eq.true&order=priority.asc`, { headers }),
  ]);
  if (!peopleResponse.ok || !relationshipsResponse.ok || !candidatesResponse.ok) return null;
  frontierData = {
    people: await peopleResponse.json(),
    relationships: await relationshipsResponse.json(),
    candidates: await candidatesResponse.json(),
  };
  frontierLoadAt = now;
  return frontierData;
}

function frontierParentPair(personId, peopleById, relationships) {
  const candidates = relationships
    .filter((r) => r.is_active !== false && r.relationship_type === 'parent' && r.person2_id === personId)
    .map((relationship) => ({ relationship, person: peopleById.get(relationship.person1_id) }))
    .filter((entry) => entry.person)
    .sort((a, b) => {
      const rankDiff = (FRONTIER_SOURCE_RANK[b.relationship.source_status] || 0) - (FRONTIER_SOURCE_RANK[a.relationship.source_status] || 0);
      if (rankDiff) return rankDiff;
      return frontierDisplayName(a.person).localeCompare(frontierDisplayName(b.person));
    });
  const slots = [null, null];
  const used = new Set();
  const fatherIndex = candidates.findIndex((entry) => entry.person.gender === 'male');
  if (fatherIndex >= 0) { slots[0] = candidates[fatherIndex]; used.add(fatherIndex); }
  const motherIndex = candidates.findIndex((entry) => entry.person.gender === 'female');
  if (motherIndex >= 0) { slots[1] = candidates[motherIndex]; used.add(motherIndex); }
  candidates.forEach((entry, index) => {
    if (used.has(index)) return;
    const open = slots.findIndex((slot) => slot === null);
    if (open >= 0) slots[open] = entry;
  });
  return slots;
}

function frontierLevels(centreId, data) {
  const peopleById = new Map(data.people.map((person) => [person.id, person]));
  const levels = [];
  let current = [{ person: peopleById.get(centreId) || null, relationship: null }];
  for (let generation = 0; generation < 4; generation += 1) {
    const next = [];
    current.forEach((entry) => {
      if (!entry?.person) { next.push(null, null); return; }
      const [father, mother] = frontierParentPair(entry.person.id, peopleById, data.relationships);
      next.push(father, mother);
    });
    levels.push(next);
    current = next;
  }
  return { levels, peopleById };
}

function frontierAnchorPositions(centreId, levels) {
  const positions = new Map();
  positions.set(centreId, [{ level: -1, slot: 0 }]);
  levels.forEach((entries, level) => {
    entries.forEach((entry, slot) => {
      if (!entry?.person) return;
      const list = positions.get(entry.person.id) || [];
      list.push({ level, slot });
      positions.set(entry.person.id, list);
    });
  });
  return positions;
}

function frontierOriginalGroupIndex(level, slot) {
  let offset = 0;
  for (let i = 0; i < level; i += 1) offset += 2 ** (i + 1);
  return offset + slot;
}

function frontierHideQuestion(svg, level, slot) {
  const index = frontierOriginalGroupIndex(level, slot);
  const group = svg.children[index];
  if (!group || group.classList.contains('person-node')) return;
  if (!group.dataset.frontierOriginalOpacity) group.dataset.frontierOriginalOpacity = group.style.opacity || '1';
  group.style.opacity = '0';
  group.dataset.frontierHidden = '1';
}

function frontierRestoreQuestions(svg) {
  [...svg.children].forEach((group) => {
    if (group?.dataset?.frontierHidden !== '1') return;
    group.style.opacity = group.dataset.frontierOriginalOpacity || '1';
    delete group.dataset.frontierHidden;
    delete group.dataset.frontierOriginalOpacity;
  });
}

function frontierSplitLabel(label) {
  const words = String(label || '').split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [words.join(' ')];
  let first = '';
  let second = '';
  words.forEach((word) => {
    if (!second && (first.length + word.length + 1) <= 18) first = [first, word].filter(Boolean).join(' ');
    else second = [second, word].filter(Boolean).join(' ');
  });
  return second ? [first, second] : [first];
}

function frontierCandidateGroup(ns, candidate, level, slot, count) {
  const cx = 500;
  const cy = 500;
  const slots = 2 ** (level + 1);
  const step = 360 / slots;
  const startAngle = slot * step;
  const endAngle = (slot + 1) * step;
  const [innerRadius, outerRadius] = FRONTIER_RING_RADII[level];
  const mid = (startAngle + endAngle) / 2;
  const group = document.createElementNS(ns, 'g');
  group.classList.add('research-frontier-node');
  group.setAttribute('data-frontier-candidate-id', candidate.id);

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', frontierSectorPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle));
  path.setAttribute('fill', '#b8b8b8');
  path.setAttribute('fill-opacity', '.78');
  path.setAttribute('stroke', '#666');
  path.setAttribute('stroke-width', '1.4');
  path.setAttribute('stroke-dasharray', '4 3');
  group.appendChild(path);

  const title = document.createElementNS(ns, 'title');
  title.textContent = [candidate.label, candidate.year_text, candidate.detail, candidate.evidence_note].filter(Boolean).join(' - ');
  group.appendChild(title);

  const [textX, textY] = frontierPolar(cx, cy, (innerRadius + outerRadius) / 2, mid);
  const wrap = document.createElementNS(ns, 'g');
  wrap.setAttribute('transform', `translate(${textX} ${textY}) rotate(${frontierRotation(mid)})`);
  const lines = frontierSplitLabel(candidate.label);
  lines.slice(0, 2).forEach((line, index) => {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', String(-6 + index * 12));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', level < 2 ? '11' : '9');
    text.setAttribute('font-weight', '600');
    text.setAttribute('fill', '#303030');
    text.textContent = line;
    wrap.appendChild(text);
  });
  const sub = document.createElementNS(ns, 'text');
  sub.setAttribute('x', '0');
  sub.setAttribute('y', String(lines.length > 1 ? 20 : 9));
  sub.setAttribute('text-anchor', 'middle');
  sub.setAttribute('font-size', level < 2 ? '9' : '8');
  sub.setAttribute('fill', '#4f4f4f');
  sub.textContent = [candidate.year_text, count > 1 ? `+${count - 1} alternate` : 'FRONTIER'].filter(Boolean).join(' | ');
  wrap.appendChild(sub);
  group.appendChild(wrap);
  return group;
}

async function frontierRender() {
  const toggle = document.getElementById('frontierToggle');
  const treeCanvas = document.getElementById('treeCanvas');
  const centreSelect = document.getElementById('centreSelect');
  const svg = treeCanvas?.querySelector('svg');
  if (!svg) return;

  svg.querySelectorAll('.research-frontier-node').forEach((node) => node.remove());
  frontierRestoreQuestions(svg);
  if (!toggle?.checked) return;

  const data = await frontierLoadData();
  if (!data || !centreSelect?.value) return;
  const centreId = centreSelect.value;
  const { levels } = frontierLevels(centreId, data);
  const positions = frontierAnchorPositions(centreId, levels);
  const grouped = new Map();

  data.candidates.filter((candidate) => candidate.is_active !== false).forEach((candidate) => {
    const anchors = positions.get(candidate.anchor_person_id) || [];
    anchors.forEach((anchor) => {
      const level = anchor.level + 1;
      if (level < 0 || level > 3) return;
      const side = candidate.parent_slot === 'mother' ? 1 : 0;
      const slot = anchor.level === -1 ? side : anchor.slot * 2 + side;
      if (levels[level]?.[slot]?.person) return;
      const key = `${level}:${slot}`;
      const list = grouped.get(key) || [];
      list.push(candidate);
      grouped.set(key, list);
    });
  });

  const ns = 'http://www.w3.org/2000/svg';
  grouped.forEach((list, key) => {
    list.sort((a, b) => (a.priority || 100) - (b.priority || 100));
    const [levelText, slotText] = key.split(':');
    const level = Number(levelText);
    const slot = Number(slotText);
    frontierHideQuestion(svg, level, slot);
    svg.appendChild(frontierCandidateGroup(ns, list[0], level, slot, list.length));
  });
}

function frontierScheduleRender() {
  clearTimeout(frontierRenderTimer);
  frontierRenderTimer = setTimeout(() => frontierRender().catch(() => {}), 40);
}

function frontierInstallToggle() {
  if (document.getElementById('frontierToggle')) return;
  const centreSelect = document.getElementById('centreSelect');
  const panelHead = centreSelect?.closest('.panel-head');
  if (!centreSelect || !panelHead) return;
  const label = document.createElement('label');
  label.className = 'check-row';
  label.title = 'Show very early research candidates and locality/household leads in grey. These are weaker than the normal hypothesis shading.';
  const checkbox = document.createElement('input');
  checkbox.id = 'frontierToggle';
  checkbox.type = 'checkbox';
  checkbox.checked = localStorage.getItem(FRONTIER_STORAGE_KEY) === '1';
  const span = document.createElement('span');
  span.textContent = 'Research frontier';
  label.append(checkbox, span);
  panelHead.appendChild(label);
  checkbox.addEventListener('change', () => {
    localStorage.setItem(FRONTIER_STORAGE_KEY, checkbox.checked ? '1' : '0');
    frontierScheduleRender();
  });
  centreSelect.addEventListener('change', frontierScheduleRender);

  const treeCanvas = document.getElementById('treeCanvas');
  if (treeCanvas) {
    const observer = new MutationObserver(() => {
      if (checkbox.checked) frontierScheduleRender();
    });
    observer.observe(treeCanvas, { childList: true });
  }
  if (checkbox.checked) frontierScheduleRender();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', frontierInstallToggle);
else frontierInstallToggle();
