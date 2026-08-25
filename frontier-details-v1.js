import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(URL, KEY);
const canvas = document.getElementById('treeCanvas');
const state = { candidates: [], people: new Map(), loaded: false };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
function personName(id) {
  const person = state.people.get(id);
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ') || 'the linked ancestor';
}
function slotLabel(slot) {
  if (slot === 'mother') return 'mother';
  if (slot === 'father') return 'father';
  return slot || 'parent';
}
function sameSlot(candidate) {
  return state.candidates
    .filter(other => other.id !== candidate.id && other.anchor_person_id === candidate.anchor_person_id && other.parent_slot === candidate.parent_slot && other.is_active !== false)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

function showCandidate(candidate) {
  const heading = document.getElementById('personName');
  const details = document.getElementById('personDetails');
  if (!heading || !details) return;
  const anchor = personName(candidate.anchor_person_id);
  const alternates = sameSlot(candidate);
  heading.textContent = candidate.label || 'Research candidate';
  const rows = [
    ['Status', 'Research frontier — lower confidence than a normal hypothesis'],
    ['Displayed position', `Possible ${slotLabel(candidate.parent_slot)} slot of ${anchor}`],
  ];
  if (candidate.year_text) rows.push(['Date / period', candidate.year_text]);
  if (candidate.detail) rows.push(['Why this lead matters', candidate.detail]);
  if (candidate.evidence_note) rows.push(['Evidence note', candidate.evidence_note]);
  rows.push(['Interpretation', 'This grey position is a research visualisation only. It does not create or assert a canonical parent-child relationship.']);
  if (alternates.length) rows.push(['Other live candidates in this slot', alternates.map(item => item.label).filter(Boolean).join(', ')]);
  details.innerHTML = rows.map(([label, value]) => `<div class="detail-line"><strong>${esc(label)}</strong>${esc(value)}</div>`).join('');
}

function candidateForNode(node) {
  const title = node.querySelector('title')?.textContent || '';
  if (!title) return null;
  return [...state.candidates]
    .sort((a, b) => String(b.label || '').length - String(a.label || '').length)
    .find(candidate => candidate.label && title.startsWith(candidate.label)) || null;
}

function decorate() {
  if (!state.loaded || !canvas) return;
  canvas.querySelectorAll('.research-frontier-node').forEach(node => {
    if (node.dataset.frontierClickable === '1') return;
    const candidate = candidateForNode(node);
    if (!candidate) return;
    node.dataset.frontierClickable = '1';
    node.dataset.frontierId = candidate.id;
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Research frontier candidate: ${candidate.label}. Show research notes.`);
    const activate = event => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      showCandidate(candidate);
    };
    node.addEventListener('click', activate);
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
  });
}

function installStyles() {
  if (document.getElementById('frontierDetailsStyles')) return;
  const style = document.createElement('style');
  style.id = 'frontierDetailsStyles';
  style.textContent = `
    .research-frontier-node[data-frontier-clickable="1"]{cursor:pointer}
    .research-frontier-node[data-frontier-clickable="1"]:hover>path,
    .research-frontier-node[data-frontier-clickable="1"]:focus>path{stroke:#3e3e3e!important;stroke-width:2.4!important;filter:drop-shadow(0 0 2px rgba(255,255,255,.9))}
  `;
  document.head.appendChild(style);
}

async function load() {
  const [candidateResult, peopleResult] = await Promise.all([
    supabase.from('research_frontier_candidates').select('id,anchor_person_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active').eq('is_active', true).order('priority'),
    supabase.from('people').select('id,given_names,surname'),
  ]);
  if (candidateResult.error || peopleResult.error) return;
  state.candidates = candidateResult.data || [];
  state.people = new Map((peopleResult.data || []).map(person => [person.id, person]));
  state.loaded = true;
  installStyles();
  decorate();
}

if (canvas) {
  const observer = new MutationObserver(() => window.setTimeout(decorate, 0));
  observer.observe(canvas, { childList: true, subtree: false });
}

document.addEventListener('genealogy:research-frontier-changed', () => window.setTimeout(decorate, 20));
supabase.auth.onAuthStateChange((_event, session) => { if (session) load(); });
const { data: { session } } = await supabase.auth.getSession();
if (session) await load();
