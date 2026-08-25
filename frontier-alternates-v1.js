import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(URL, KEY);
const FRONTIER_KEY = 'genealogyShowResearchFrontier';
const canvas = document.getElementById('treeCanvas');
const centre = document.getElementById('centreSelect');
const state = { candidates: [], loaded: false };

function enabled() {
  return localStorage.getItem(FRONTIER_KEY) === '1';
}
function side(candidate) {
  return candidate.parent_slot === 'mother' ? 1 : 0;
}
function titleText(candidate) {
  return [candidate.label, candidate.year_text, candidate.detail, candidate.evidence_note].filter(Boolean).join(' - ');
}
function targetPosition(svg, candidate) {
  const anchor = svg.querySelector(`.person-node[data-person-id="${CSS.escape(candidate.anchor_person_id)}"]`);
  if (anchor?.dataset.fanLevel !== undefined && anchor?.dataset.fanSlot !== undefined) {
    const level = Number(anchor.dataset.fanLevel) + 1;
    const slot = Number(anchor.dataset.fanSlot) * 2 + side(candidate);
    return { level, slot };
  }

  const centreCards = [...svg.querySelectorAll('.family-centre-person[data-person-id]')];
  const centreIndex = centreCards.findIndex(node => node.dataset.personId === candidate.anchor_person_id);
  if (centreIndex >= 0) return { level: 0, slot: centreIndex * 2 + side(candidate) };

  const singleCentre = svg.querySelector('.person-node[data-person-id]');
  if (singleCentre?.dataset.personId === candidate.anchor_person_id && singleCentre.dataset.fanLevel === undefined) {
    return { level: 0, slot: side(candidate) };
  }
  return null;
}
function markerHost(target) {
  const groups = [...target.children].filter(node => node.nodeName.toLowerCase() === 'g' && node.hasAttribute('transform'));
  return groups.at(-1) || target;
}
function addMarker(target, candidates) {
  if (!target?.classList.contains('person-node') || !candidates.length) return;
  const key = candidates.map(item => item.id).join('|');
  if (target.querySelector(`.frontier-alternate-marker[data-frontier-key="${CSS.escape(key)}"]`)) return;
  target.querySelectorAll('.frontier-alternate-marker').forEach(node => node.remove());

  const ns = 'http://www.w3.org/2000/svg';
  const candidate = candidates[0];
  const marker = document.createElementNS(ns, 'g');
  marker.classList.add('research-frontier-node', 'frontier-alternate-marker');
  marker.dataset.frontierKey = key;

  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '0');
  circle.setAttribute('cy', '-18');
  circle.setAttribute('r', candidates.length > 1 ? '8.5' : '7.5');
  circle.setAttribute('fill', '#8d8d8d');
  circle.setAttribute('fill-opacity', '.9');
  circle.setAttribute('stroke', '#555');
  circle.setAttribute('stroke-width', '1.2');
  circle.setAttribute('stroke-dasharray', '3 2');

  const text = document.createElementNS(ns, 'text');
  text.setAttribute('x', '0');
  text.setAttribute('y', '-15');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-family', 'Arial, sans-serif');
  text.setAttribute('font-weight', '800');
  text.setAttribute('font-size', candidates.length > 1 ? '6.5' : '8');
  text.setAttribute('fill', '#fff');
  text.setAttribute('pointer-events', 'none');
  text.textContent = candidates.length > 1 ? `?${candidates.length}` : '?';

  const title = document.createElementNS(ns, 'title');
  title.textContent = titleText(candidate);
  marker.append(circle, text, title);
  markerHost(target).appendChild(marker);
}
function decorate() {
  if (!canvas || !state.loaded) return;
  const svg = canvas.querySelector(':scope > svg');
  if (!svg) return;
  svg.querySelectorAll('.frontier-alternate-marker').forEach(node => node.remove());
  if (!enabled()) return;

  const grouped = new Map();
  state.candidates.forEach(candidate => {
    const position = targetPosition(svg, candidate);
    if (!position) return;
    const key = `${position.level}:${position.slot}`;
    const list = grouped.get(key) || [];
    list.push(candidate);
    grouped.set(key, list);
  });

  grouped.forEach((candidates, key) => {
    const [level, slot] = key.split(':');
    const target = svg.querySelector(`[data-fan-level="${level}"][data-fan-slot="${slot}"]`);
    if (!target?.classList.contains('person-node')) return;
    candidates.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    addMarker(target, candidates);
  });
}
async function load() {
  const { data, error } = await supabase
    .from('research_frontier_candidates')
    .select('id,anchor_person_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active')
    .eq('is_active', true)
    .order('priority');
  if (error) return;
  state.candidates = data || [];
  state.loaded = true;
  window.setTimeout(decorate, 0);
}

if (canvas) {
  const observer = new MutationObserver(() => window.setTimeout(decorate, 0));
  observer.observe(canvas, { childList: true, subtree: false });
}
centre?.addEventListener('change', () => window.setTimeout(decorate, 60));
document.addEventListener('genealogy:research-frontier-changed', () => window.setTimeout(decorate, 30));
document.addEventListener('genealogy:tree-suggestions-updated', () => load());
supabase.auth.onAuthStateChange((_event, session) => { if (session) load(); });
const { data: { session } } = await supabase.auth.getSession();
if (session) await load();
