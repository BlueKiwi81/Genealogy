import { supabase } from './supabase-client-v1.js';

const PROTECTED = new Set(['documented', 'strong']);
const FIELDS = ['given_names','surname','birth_surname','current_surname','preferred_name','gender','birth_date','death_date','life_status','birth_place','death_place','residence_summary','final_rest_type','final_rest_place','occupation_summary','military_service_summary','historical_context','narrative_summary'];
const LABELS = {
  given_names:'Given name(s)', surname:'Display surname', birth_surname:'Birth / maiden surname', current_surname:'Married / current surname', preferred_name:'Known as', gender:'Gender', birth_date:'Birth date', death_date:'Death date', life_status:'Life status', birth_place:'Birth place', death_place:'Death place', residence_summary:'Where they lived', final_rest_type:'Final rest type', final_rest_place:'Final resting place', occupation_summary:'Occupation', military_service_summary:'Military service', historical_context:'Historical context', narrative_summary:'Family note'
};
let timer = null;
const busy = new Set();

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const valueText = (value) => value == null || value === '' ? 'Not recorded' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const personName = (person) => [person?.given_names, person?.birth_surname || person?.surname || person?.current_surname].filter(Boolean).join(' ') || 'Unnamed person';

function installStyles() {
  if (document.getElementById('treeSelectiveDecisionStyles')) return;
  const style = document.createElement('style');
  style.id = 'treeSelectiveDecisionStyles';
  style.textContent = `
    .tree-selective-decisions{margin:12px 0;padding:12px;border:2px solid rgba(91,72,55,.22);border-radius:12px;background:#fffdf8}
    .tree-selective-decisions h4{margin:0 0 4px;font-size:13px;color:#3f3329}
    .tree-selective-decisions>p{margin:4px 0 10px;font-size:10px;line-height:1.45;color:#5e5146}
    .tree-decision-list{display:grid;gap:8px}
    .tree-decision-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:9px;border:1px solid rgba(91,72,55,.16);border-radius:9px;background:#fff}
    .tree-decision-copy{display:grid;gap:2px;min-width:0}.tree-decision-copy strong{font-size:9px;text-transform:uppercase;color:#645548}.tree-decision-copy small{font-size:9px;color:#75685d;white-space:pre-wrap}.tree-decision-copy b{font-size:9.8px;color:#44392f;white-space:pre-wrap}
    .tree-decision-controls{display:flex;gap:5px;align-items:center}.tree-decision-controls label{display:inline-flex!important;gap:4px!important;align-items:center!important;padding:5px 7px;border:1px solid rgba(91,72,55,.2);border-radius:999px;background:#faf7f2;font-size:9px!important;font-weight:700!important;cursor:pointer}.tree-decision-controls input{width:auto!important;margin:0!important}
    .tree-decision-row.blocked{background:#fff3f0;border-color:rgba(140,65,65,.32)}.tree-decision-row.already{background:#f4f3f0}.tree-decision-note{display:grid!important;gap:4px!important;margin:9px 0;font-size:9.5px!important;font-weight:700}.tree-decision-note textarea,.tree-decision-existing select{width:100%;box-sizing:border-box;border:1px solid rgba(91,72,55,.2);border-radius:8px;padding:7px;background:#fff}.tree-decision-existing{display:grid!important;gap:4px!important;margin:8px 0;font-size:9.5px!important;font-weight:700}.tree-decision-status{font-size:9px!important;margin:7px 0 0!important}.tree-decision-status.error{color:#8a3e36}.tree-decision-status.success{color:#466648}
  `;
  document.head.appendChild(style);
}

function setMessage(text='', type='') {
  const node = document.getElementById('treeChangeReviewMessage');
  if (!node) return;
  node.textContent = text;
  node.className = `message${type ? ` ${type}` : ''}`;
}

function score(relative, person) {
  let points = 0;
  const rg = norm(relative?.given_names), pg = norm(person?.given_names);
  if (rg && rg === pg) points += 6; else if (rg.split(' ')[0] && rg.split(' ')[0] === pg.split(' ')[0]) points += 3;
  const rs = [relative?.birth_surname,relative?.surname,relative?.current_surname].map(norm).filter(Boolean);
  const ps = [person?.birth_surname,person?.surname,person?.current_surname].map(norm).filter(Boolean);
  if (rs.some((s) => ps.includes(s))) points += 4;
  if (relative?.birth_date && person?.birth_date && String(relative.birth_date).slice(0,10) === String(person.birth_date).slice(0,10)) points += 7;
  if (relative?.death_date && person?.death_date && String(relative.death_date).slice(0,10) === String(person.death_date).slice(0,10)) points += 3;
  return points;
}

