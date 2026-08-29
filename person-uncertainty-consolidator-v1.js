import { supabase } from './supabase-client-v1.js';
import './uncertainty-resolution-v1.js';

const canvas = document.getElementById('treeCanvas');
const UNCERTAIN = new Set(['hypothesis','probable','unresolved']);
const state = { people:new Map(), relationships:[], candidates:[], loaded:false };
let timer = null;

function af() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}
function t(en, afr) { return af() ? afr : en; }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function nameOf(person) {
  return [person?.given_names?.trim(),person?.surname?.trim()].filter(Boolean).join(' ') || t('Unknown','Onbekend');
}
function human(value) {
  const status = String(value || 'unresolved');
  if (!af()) return status.replaceAll('_',' ');
  return ({hypothesis:'hipotese',probable:'waarskynlik',unresolved:'onopgelos',strong:'sterk',documented:'gedokumenteer',family_supplied:'deur familie verskaf'})[status] || status.replaceAll('_',' ');
}
function active(row) { return row?.is_active !== false; }
function uncertain(row) { return UNCERTAIN.has(row?.source_status || 'unresolved'); }
function roleFor(person) {
  if (person?.gender === 'male') return 'father';
  if (person?.gender === 'female') return 'mother';
  return 'parent';
}
function roleLabel(role) {
  if (role === 'father') return t('father','vader');
  if (role === 'mother') return t('mother','moeder');
  return t('parent','ouer');
}
function childLinks(personId) {
  return state.relationships.filter((r) => active(r)
    && r.relationship_type === 'parent'
    && r.person1_id === personId
    && uncertain(r));
}
function frontierFor(person, childId) {
  const slot = roleFor(person);
  return state.candidates.filter((candidate) => candidate.is_active !== false
    && candidate.anchor_person_id === childId
    && (slot === 'parent' || candidate.parent_slot === slot));
}

function closeDialog() {
  document.getElementById('personUncertaintyBackdrop')?.remove();
}

function resolutionDetail(person, child, relationship, candidate = null) {
  return {
    personId: person.id,
    personName: nameOf(person),
    childId: child.id,
    childName: nameOf(child),
    relationshipId: relationship.id,
    role: roleFor(person),
    candidate: candidate ? {
      id:candidate.id,
      label:candidate.label,
      year_text:candidate.year_text,
      detail:candidate.detail,
      evidence_note:candidate.evidence_note,
    } : null,
  };
}

