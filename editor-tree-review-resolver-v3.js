import { supabase } from './supabase-client-v1.js';

const PROTECTED = new Set(['documented', 'strong']);
const FIELDS = ['given_names','surname','birth_surname','current_surname','preferred_name','gender','birth_date','death_date','life_status','birth_place','death_place','residence_summary','final_rest_type','final_rest_place','occupation_summary','military_service_summary','historical_context','narrative_summary'];
const LABELS = {
  given_names:'Given name(s)', surname:'Display surname', birth_surname:'Birth / maiden surname', current_surname:'Married / current surname', preferred_name:'Known as', gender:'Gender', birth_date:'Birth date', death_date:'Death date', life_status:'Life status', birth_place:'Birth place', death_place:'Death place', residence_summary:'Where they lived', final_rest_type:'Final rest type', final_rest_place:'Final resting place', occupation_summary:'Occupation', military_service_summary:'Military service', historical_context:'Historical context', narrative_summary:'Family note'
};
const busy = new Set();
let timer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const valueText = (value) => value == null || value === '' ? 'Not recorded' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const personName = (person) => [person?.given_names, person?.birth_surname || person?.surname || person?.current_surname].filter(Boolean).join(' ') || 'Unnamed person';

function installStyles() {
  if (document.getElementById('treeReviewResolverV3Styles')) return;
  const style = document.createElement('style');
  style.id = 'treeReviewResolverV3Styles';
  style.textContent = `
    .tree-review-v3{margin:12px 0;padding:12px;border:2px solid rgba(91,72,55,.22);border-radius:12px;background:#fffdf8}
    .tree-review-v3 h4{margin:0 0 4px;font-size:13px;color:#3f3329}.tree-review-v3>p{margin:4px 0 10px;font-size:10px;line-height:1.45;color:#5e5146}
    .tree-review-v3-badge{display:inline-flex;padding:4px 8px;border-radius:999px;background:#f7e4bd;color:#76531e;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px}
    .tree-review-v3-ai{padding:9px 10px;border-radius:9px;background:#fff8ea;border:1px solid rgba(164,105,44,.28);margin-bottom:10px}.tree-review-v3-ai strong{display:block;font-size:10px;color:#5d4728;margin-bottom:3px}.tree-review-v3-ai p{margin:3px 0;font-size:9.5px;line-height:1.45;color:#65533c}.tree-review-v3-ai ul{margin:5px 0 0;padding-left:18px;font-size:9px;color:#76531e}
    .tree-review-v3-list{display:grid;gap:8px}.tree-review-v3-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:9px;border:1px solid rgba(91,72,55,.16);border-radius:9px;background:#fff}.tree-review-v3-row.blocked{background:#fff3f0;border-color:rgba(140,65,65,.34)}.tree-review-v3-copy{display:grid;gap:2px;min-width:0}.tree-review-v3-copy strong{font-size:9px;text-transform:uppercase;color:#645548}.tree-review-v3-copy small{font-size:9px;color:#75685d;white-space:pre-wrap}.tree-review-v3-copy b{font-size:9.8px;color:#44392f;white-space:pre-wrap}.tree-review-v3-controls{display:flex;gap:5px;align-items:center}.tree-review-v3-controls label{display:inline-flex!important;gap:4px!important;align-items:center!important;padding:5px 7px;border:1px solid rgba(91,72,55,.2);border-radius:999px;background:#faf7f2;font-size:9px!important;font-weight:700!important;cursor:pointer}.tree-review-v3-controls input{width:auto!important;margin:0!important}
    .tree-review-v3-existing,.tree-review-v3-note{display:grid!important;gap:4px!important;margin:8px 0;font-size:9.5px!important;font-weight:700}.tree-review-v3-existing select,.tree-review-v3-note textarea{width:100%;box-sizing:border-box;border:1px solid rgba(91,72,55,.2);border-radius:8px;padding:7px;background:#fff}.tree-review-v3-status{font-size:9px!important;margin:7px 0 0!important}.tree-review-v3-status.error{color:#8a3e36}.tree-review-v3-status.success{color:#466648}.tree-review-v3-error{margin:10px 0;padding:10px;border:2px solid rgba(140,65,65,.34);border-radius:10px;background:#fff3f0;color:#7b413d;font-size:10px;line-height:1.4}
  `;
  document.head.appendChild(style);
}

function insertBeforeNote(card, node) {
  const note = card.querySelector('.tree-change-note');
  if (note) note.insertAdjacentElement('beforebegin', node); else card.appendChild(node);
}

function showError(card, message) {
  let box = card.querySelector('.tree-review-v3-error');
  if (!box) {
    box = document.createElement('div');
    box.className = 'tree-review-v3-error';
    insertBeforeNote(card, box);
  }
  box.textContent = `Field-by-field review could not load: ${message || 'Unknown error'}`;
}

function clearError(card) { card.querySelector('.tree-review-v3-error')?.remove(); }