function effectiveRole(rel, targetId, otherId) {
  if (rel.relationship_type === 'parent') {
    if (rel.person1_id === otherId && rel.person2_id === targetId) return 'parent';
    if (rel.person1_id === targetId && rel.person2_id === otherId) return 'child';
  }
  return rel.relationship_type;
}

function relationshipState(ctx, existingId) {
  const proposed = String(ctx.change.payload?.role || '');
  const pair = ctx.relationships.filter((rel) => PROTECTED.has(rel.source_status) && ((rel.person1_id === ctx.target.id && rel.person2_id === existingId) || (rel.person1_id === existingId && rel.person2_id === ctx.target.id)));
  const roles = [...new Set(pair.map((rel) => effectiveRole(rel, ctx.target.id, existingId)))];
  if (roles.includes(proposed)) return {kind:'already', message:`The proposed ${proposed} relationship already exists with protected evidence.`};
  if (roles.length) return {kind:'blocked', message:`Blocked: these people are already recorded as ${roles.join(' / ')} with documented or strong evidence.`};
  return {kind:'available', message:`Proposed relationship: ${proposed} of ${personName(ctx.target)}.`};
}

async function loadContext(id) {
  const { data: change, error } = await supabase.from('tree_change_sets').select('id,target_person_id,change_type,payload,before_snapshot,status').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!change || change.status !== 'pending' || !['edit_person','add_relative'].includes(change.change_type)) return null;
  const [targetRes, peopleRes, relRes, reviewRes] = await Promise.all([
    supabase.from('people').select('*').eq('id', change.target_person_id).maybeSingle(),
    supabase.from('people').select('*').eq('is_active', true).order('surname').order('given_names'),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,source_status,is_active').eq('is_active', true),
    supabase.from('tree_change_ai_reviews').select('id,decision,status,updated_at').eq('change_set_id', id).order('updated_at', {ascending:false}).limit(1).maybeSingle()
  ]);
  if (targetRes.error) throw targetRes.error;
  if (peopleRes.error) throw peopleRes.error;
  if (relRes.error) throw relRes.error;
  if (reviewRes.error) throw reviewRes.error;
  if (!reviewRes.data) return null;
  return {change, target:targetRes.data, people:peopleRes.data || [], relationships:relRes.data || [], review:reviewRes.data};
}

function decisionRow(key, current, proposed, defaultAccept=false) {
  const group = `decision-${Math.random().toString(36).slice(2)}`;
  return `<div class="tree-decision-row" data-field-key="${esc(key)}"><div class="tree-decision-copy"><strong>${esc(LABELS[key] || key)}</strong><small>Current: ${esc(valueText(current))}</small><b>Proposed: ${esc(valueText(proposed))}</b></div><div class="tree-decision-controls"><label><input type="radio" name="${group}" value="accept" ${defaultAccept?'checked':''}> Accept</label><label><input type="radio" name="${group}" value="reject" ${defaultAccept?'':'checked'}> Reject</label></div></div>`;
}

function fieldRows(proposed, current, editMode) {
  return FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(proposed || {}, key)).map((key) => ({key, proposed:proposed[key], current:current?.[key] ?? null, identical:same(proposed[key], current?.[key] ?? null)})).filter((row) => editMode ? !row.identical : row.proposed !== null && row.proposed !== '' && !row.identical);
}

function relationshipRow(state) {
  const group = `relationship-${Math.random().toString(36).slice(2)}`;
  const blocked = state.kind !== 'available';
  return `<div class="tree-decision-row ${esc(state.kind)}" data-relationship-decision><div class="tree-decision-copy"><strong>Relationship</strong><b>${esc(state.message)}</b>${blocked?'<small>This relationship cannot be accepted from this submission.</small>':''}</div><div class="tree-decision-controls"><label><input type="radio" name="${group}" value="accept" ${blocked?'disabled':''}> Accept</label><label><input type="radio" name="${group}" value="reject" checked> Reject</label></div></div>`;
}

function attachPanel(card) {
  card.querySelector('.tree-selective-decisions')?.remove();
  const panel = document.createElement('section');
  panel.className = 'tree-selective-decisions';
  const review = card.querySelector('.tree-ai-review');
  if (review) review.insertAdjacentElement('afterend', panel);
  else {
    const note = card.querySelector('.tree-change-note');
    if (note) note.insertAdjacentElement('beforebegin', panel); else card.appendChild(panel);
  }
  return panel;
}

