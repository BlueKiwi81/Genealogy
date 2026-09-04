import { supabase } from './supabase-client-v1.js';

const PROTECTED = new Set(['documented', 'strong']);
const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
let selectedId = centreSelect?.value || null;
let peopleCache = null;
let relationshipsCache = null;

function normalise(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fullName(person) {
  return [person?.given_names, person?.birth_surname || person?.surname || person?.current_surname].filter(Boolean).join(' ') || 'this person';
}

function sourceLabel(status) {
  return status === 'documented' ? 'documented evidence' : 'strong existing evidence';
}

function actualRole(relationship, targetId, otherId) {
  if (relationship.relationship_type === 'parent') {
    if (relationship.person1_id === otherId && relationship.person2_id === targetId) return 'parent';
    if (relationship.person1_id === targetId && relationship.person2_id === otherId) return 'child';
  }
  if (['spouse', 'partner', 'sibling'].includes(relationship.relationship_type)) return relationship.relationship_type;
  return relationship.relationship_type;
}

async function loadReferenceData(refresh = false) {
  if (!refresh && peopleCache && relationshipsCache) return { people: peopleCache, relationships: relationshipsCache };
  const [peopleRes, relRes] = await Promise.all([
    supabase.from('people').select('id,given_names,preferred_name,surname,birth_surname,current_surname,birth_date,death_date,is_active').eq('is_active', true),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,relationship_status,source_status,notes,is_active').eq('is_active', true),
  ]);
  if (peopleRes.error) throw peopleRes.error;
  if (relRes.error) throw relRes.error;
  peopleCache = peopleRes.data || [];
  relationshipsCache = relRes.data || [];
  return { people: peopleCache, relationships: relationshipsCache };
}

function proposedRelative(form) {
  const data = new FormData(form);
  return {
    given_names: String(data.get('given_names') || '').trim(),
    birth_surname: String(data.get('birth_surname') || '').trim(),
    current_surname: String(data.get('current_surname') || '').trim(),
    birth_date: String(data.get('birth_date') || '').trim(),
    death_date: String(data.get('death_date') || '').trim(),
  };
}

function matchExistingPerson(relative, people, targetId) {
  const given = normalise(relative.given_names);
  const first = given.split(' ')[0] || '';
  const surnames = [relative.birth_surname, relative.current_surname].map(normalise).filter(Boolean);
  return people.map((person) => {
    if (person.id === targetId) return null;
    let score = 0;
    const pgiven = normalise(person.given_names);
    const pfirst = pgiven.split(' ')[0] || '';
    const psurnames = [person.birth_surname, person.surname, person.current_surname].map(normalise).filter(Boolean);
    if (given && pgiven === given) score += 6;
    else if (first && pfirst === first) score += 3;
    if (surnames.some((surname) => psurnames.includes(surname))) score += 4;
    if (relative.birth_date && person.birth_date && String(person.birth_date).slice(0, 10) === relative.birth_date) score += 7;
    if (relative.death_date && person.death_date && String(person.death_date).slice(0, 10) === relative.death_date) score += 3;
    return score >= 8 ? { person, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score)[0]?.person || null;
}

function warningDialog({ title, text, details = [], confirmText = 'Submit for editor review anyway' }) {
  return new Promise((resolve) => {
    document.getElementById('relationshipSafetyDialog')?.remove();
    const host = document.createElement('div');
    host.id = 'relationshipSafetyDialog';
    host.innerHTML = `
      <div class="relationship-safety-backdrop"></div>
      <section class="relationship-safety-dialog" role="dialog" aria-modal="true" aria-labelledby="relationshipSafetyTitle">
        <p class="relationship-safety-kicker">Evidence safeguard</p>
        <h3 id="relationshipSafetyTitle"></h3>
        <p class="relationship-safety-text"></p>
        <ul class="relationship-safety-details"></ul>
        <label class="relationship-safety-check"><input type="checkbox" data-relationship-safety-ack /> I have checked this and understand that it conflicts with existing evidence.</label>
        <div class="relationship-safety-actions"><button type="button" class="button ghost" data-relationship-safety-cancel>Go back and check</button><button type="button" class="button danger" data-relationship-safety-confirm disabled></button></div>
      </section>`;
    host.querySelector('#relationshipSafetyTitle').textContent = title;
    host.querySelector('.relationship-safety-text').textContent = text;
    host.querySelector('.relationship-safety-details').innerHTML = details.map((item) => `<li>${String(item).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</li>`).join('');
    host.querySelector('[data-relationship-safety-confirm]').textContent = confirmText;
    const ack = host.querySelector('[data-relationship-safety-ack]');
    const confirm = host.querySelector('[data-relationship-safety-confirm]');
    ack.addEventListener('change', () => { confirm.disabled = !ack.checked; });
    const finish = (value) => { host.remove(); resolve(value); };
    host.querySelector('[data-relationship-safety-cancel]').addEventListener('click', () => finish(false));
    host.querySelector('.relationship-safety-backdrop').addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    document.body.appendChild(host);
  });
}

function installStyles() {
  if (document.getElementById('relationshipSafetyStyles')) return;
  const style = document.createElement('style');
  style.id = 'relationshipSafetyStyles';
  style.textContent = `
    #relationshipSafetyDialog{position:fixed;inset:0;z-index:100000}.relationship-safety-backdrop{position:absolute;inset:0;background:rgba(34,27,22,.52)}
    .relationship-safety-dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));box-sizing:border-box;padding:20px;border-radius:16px;background:#fffaf2;box-shadow:0 24px 70px rgba(30,22,16,.32);border:2px solid #b46852;color:#3d3229}
    .relationship-safety-kicker{margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:.09em;font-weight:800;color:#9a453e}.relationship-safety-dialog h3{margin:0 0 8px;font-size:18px}.relationship-safety-text{font-size:13px;line-height:1.5;margin:0 0 10px}.relationship-safety-details{font-size:12px;line-height:1.45;margin:0 0 12px;padding-left:20px}.relationship-safety-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:flex-start;gap:8px!important;padding:10px;border-radius:10px;background:#fff2ed;font-size:11px!important;line-height:1.4}.relationship-safety-check input{width:auto!important;margin-top:2px}.relationship-safety-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}.relationship-safety-actions button:disabled{opacity:.45;cursor:not-allowed}
  `;
  document.head.appendChild(style);
}

async function addRelativeWarning(form) {
  const targetId = selectedId || centreSelect?.value || null;
  if (!targetId) return null;
  const proposedRole = String(new FormData(form).get('role') || '');
  const relative = proposedRelative(form);
  const { people, relationships } = await loadReferenceData(true);
  const existing = matchExistingPerson(relative, people, targetId);
  if (!existing) return null;
  const pairRelationships = relationships.filter((rel) => PROTECTED.has(rel.source_status) && ((rel.person1_id === targetId && rel.person2_id === existing.id) || (rel.person1_id === existing.id && rel.person2_id === targetId)));
  if (!pairRelationships.length) return null;
  const roles = [...new Set(pairRelationships.map((rel) => actualRole(rel, targetId, existing.id)))];
  const strongest = pairRelationships.some((rel) => rel.source_status === 'documented') ? 'documented' : 'strong';
  if (roles.includes(proposedRole)) {
    return {
      title: 'This person and relationship are already recorded',
      text: `${fullName(existing)} already appears in the family tree in this relationship, supported by ${sourceLabel(strongest)}. Adding a new relative could create a duplicate person.`,
      details: [`Existing relationship: ${roles.join(', ')}`, `Proposed relationship: ${proposedRole}`, 'Consider cancelling and using Edit details on the existing person instead.'],
    };
  }
  return {
    title: 'This proposed relationship conflicts with documented evidence',
    text: `${fullName(existing)} is already linked to this person as ${roles.join(' / ')}, supported by ${sourceLabel(strongest)}. You are proposing ${proposedRole}.`,
    details: [`Existing relationship: ${roles.join(', ')}`, `Proposed relationship: ${proposedRole}`, 'The existing relationship will not be changed merely because this submission is sent. An editor will have to review the conflict.'],
  };
}

async function removalWarning(form) {
  const id = String(new FormData(form).get('relationship_id') || '');
  if (!id) return null;
  const { relationships, people } = await loadReferenceData(true);
  const rel = relationships.find((item) => item.id === id);
  if (!rel || !PROTECTED.has(rel.source_status)) return null;
  const p1 = people.find((person) => person.id === rel.person1_id);
  const p2 = people.find((person) => person.id === rel.person2_id);
  return {
    title: 'This relationship is supported by existing evidence',
    text: `You are proposing to remove a relationship supported by ${sourceLabel(rel.source_status)}.`,
    details: [`${fullName(p1)} - ${rel.relationship_type} - ${fullName(p2)}`, rel.notes ? `Evidence note: ${rel.notes}` : 'The relationship is marked as protected evidence in the family tree.', 'The proposal can still be sent, but it should only replace the existing relationship if stronger evidence justifies the correction.'],
  };
}

async function personRemovalWarning(button) {
  const targetId = selectedId || centreSelect?.value || null;
  if (!targetId) return null;
  const { relationships, people } = await loadReferenceData(true);
  const protectedLinks = relationships.filter((rel) => PROTECTED.has(rel.source_status) && (rel.person1_id === targetId || rel.person2_id === targetId));
  if (!protectedLinks.length) return null;
  const person = people.find((p) => p.id === targetId);
  return {
    title: 'This person has documented family links',
    text: `${fullName(person)} is connected by ${protectedLinks.length} relationship${protectedLinks.length === 1 ? '' : 's'} supported by documented or strong evidence. Removing the person would also hide those links.`,
    details: protectedLinks.slice(0, 5).map((rel) => {
      const otherId = rel.person1_id === targetId ? rel.person2_id : rel.person1_id;
      const other = people.find((p) => p.id === otherId);
      return `${rel.relationship_type}: ${fullName(other)} (${rel.source_status})`;
    }),
    confirmText: 'Continue to removal review',
  };
}

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!['addRelativeSuggestionForm', 'removeRelationshipSuggestionForm'].includes(form.id)) return;
  if (form.dataset.relationshipSafetyAcknowledged === '1') {
    delete form.dataset.relationshipSafetyAcknowledged;
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    const warning = form.id === 'addRelativeSuggestionForm' ? await addRelativeWarning(form) : await removalWarning(form);
    if (!warning) {
      form.dataset.relationshipSafetyAcknowledged = '1';
      form.requestSubmit();
      return;
    }
    const proceed = await warningDialog(warning);
    if (proceed) {
      form.dataset.relationshipSafetyAcknowledged = '1';
      form.requestSubmit();
    }
  } catch (error) {
    const node = document.getElementById('treeSuggestionMessage');
    if (node) { node.textContent = error?.message || 'Unable to check the existing family evidence.'; node.className = 'tree-suggestion-message error'; }
  }
}, true);

document.addEventListener('click', async (event) => {
  const button = event.target.closest?.('[data-tree-remove-person]');
  if (!button) return;
  if (button.dataset.relationshipSafetyAcknowledged === '1') {
    delete button.dataset.relationshipSafetyAcknowledged;
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    const warning = await personRemovalWarning(button);
    if (!warning) {
      button.dataset.relationshipSafetyAcknowledged = '1';
      button.click();
      return;
    }
    const proceed = await warningDialog(warning);
    if (proceed) {
      button.dataset.relationshipSafetyAcknowledged = '1';
      button.click();
    }
  } catch (error) {
    const node = document.getElementById('treeSuggestionMessage');
    if (node) { node.textContent = error?.message || 'Unable to check the existing family evidence.'; node.className = 'tree-suggestion-message error'; }
  }
}, true);

treeCanvas?.addEventListener('click', (event) => {
  const target = event.target.closest?.('[data-person-id]');
  if (target?.dataset?.personId) selectedId = target.dataset.personId;
}, true);
centreSelect?.addEventListener('change', () => { selectedId = centreSelect.value || null; });
document.addEventListener('genealogy:tree-suggestions-updated', () => { peopleCache = null; relationshipsCache = null; });

installStyles();