function showDialog(personId) {
  const person = state.people.get(personId);
  const links = childLinks(personId);
  if (!person || !links.length) return;
  closeDialog();

  const cards = links.map((relationship, linkIndex) => {
    const child = state.people.get(relationship.person2_id);
    const alternatives = frontierFor(person, relationship.person2_id);
    const role = roleFor(person);
    return `<section class="person-uncertainty-card" data-link-index="${linkIndex}">
      <h4>${esc(nameOf(person))} → ${esc(nameOf(child))}</h4>
      <div class="person-uncertainty-row"><strong>${t('Working link','Werkende skakel')}</strong><span>${t('Possible','Moontlike')} ${esc(roleLabel(role))} ${t('of','van')} ${esc(nameOf(child))}</span></div>
      <div class="person-uncertainty-row"><strong>${t('Status','Status')}</strong><span>${esc(human(relationship.source_status))}</span></div>
      ${relationship.notes ? `<div class="person-uncertainty-row"><strong>${t('Evidence boundary','Bewysgrens')}</strong><span>${esc(relationship.notes)}</span></div>` : ''}
      ${person.narrative_summary ? `<div class="person-uncertainty-row"><strong>${t('Current person note','Huidige persoonsnota')}</strong><span>${esc(person.narrative_summary)}</span></div>` : ''}
      ${alternatives.length ? `<div class="person-uncertainty-alternatives"><strong>${t('Other research leads for this same parent slot','Ander navorsingsleidrade vir dieselfde ouerposisie')}</strong>${alternatives.map((candidate, candidateIndex) => `<article data-candidate-index="${candidateIndex}"><b>${esc(candidate.label || t('Research lead','Navorsingsleidraad'))}</b>${candidate.year_text ? `<span>${esc(candidate.year_text)}</span>` : ''}${candidate.detail ? `<p>${esc(candidate.detail)}</p>` : ''}${candidate.evidence_note ? `<small>${esc(candidate.evidence_note)}</small>` : ''}<button class="button ghost person-uncertainty-add-candidate" type="button" data-link-index="${linkIndex}" data-candidate-index="${candidateIndex}">${t('Add information or material for this lead','Voeg inligting of materiaal vir hierdie leidraad by')}</button></article>`).join('')}</div>` : ''}
      <div class="person-uncertainty-row"><strong>${t('What would settle it?','Wat sou dit beslis?')}</strong><span>${t('An original parent-naming record, such as a birth or baptism entry, estate/death notice, or another comparably direct record that confirms or excludes the relationship. Supporting archive, locality or wartime material can also help strengthen or rule out a lead.','’n Oorspronklike rekord wat die ouer noem, soos ’n geboorte- of doopinskrywing, boedel-/sterfkennisgewing, of ’n vergelykbaar direkte rekord wat die verwantskap bevestig of uitsluit. Ondersteunende argief-, plek- of oorlogsmateriaal kan ook help om ’n leidraad te versterk of uit te sluit.')}</span></div>
      <div class="person-uncertainty-actions"><button class="button primary person-uncertainty-add" type="button" data-link-index="${linkIndex}">${t('Add information or evidence to resolve this','Voeg inligting of bewysmateriaal by om dit op te los')}</button></div>
    </section>`;
  }).join('');

  const backdrop = document.createElement('div');
  backdrop.id = 'personUncertaintyBackdrop';
  backdrop.className = 'person-uncertainty-backdrop';
  backdrop.innerHTML = `<section class="person-uncertainty-dialog" role="dialog" aria-modal="true" aria-labelledby="personUncertaintyTitle">
    <header><div><p class="eyebrow">${t('Evidence boundary','Bewysgrens')}</p><h3 id="personUncertaintyTitle">${t('Why is there a question mark here?','Waarom is hier ’n vraagteken?')}</h3></div><button type="button" aria-label="${t('Close','Sluit')}">×</button></header>
    <div class="person-uncertainty-body"><p class="person-uncertainty-intro">${t('There is one question mark for this person, even when several research notes sit behind it. The marker means the family link is still provisional; the details below combine the current working hypothesis and any competing research-frontier leads.','Daar is een vraagteken vir hierdie persoon, selfs wanneer verskeie navorsingsnotas daaragter lê. Die merker beteken dat die familieskakel nog voorlopig is; die besonderhede hieronder kombineer die huidige werkende hipotese en enige mededingende navorsingsfront-leidrade.')}</p>${cards}</div>
  </section>`;
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeDialog(); });
  backdrop.querySelector('header button')?.addEventListener('click', closeDialog);
  backdrop.querySelectorAll('.person-uncertainty-add').forEach((button) => {
    button.addEventListener('click', () => {
      const linkIndex = Number(button.dataset.linkIndex || 0);
      const relationship = links[linkIndex];
      const child = relationship ? state.people.get(relationship.person2_id) : null;
      if (!relationship || !child) return;
      const detail = resolutionDetail(person, child, relationship);
      closeDialog();
      document.dispatchEvent(new CustomEvent('genealogy:resolve-uncertainty', { detail }));
    });
  });
  backdrop.querySelectorAll('.person-uncertainty-add-candidate').forEach((button) => {
    button.addEventListener('click', () => {
      const linkIndex = Number(button.dataset.linkIndex || 0);
      const candidateIndex = Number(button.dataset.candidateIndex || 0);
      const relationship = links[linkIndex];
      const child = relationship ? state.people.get(relationship.person2_id) : null;
      const candidate = relationship ? frontierFor(person, relationship.person2_id)[candidateIndex] : null;
      if (!relationship || !child || !candidate) return;
      const detail = resolutionDetail(person, child, relationship, candidate);
      closeDialog();
      document.dispatchEvent(new CustomEvent('genealogy:resolve-uncertainty', { detail }));
    });
  });
  document.body.appendChild(backdrop);
  backdrop.querySelector('header button')?.focus();
}

function makeMarker(node, personId) {
  let marker = node.querySelector(':scope .person-unified-uncertainty-marker');
  if (marker) return marker;
  const ns = 'http://www.w3.org/2000/svg';
  marker = document.createElementNS(ns,'g');
  marker.classList.add('person-unified-uncertainty-marker');
  marker.setAttribute('tabindex','0');
  marker.setAttribute('role','button');
  marker.setAttribute('aria-label',`${t('Explain uncertain family link for','Verduidelik onseker familieskakel vir')} ${nameOf(state.people.get(personId))}`);
  const circle = document.createElementNS(ns,'circle');
  circle.setAttribute('cx','0'); circle.setAttribute('cy','18'); circle.setAttribute('r','8');
  const text = document.createElementNS(ns,'text');
  text.setAttribute('x','0'); text.setAttribute('y','21'); text.setAttribute('text-anchor','middle'); text.setAttribute('pointer-events','none'); text.textContent='?';
  marker.append(circle,text);
  const activate = (event) => { event?.preventDefault?.(); event?.stopPropagation?.(); showDialog(personId); };
  marker.addEventListener('click',activate);
  marker.addEventListener('keydown',(event) => { if (event.key === 'Enter' || event.key === ' ') activate(event); });
  (node.querySelector('.fan-marker-host') || node).appendChild(marker);
  return marker;
}

function decorate() {
  timer = null;
  if (!state.loaded || !canvas) return;
  canvas.querySelectorAll('.person-node[data-person-id]').forEach((node) => {
    const personId = node.dataset.personId;
    const links = childLinks(personId);
    if (!links.length) {
      node.classList.remove('person-uncertainty-consolidated');
      node.querySelectorAll('.person-unified-uncertainty-marker').forEach((marker) => marker.remove());
      return;
    }
    node.classList.add('person-uncertainty-consolidated');
    makeMarker(node,personId);
  });
}
function schedule(delay=20) { window.clearTimeout(timer); timer=window.setTimeout(decorate,delay); }