function bindApply(panel, ctx) {
  panel.querySelector('[data-apply-decisions]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const status = panel.querySelector('.tree-decision-status');
    const selectedFields = [...panel.querySelectorAll('[data-field-key]')].filter((row) => row.querySelector('input[value="accept"]')?.checked).map((row) => row.dataset.fieldKey);
    const relationship = Boolean(panel.querySelector('[data-relationship-decision] input[value="accept"]:checked'));
    const existingId = panel.querySelector('[data-existing-person]')?.value || null;
    if (ctx.change.change_type === 'add_relative' && !existingId) {
      status.textContent = 'Choose the existing person first.'; status.className = 'tree-decision-status error'; return;
    }
    button.disabled = true; button.textContent = 'Applying decisions...';
    try {
      const { data, error } = await supabase.rpc('approve_tree_change_selection', {
        p_change_set_id: ctx.change.id,
        p_selected_fields: selectedFields,
        p_existing_person_id: existingId,
        p_apply_relationship: relationship,
        p_note: panel.querySelector('[data-decision-note]')?.value.trim() || null
      });
      if (error) throw error;
      status.textContent = `Applied ${data?.selected_fields?.length ?? selectedFields.length} accepted field(s). Rejected fields and the rejected relationship were left unchanged.`;
      status.className = 'tree-decision-status success';
      document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
      document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
    } catch (error) {
      status.textContent = error?.message || 'Unable to apply these decisions.';
      status.className = 'tree-decision-status error';
      button.disabled = false; button.textContent = 'Apply accepted / rejected decisions';
    }
  });
}

function renderEdit(card, ctx) {
  const panel = attachPanel(card);
  const proposed = ctx.change.payload?.after || {};
  const rows = fieldRows(proposed, ctx.target || ctx.change.before_snapshot?.person || {}, true);
  panel.innerHTML = `<h4>Accept or reject each proposed change</h4><p>Each field is independent. Accept only what should become canonical; rejected fields remain exactly as they are now.</p><div class="tree-decision-list">${rows.map((r) => decisionRow(r.key,r.current,r.proposed,r.current==null||r.current===''||r.current==='unknown')).join('') || '<p>No changed person fields remain.</p>'}</div><label class="tree-decision-note">Editor note (optional)<textarea rows="2" data-decision-note></textarea></label><button type="button" class="button primary" data-apply-decisions>Apply accepted / rejected decisions</button><p class="tree-decision-status"></p>`;
  bindApply(panel, ctx);
}

function renderRelative(card, ctx) {
  const panel = attachPanel(card);
  const proposed = ctx.change.payload?.relative || {};
  const ranked = ctx.people.filter((p) => p.id !== ctx.target.id).map((p) => ({p,score:score(proposed,p)})).sort((a,b) => b.score-a.score);
  const likely = ranked[0]?.score >= 8 ? ranked[0].p : null;
  const opts = ctx.people.filter((p) => p.id !== ctx.target.id).map((p) => `<option value="${esc(p.id)}"${p.id===likely?.id?' selected':''}>${esc(personName(p))}${p.birth_date?` - ${esc(String(p.birth_date).slice(0,10))}`:''}</option>`).join('');
  panel.innerHTML = `<h4>Accept or reject each proposed change</h4><p>This submission appears to concern an existing person. Choose the existing person, then decide each detail and the relationship separately.</p><label class="tree-decision-existing">Existing person<select data-existing-person><option value="">Choose existing person...</option>${opts}</select></label><div data-relative-decisions></div><label class="tree-decision-note">Editor note (optional)<textarea rows="2" data-decision-note></textarea></label><button type="button" class="button primary" data-apply-decisions>Apply accepted / rejected decisions</button><p class="tree-decision-status"></p>`;
  const select = panel.querySelector('[data-existing-person]');
  const host = panel.querySelector('[data-relative-decisions]');
  const refresh = () => {
    const existing = ctx.people.find((p) => p.id === select.value);
    if (!existing) { host.innerHTML = '<p>Choose the existing person first.</p>'; return; }
    const rows = fieldRows(proposed, existing, false);
    const rel = relationshipState(ctx, existing.id);
    host.innerHTML = `<div class="tree-decision-list">${rows.map((r) => decisionRow(r.key,r.current,r.proposed,r.current==null||r.current===''||r.current==='unknown')).join('') || '<p>No differing person fields remain.</p>'}${relationshipRow(rel)}</div>`;
  };
  select.addEventListener('change', refresh); refresh();
  bindApply(panel, ctx);
}

async function ensureCard(card) {
  const id = card?.dataset?.treeChangeId;
  if (!id || busy.has(id) || card.querySelector('.tree-selective-decisions')) return;
  busy.add(id);
  try {
    const ctx = await loadContext(id);
    if (!ctx) return;
    if (ctx.change.change_type === 'edit_person') renderEdit(card, ctx); else renderRelative(card, ctx);
  } catch (error) {
    console.warn('Explicit selective decision panel failed', error);
  } finally { busy.delete(id); }
}

function scan() {
  document.querySelectorAll('[data-tree-change-id]').forEach((card) => void ensureCard(card));
}
function schedule() {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; scan(); }, 100);
}

installStyles();
scan();
new MutationObserver(schedule).observe(document.body, {childList:true, subtree:true});
document.addEventListener('genealogy:tree-suggestions-updated', schedule);
