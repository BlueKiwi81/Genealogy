import { supabase } from './supabase-client-v1.js';

const canvas = document.getElementById('treeCanvas');
const state = { roots: [], cascade: [], loaded: false };
let decorateTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function compact(value, max = 28) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function hideGenericUnknownQuestionMarks() {
  if (!canvas) return;
  canvas.querySelectorAll('g[data-fan-level][data-fan-slot]').forEach(node => {
    if (node.classList.contains('person-node') || node.classList.contains('research-frontier-node')) return;
    node.querySelectorAll('text').forEach(text => {
      const visible = text.textContent?.trim();
      if (visible === '?') text.remove();
    });
  });
}

function candidatesForLayer(layer) {
  return layer === 1 ? state.roots : state.cascade;
}

function candidateForNode(node) {
  const layer = Number(node.dataset.frontierLayer || '1');
  const explicit = node.dataset.frontierId;
  const pool = candidatesForLayer(layer);
  if (explicit) {
    const direct = pool.find(candidate => candidate.id === explicit);
    if (direct) return direct;
  }
  const title = node.querySelector('title')?.textContent || '';
  if (!title) return null;
  return [...pool]
    .filter(candidate => candidate.label)
    .sort((a, b) => String(b.label).length - String(a.label).length)
    .find(candidate => title.includes(candidate.label)) || null;
}

function ensureFallbackLabel(node, candidate) {
  if (!candidate) return;
  const existing = node.querySelector('text.frontier-fan-label, text.frontier-candidate-fallback');
  if (existing && existing.textContent?.trim() && existing.textContent.trim() !== '?') return;

  const host = node.querySelector('.fan-marker-host');
  if (!host) return;
  host.querySelector('text.frontier-candidate-fallback')?.remove();

  const ns = 'http://www.w3.org/2000/svg';
  const text = document.createElementNS(ns, 'text');
  text.setAttribute('class', 'frontier-candidate-fallback');
  text.setAttribute('x', '0');
  text.setAttribute('y', '-2');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-family', 'Arial, sans-serif');
  text.setAttribute('font-size', Number(node.dataset.frontierLayer || '1') === 1 ? '8' : '7');
  text.setAttribute('font-weight', '700');
  text.setAttribute('fill', '#3f3f3f');
  text.setAttribute('pointer-events', 'none');
  text.textContent = compact(candidate.label, 26);
  host.appendChild(text);
}

function ensureCascadeDialog() {
  let dialog = document.getElementById('frontierCascadeDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'frontierCascadeDialog';
  dialog.className = 'frontier-dialog frontier-cascade-dialog';
  dialog.innerHTML = `
    <div class="frontier-dialog-shell">
      <button class="frontier-dialog-close" type="button" aria-label="Close provisional ancestry details">×</button>
      <div id="frontierCascadeDialogBody"></div>
    </div>`;
  dialog.querySelector('.frontier-dialog-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.body.appendChild(dialog);
  return dialog;
}

function showCascadeCandidate(candidate, layer) {
  const dialog = ensureCascadeDialog();
  const body = dialog.querySelector('#frontierCascadeDialogBody');
  if (!body) return;
  const dependency = layer === 2
    ? 'This is a candidate parent of an immediate research-frontier candidate. It depends on the unproved link before it.'
    : 'This is the outermost provisional layer shown in the fan. It depends on both earlier unproved links.';
  body.innerHTML = `
    <p class="eyebrow">Provisional ancestry · layer ${layer}</p>
    <h2>${esc(candidate.label || 'Research candidate')}</h2>
    <p class="frontier-dialog-intro">${esc(dependency)}</p>
    <div class="frontier-dialog-details">
      ${candidate.year_text ? `<div class="detail-line"><strong>Date / period</strong>${esc(candidate.year_text)}</div>` : ''}
      ${candidate.detail ? `<div class="detail-line"><strong>Why this lead matters</strong>${esc(candidate.detail)}</div>` : ''}
      ${candidate.evidence_note ? `<div class="detail-line"><strong>Evidence note</strong>${esc(candidate.evidence_note)}</div>` : ''}
      <div class="detail-line"><strong>Status</strong>Candidate ancestry only — not part of the canonical family tree.</div>
    </div>`;
  if (!dialog.open) dialog.showModal();
}

function bindCascadeNode(node, candidate, layer) {
  if (!candidate || node.dataset.frontierCascadeBound === '1') return;
  node.dataset.frontierCascadeBound = '1';
  node.dataset.frontierId = candidate.id;
  node.dataset.frontierClickable = '1';
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', `Provisional ancestry layer ${layer}: ${candidate.label}. Open research notes.`);
  const activate = event => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    showCascadeCandidate(candidateForNode(node) || candidate, layer);
  };
  node.addEventListener('click', activate);
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
}

function decorate() {
  if (!state.loaded || !canvas) return;
  hideGenericUnknownQuestionMarks();

  let rootIdsChanged = false;
  canvas.querySelectorAll('.research-frontier-node').forEach(node => {
    const layer = Number(node.dataset.frontierLayer || '1');
    const candidate = candidateForNode(node);
    if (!candidate) return;
    ensureFallbackLabel(node, candidate);

    if (layer === 1) {
      if (node.dataset.frontierId !== candidate.id) {
        node.dataset.frontierId = candidate.id;
        rootIdsChanged = true;
      }
    } else {
      bindCascadeNode(node, candidate, layer);
    }
  });

  // The existing first-layer frontier dialog is richer and includes the research
  // and evidence-submission actions. Once an explicit id is present, ask it to
  // re-run its own decorator rather than duplicating that workflow here.
  if (rootIdsChanged) {
    document.dispatchEvent(new CustomEvent('genealogy:research-frontier-changed'));
  }
}

function scheduleDecorate(delay = 0) {
  window.clearTimeout(decorateTimer);
  decorateTimer = window.setTimeout(decorate, delay);
}

function installStyles() {
  if (document.getElementById('frontierDisplayFixV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'frontierDisplayFixV1Styles';
  style.textContent = `
    .research-frontier-node[data-frontier-clickable="1"]{cursor:pointer}
    .research-frontier-node[data-frontier-clickable="1"]:hover>path,
    .research-frontier-node[data-frontier-clickable="1"]:focus>path{stroke:#3e3e3e!important;stroke-width:2.4!important;filter:drop-shadow(0 0 2px rgba(255,255,255,.9))}
    .frontier-candidate-fallback{paint-order:stroke;stroke:rgba(255,255,255,.72);stroke-width:1.5px;stroke-linejoin:round}
  `;
  document.head.appendChild(style);
}

async function load() {
  const [rootsResult, cascadeResult] = await Promise.all([
    supabase.from('research_frontier_candidates')
      .select('id,anchor_person_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active')
      .eq('is_active', true)
      .order('priority'),
    supabase.from('research_frontier_cascade_candidates')
      .select('id,root_candidate_id,parent_node_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active')
      .eq('is_active', true)
      .order('priority'),
  ]);
  if (rootsResult.error) return;
  state.roots = rootsResult.data || [];
  state.cascade = cascadeResult.error ? [] : (cascadeResult.data || []);
  state.loaded = true;
  installStyles();
  scheduleDecorate();
}

if (canvas) {
  new MutationObserver(() => scheduleDecorate(0)).observe(canvas, { childList: true, subtree: false });
}

document.addEventListener('genealogy:research-frontier-changed', () => scheduleDecorate(20));
document.addEventListener('genealogy:tree-suggestions-updated', () => load());
supabase.auth.onAuthStateChange((_event, session) => { if (session) load(); });
const { data: { session } } = await supabase.auth.getSession();
if (session) await load();