function installStyles() {
  if (document.getElementById('personUncertaintyConsolidatorStyles')) return;
  const style=document.createElement('style');
  style.id='personUncertaintyConsolidatorStyles';
  style.textContent=`
    .person-node.person-uncertainty-consolidated .relationship-uncertainty-marker,
    .person-node.person-uncertainty-consolidated .frontier-alternate-marker{display:none!important}
    .person-unified-uncertainty-marker{cursor:pointer;outline:none}.person-unified-uncertainty-marker circle{fill:#7f735f;stroke:#554b3d;stroke-width:1.2;stroke-dasharray:3 2}.person-unified-uncertainty-marker text{fill:#fff;font:800 10px Arial,sans-serif}.person-unified-uncertainty-marker:hover circle,.person-unified-uncertainty-marker:focus circle{stroke:#2f2922;stroke-width:2;filter:drop-shadow(0 1px 2px rgba(0,0,0,.2))}
    .person-uncertainty-backdrop{position:fixed;inset:0;z-index:10035;display:grid;place-items:center;padding:20px;background:rgba(44,36,30,.38);backdrop-filter:blur(2px)}.person-uncertainty-dialog{width:min(700px,calc(100vw - 32px));max-height:min(84vh,820px);overflow:auto;border:1px solid #d6c8ba;border-radius:18px;background:#fffdf9;box-shadow:0 22px 60px rgba(43,31,23,.24);color:#3f342b}.person-uncertainty-dialog header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:18px 20px 12px;border-bottom:1px solid #eadfd4}.person-uncertainty-dialog header h3{margin:0}.person-uncertainty-dialog header button{border:0;background:#f0e6da;color:#5f5146;border-radius:999px;width:32px;height:32px;font:800 15px/1 Arial,sans-serif;cursor:pointer}.person-uncertainty-body{display:grid;gap:12px;padding:16px 20px 20px}.person-uncertainty-intro{margin:0;padding:11px 12px;border-radius:12px;background:#f3eee8;color:#665a50;font-size:13px;line-height:1.45}.person-uncertainty-card{padding:13px 14px;border:1px solid #e4d9cd;border-radius:13px;background:#fffaf3}.person-uncertainty-card h4{margin:0 0 8px;font-size:15px}.person-uncertainty-row{display:grid;grid-template-columns:135px 1fr;gap:10px;padding:5px 0;font-size:12px;line-height:1.45}.person-uncertainty-row strong{color:#75675b}.person-uncertainty-alternatives{display:grid;gap:7px;margin:10px 0;padding-top:9px;border-top:1px solid #e8ddd1}.person-uncertainty-alternatives>strong{font-size:12px;color:#67594d}.person-uncertainty-alternatives article{display:grid;gap:5px;padding:9px 10px;border-radius:9px;background:#f3eee8}.person-uncertainty-alternatives article b{font-size:12px}.person-uncertainty-alternatives article span,.person-uncertainty-alternatives article small{font-size:10.5px;color:#75695f}.person-uncertainty-alternatives article p{margin:2px 0;font-size:11.5px;line-height:1.42}.person-uncertainty-add-candidate{justify-self:start;margin-top:3px;font-size:11px}.person-uncertainty-actions{display:flex;justify-content:flex-end;margin-top:10px;padding-top:10px;border-top:1px solid #e8ddd1}
    @media(max-width:560px){.person-uncertainty-row{grid-template-columns:1fr;gap:2px}.person-uncertainty-actions .button{width:100%}}
  `;
  document.head.appendChild(style);
}

async function load() {
  const [peopleResult, relationshipResult, candidateResult] = await Promise.all([
    supabase.from('people').select('id,given_names,surname,gender,source_status,narrative_summary,is_active'),
    supabase.from('relationships').select('id,person1_id,person2_id,relationship_type,relationship_status,source_status,notes,is_active'),
    supabase.from('research_frontier_candidates').select('id,anchor_person_id,parent_slot,label,year_text,detail,evidence_note,priority,is_active').eq('is_active',true).order('priority'),
  ]);
  if (peopleResult.error || relationshipResult.error) return;
  state.people=new Map((peopleResult.data||[]).filter((p)=>p.is_active!==false).map((p)=>[p.id,p]));
  state.relationships=(relationshipResult.data||[]).filter(active);
  state.candidates=candidateResult.error?[]:(candidateResult.data||[]);
  state.loaded=true;
  installStyles();
  schedule(0);
}

if (canvas) new MutationObserver(()=>schedule(15)).observe(canvas,{childList:true,subtree:true});
document.addEventListener('genealogy:archive-ready',()=>void load());
document.addEventListener('genealogy:research-frontier-changed',()=>void load());
document.addEventListener('genealogy:known-as-updated',()=>schedule(20));
document.addEventListener('genealogy:language-changed',()=>{ closeDialog(); schedule(20); });
document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeDialog();});
supabase.auth.onAuthStateChange((_event,session)=>{if(session)void load();});
const {data:{session}}=await supabase.auth.getSession();
if(session)await load();