function reviewSummary(review) {
  const warnings = Array.isArray(review?.warnings) ? review.warnings.filter(Boolean) : [];
  return `<div class="tree-review-v3-ai"><strong>Saved Intelligent Review — ${esc(String(review?.decision || 'manual_review').replaceAll('_',' '))}${Number.isFinite(Number(review?.confidence)) ? ` (${Math.round(Number(review.confidence)*100)}% confidence)` : ''}</strong>${review?.summary ? `<p>${esc(review.summary)}</p>` : ''}${review?.rationale ? `<p>${esc(review.rationale)}</p>` : ''}${warnings.length ? `<ul>${warnings.map((w)=>`<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>`;
}

function score(relative, person) {
  let points = 0;
  const rg = norm(relative?.given_names), pg = norm(person?.given_names);
  if (rg && rg === pg) points += 6; else if (rg.split(' ')[0] && rg.split(' ')[0] === pg.split(' ')[0]) points += 3;
  const rs = [relative?.birth_surname,relative?.surname,relative?.current_surname].map(norm).filter(Boolean);
  const ps = [person?.birth_surname,person?.surname,person?.current_surname].map(norm).filter(Boolean);
  if (rs.some((s)=>ps.includes(s))) points += 4;
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
  const { data: change, error: changeError } = await supabase.from('tree_change_sets').select('id,target_person_id,change_type,payload,before_snapshot,status').eq('id', id).maybeSingle();
  if (changeError) throw changeError;
  if (!change || change.status !== 'pending' || !['edit_person','add_relative'].includes(change.change_type)) return null;

  const { data: reviewRows, error: reviewError } = await supabase.from('tree_change_ai_reviews').select('*').eq('change_set_id', id).order('updated_at', {ascending:false}).limit(1);
  if (reviewError) throw reviewError;
  const review = reviewRows?.[0] || null;
  if (!review) return { change, review:null };

  const [targetRes, peopleRes, relRes] = await Promise.all([
    supabase.from('people').select('*').eq('id', change.target_person_id).maybeSingle(),
    supabase.from('people').select('*').eq('is_active', true),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,source_status,is_active').eq('is_active', true)
  ]);
  if (targetRes.error) throw targetRes.error;
  if (peopleRes.error) throw peopleRes.error;
  if (relRes.error) throw relRes.error;
  return {change, review, target:targetRes.data, people:peopleRes.data || [], relationships:relRes.data || []};
}

function radioRow(key, current, proposed, defaultAccept=false) {
  const group = `v3-${key}-${Math.random().toString(36).slice(2)}`;
  return `<div class="tree-review-v3-row" data-v3-field="${esc(key)}"><div class="tree-review-v3-copy"><strong>${esc(LABELS[key] || key)}</strong><small>Current: ${esc(valueText(current))}</small><b>Proposed: ${esc(valueText(proposed))}</b></div><div class="tree-review-v3-controls"><label><input type="radio" name="${group}" value="accept" ${defaultAccept?'checked':''}> Accept</label><label><input type="radio" name="${group}" value="reject" ${defaultAccept?'':'checked'}> Reject</label></div></div>`;
}

function differingRows(proposed, current, editMode) {
  return FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(proposed || {}, key)).map((key) => ({key, proposed:proposed[key], current:current?.[key] ?? null, identical:same(proposed[key], current?.[key] ?? null)})).filter((row) => editMode ? !row.identical : row.proposed !== null && row.proposed !== '' && !row.identical);
}

function relationshipRow(state) {
  const group = `v3-rel-${Math.random().toString(36).slice(2)}`;
  const blocked = state.kind !== 'available';
  return `<div class="tree-review-v3-row ${blocked?'blocked':''}" data-v3-relationship><div class="tree-review-v3-copy"><strong>Relationship</strong><b>${esc(state.message)}</b>${blocked?'<small>This relationship cannot be accepted from this submission.</small>':''}</div><div class="tree-review-v3-controls"><label><input type="radio" name="${group}" value="accept" ${blocked?'disabled':''}> Accept</label><label><input type="radio" name="${group}" value="reject" checked> Reject</label></div></div>`;
}

function disableWholeApprove(card) {
  const approve = card.querySelector('[data-approve-tree-change]');
  if (!approve) return;
  approve.disabled = true;
  approve.dataset.v3Disabled = '1';
  approve.textContent = 'Use field decisions below';
}

function panelFor(card, ctx) {
  card.querySelector('.tree-review-v3')?.remove();
  const panel = document.createElement('section');
  panel.className = 'tree-review-v3';
  insertBeforeNote(card, panel);
  panel.innerHTML = `<span class="tree-review-v3-badge">Field-by-field review ready</span>${reviewSummary(ctx.review)}<h4>Accept or reject each proposed change</h4><p>Each field is independent. Accept only what should become canonical. Rejected fields remain unchanged.</p><div data-v3-body></div><label class="tree-review-v3-note">Editor note (optional)<textarea rows="2" data-v3-note></textarea></label><button type="button" class="button primary" data-v3-apply>Apply accepted / rejected decisions</button><p class="tree-review-v3-status"></p>`;
  disableWholeApprove(card);
  return panel;
}

function renderEdit(card, ctx) {
  const panel = panelFor(card, ctx);
  const body = panel.querySelector('[data-v3-body]');
  const proposed = ctx.change.payload?.after || {};
  const rows = differingRows(proposed, ctx.target || ctx.change.before_snapshot?.person || {}, true);
  body.innerHTML = `<div class="tree-review-v3-list">${rows.map((r)=>radioRow(r.key,r.current,r.proposed,r.current==null||r.current===''||r.current==='unknown')).join('') || '<p>No differing person fields remain.</p>'}</div>`;
  bindApply(panel, ctx);
}

function renderRelative(card, ctx) {
  const panel = panelFor(card, ctx);
  const body = panel.querySelector('[data-v3-body]');
  const proposed = ctx.change.payload?.relative || {};
  const ranked = ctx.people.filter((p)=>p.id !== ctx.target.id).map((p)=>({p,score:score(proposed,p)})).sort((a,b)=>b.score-a.score);
  const likely = ranked[0]?.score >= 8 ? ranked[0].p : null;
  const options = ctx.people.filter((p)=>p.id !== ctx.target.id).map((p)=>`<option value="${esc(p.id)}"${p.id===likely?.id?' selected':''}>${esc(personName(p))}${p.birth_date?` — ${esc(String(p.birth_date).slice(0,10))}`:''}</option>`).join('');
  body.innerHTML = `<label class="tree-review-v3-existing">Existing person<select data-v3-existing><option value="">Choose existing person...</option>${options}</select></label><div data-v3-relative-rows></div>`;
  const select = body.querySelector('[data-v3-existing]');
  const rowsHost = body.querySelector('[data-v3-relative-rows]');
  const refresh = () => {
    const existing = ctx.people.find((p)=>p.id===select.value);
    if (!existing) { rowsHost.innerHTML = '<p>Choose the existing person first.</p>'; return; }
    const rows = differingRows(proposed, existing, false);
    const rel = relationshipState(ctx, existing.id);
    rowsHost.innerHTML = `<div class="tree-review-v3-list">${rows.map((r)=>radioRow(r.key,r.current,r.proposed,r.current==null||r.current===''||r.current==='unknown')).join('') || '<p>No differing person fields remain.</p>'}${relationshipRow(rel)}</div>`;
  };
  select.addEventListener('change', refresh);
  refresh();
  bindApply(panel, ctx);
}

function bindApply(panel, ctx) {
  panel.querySelector('[data-v3-apply]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const status = panel.querySelector('.tree-review-v3-status');
    const selectedFields = [...panel.querySelectorAll('[data-v3-field]')].filter((row)=>row.querySelector('input[value="accept"]')?.checked).map((row)=>row.dataset.v3Field);
    const relationship = Boolean(panel.querySelector('[data-v3-relationship] input[value="accept"]:checked'));
    const existingId = panel.querySelector('[data-v3-existing]')?.value || null;
    if (ctx.change.change_type === 'add_relative' && !existingId) {
      status.textContent = 'Choose the existing person first.'; status.className = 'tree-review-v3-status error'; return;
    }
    if (!selectedFields.length && !relationship) {
      status.textContent = 'Nothing is marked Accept. Use “Reject and restore” if you want to reject the whole proposal.'; status.className = 'tree-review-v3-status error'; return;
    }
    button.disabled = true; button.textContent = 'Applying decisions...';
    try {
      const { data, error } = await supabase.rpc('approve_tree_change_selection', {
        p_change_set_id: ctx.change.id,
        p_selected_fields: selectedFields,
        p_existing_person_id: existingId,
        p_apply_relationship: relationship,
        p_note: panel.querySelector('[data-v3-note]')?.value.trim() || null
      });
      if (error) throw error;
      status.textContent = `Applied ${data?.selected_fields?.length ?? selectedFields.length} accepted field(s). Rejected fields and rejected relationship were left unchanged.`;
      status.className = 'tree-review-v3-status success';
      document.dispatchEvent(new CustomEvent('genealogy:tree-suggestions-updated'));
      document.dispatchEvent(new CustomEvent('genealogy:known-as-updated'));
    } catch (error) {
      status.textContent = error?.message || 'Unable to apply these decisions.'; status.className = 'tree-review-v3-status error';
      button.disabled = false; button.textContent = 'Apply accepted / rejected decisions';
    }
  });
}

async function ensureCard(card) {
  const id = card?.dataset?.treeChangeId;
  if (!id || busy.has(id) || card.querySelector('.tree-review-v3')) return;
  busy.add(id);
  try {
    const ctx = await loadContext(id);
    if (!ctx) return;
    if (!ctx.review) {
      clearError(card);
      return;
    }
    clearError(card);
    if (ctx.change.change_type === 'edit_person') renderEdit(card, ctx); else renderRelative(card, ctx);
  } catch (error) {
    showError(card, error?.message || String(error));
  } finally {
    busy.delete(id);
  }
}

function scan() { document.querySelectorAll('[data-tree-change-id]').forEach((card)=>void ensureCard(card)); }
function schedule() { if (timer !== null) clearTimeout(timer); timer = setTimeout(()=>{timer=null;scan();},120); }

installStyles();
scan();
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
document.addEventListener('genealogy:tree-suggestions-updated', schedule);
