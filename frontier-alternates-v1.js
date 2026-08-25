import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(URL, KEY);
const FRONTIER_KEY = 'genealogyShowResearchFrontier';
const canvas = document.getElementById('treeCanvas');
const centre = document.getElementById('centreSelect');
const state = { candidates: [], people: new Map(), loaded: false };

function enabled() {
  return localStorage.getItem(FRONTIER_KEY) === '1';
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
function side(candidate) {
  return candidate.parent_slot === 'mother' ? 1 : 0;
}
function slotLabel(candidate) {
  return candidate.parent_slot === 'mother' ? 'mother' : candidate.parent_slot === 'father' ? 'father' : 'parent';
}
function personName(id) {
  const person = state.people.get(id);
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ') || 'this ancestor';
}
function titleText(candidate) {
  return [candidate.label, candidate.year_text, candidate.detail, candidate.evidence_note].filter(Boolean).join(' - ');
}
function installHelpStyles() {
  if (document.getElementById('frontierMarkerHelpStyles')) return;
  const style = document.createElement('style');
  style.id = 'frontierMarkerHelpStyles';
  style.textContent = `
    .frontier-alternate-marker{cursor:pointer;outline:none}
    .frontier-alternate-marker:hover circle,.frontier-alternate-marker:focus circle{stroke:#2f2f2f!important;stroke-width:2!important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.2))}
    .frontier-help-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(44,36,30,.38);backdrop-filter:blur(2px)}
    .frontier-help-dialog{width:min(620px,calc(100vw - 32px));max-height:min(78vh,760px);overflow:auto;border:1px solid #d6c8ba;border-radius:18px;background:#fffdf9;box-shadow:0 22px 60px rgba(43,31,23,.24);color:#3f342b}
    .frontier-help-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:18px 20px 12px;border-bottom:1px solid #eadfd4}
    .frontier-help-kicker{margin:0 0 4px;color:#7f7165;font:800 9px/1.1 Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase}
    .frontier-help-head h3{margin:0;font-size:22px;line-height:1.15}
    .frontier-help-close{border:0;background:#f0e6da;color:#5f5146;border-radius:999px;width:32px;height:32px;font:800 18px/1 Arial,sans-serif;cursor:pointer}
    .frontier-help-body{display:grid;gap:12px;padding:16px 20px 20px}
    .frontier-help-intro{margin:0;padding:11px 12px;border-radius:12px;background:#f3eee8;color:#665a50;font-size:13px;line-height:1.45}
    .frontier-help-card{padding:13px 14px;border:1px solid #e4d9cd;border-radius:13px;background:#fffaf3}
    .frontier-help-card h4{margin:0 0 7px;font-size:15px}
    .frontier-help-row{display:grid;grid-template-columns:126px 1fr;gap:10px;padding:5px 0;font-size:12px;line-height:1.42}
    .frontier-help-row strong{color:#75675b}
    .frontier-help-row span{color:#41372f}
    .frontier-help-foot{margin:0;color:#7f7165;font-size:11px;line-height:1.45}
    @media(max-width:560px){.frontier-help-row{grid-template-columns:1fr;gap:2px}.frontier-help-head h3{font-size:19px}}
  `;
  document.head.appendChild(style);
}
function closeHelp() {
  document.getElementById('frontierHelpBackdrop')?.remove();
}
function candidateCard(candidate) {
  const anchor = personName(candidate.anchor_person_id);
  const resolution = `A direct record that names ${candidate.label || 'this candidate'} as the ${slotLabel(candidate)} of ${anchor}, or equally strong evidence that rules the link out.`;
  return `<section class="frontier-help-card">
    <h4>${esc(candidate.label || 'Research lead')}</h4>
    <div class="frontier-help-row"><strong>Possible position</strong><span>${esc(`Possible ${slotLabel(candidate)} of ${anchor}`)}</span></div>
    ${candidate.year_text ? `<div class="frontier-help-row"><strong>Date / period</strong><span>${esc(candidate.year_text)}</span></div>` : ''}
    ${candidate.detail ? `<div class="frontier-help-row"><strong>Why this lead?</strong><span>${esc(candidate.detail)}</span></div>` : ''}
    ${candidate.evidence_note ? `<div class="frontier-help-row"><strong>Evidence so far</strong><span>${esc(candidate.evidence_note)}</span></div>` : ''}
    <div class="frontier-help-row"><strong>What resolves it?</strong><span>${esc(resolution)}</span></div>
  </section>`;
}
function showHelp(candidates) {
  closeHelp();
  installHelpStyles();
  const backdrop = document.createElement('div');
  backdrop.id = 'frontierHelpBackdrop';
  backdrop.className = 'frontier-help-backdrop';
  backdrop.setAttribute('role', 'presentation');
  const count = candidates.length;
  backdrop.innerHTML = `<section class="frontier-help-dialog" role="dialog" aria-modal="true" aria-labelledby="frontierHelpTitle">
    <header class="frontier-help-head">
      <div><p class="frontier-help-kicker">Research frontier</p><h3 id="frontierHelpTitle">Why is there a question mark here?</h3></div>
      <button type="button" class="frontier-help-close" aria-label="Close research explanation">×</button>
    </header>
    <div class="frontier-help-body">
      <p class="frontier-help-intro">This marker means there is ${count === 1 ? 'a serious research lead' : `${count} competing research leads`} behind this part of the tree, but not enough evidence to treat ${count === 1 ? 'it' : 'them'} as ordinary ancestry. The coloured person remains the current evidence-graded tree; the question mark shows where the research is still moving.</p>
      ${candidates.map(candidateCard).join('')}
      <p class="frontier-help-foot">A grey research-frontier lead is intentionally weaker than a normal hypothesis. It is there to show what we are investigating, not to imply that the relationship has been proved.</p>
    </div>
  </section>`;
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeHelp(); });
  backdrop.querySelector('.frontier-help-close')?.addEventListener('click', closeHelp);
  document.body.appendChild(backdrop);
  backdrop.querySelector('.frontier-help-close')?.focus();
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
  marker.setAttribute('tabindex', '0');
  marker.setAttribute('role', 'button');
  marker.setAttribute('aria-label', `Explain research frontier: ${candidates.map(item => item.label).filter(Boolean).join(', ')}`);

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
  title.textContent = `Click to explain: ${titleText(candidate)}`;
  marker.append(circle, text, title);
  const activate = event => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    showHelp(candidates);
  };
  marker.addEventListener('click', activate);
  marker.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
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
  const [candidateResult, peopleResult] = await Promise.all([
    supabase.from('research_frontier_candidates')
      .select('id,anchor_person_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active')
      .eq('is_active', true)
      .order('priority'),
    supabase.from('people').select('id,given_names,surname'),
  ]);
  if (candidateResult.error) return;
  state.candidates = candidateResult.data || [];
  state.people = new Map((peopleResult.data || []).map(person => [person.id, person]));
  state.loaded = true;
  installHelpStyles();
  window.setTimeout(decorate, 0);
}

document.addEventListener('keydown', event => { if (event.key === 'Escape') closeHelp(); });
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
