import { supabase } from './supabase-client-v1.js';

const personDetails = document.getElementById('personDetails');
const treeCanvas = document.getElementById('treeCanvas');
const centreSelect = document.getElementById('centreSelect');
let host = document.getElementById('personEvidence');
if (!host && personDetails) {
  host = document.createElement('div');
  host.id = 'personEvidence';
  const photos = document.getElementById('personPhotos');
  (photos || personDetails).insertAdjacentElement('afterend', host);
}
let currentPersonId = null;
let loadToken = 0;
let currentObjectUrl = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
function safeUrl(value) { const text = String(value || '').trim(); return /^https:\/\//i.test(text) ? text : ''; }
function label(value) { return String(value || 'record').replaceAll('_', ' '); }

function ensureDialog() {
  let dialog = document.getElementById('evidenceDocumentDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'evidenceDocumentDialog';
  dialog.className = 'evidence-document-dialog';
  dialog.innerHTML = '<div class="evidence-document-head"><h3>Evidence record</h3><button class="button ghost" type="button">Close</button></div><div class="evidence-document-body"></div>';
  const close = () => dialog.close();
  dialog.querySelector('button')?.addEventListener('click', close);
  dialog.addEventListener('close', () => { if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; dialog.querySelector('.evidence-document-body')?.replaceChildren(); });
  document.body.appendChild(dialog);
  return dialog;
}

async function openStoredEvidence(item) {
  const dialog = ensureDialog();
  const body = dialog.querySelector('.evidence-document-body');
  body.innerHTML = '<p class="person-evidence-loading">Loading the private record...</p>';
  dialog.querySelector('h3').textContent = item.title || item.original_filename || 'Evidence record';
  dialog.showModal();
  const { data, error } = await supabase.storage.from('family-evidence').download(item.storage_path);
  if (error) { body.innerHTML = `<p class="message error">${esc(error.message)}</p>`; return; }
  currentObjectUrl = URL.createObjectURL(data);
  const type = data.type || '';
  const filename = String(item.original_filename || '').toLowerCase();
  if (type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic|heif|tif|tiff)$/.test(filename)) body.innerHTML = `<img src="${esc(currentObjectUrl)}" alt="${esc(item.title || 'Evidence record')}" />`;
  else if (type.startsWith('audio/') || /\.(m4a|mp3|webm|ogg|wav|aac|mp4)$/.test(filename)) body.innerHTML = `<audio controls autoplay src="${esc(currentObjectUrl)}"></audio>`;
  else if (type === 'application/pdf' || /\.pdf$/.test(filename)) body.innerHTML = `<iframe src="${esc(currentObjectUrl)}" title="${esc(item.title || 'Evidence document')}"></iframe>`;
  else body.innerHTML = `<p>This file cannot be previewed in the app.</p><a class="button primary" href="${esc(currentObjectUrl)}" download="${esc(item.original_filename || 'family-evidence')}">Download record</a>`;
}

async function legacySources(personId) {
  const { data: links, error: linkError } = await supabase.from('person_sources').select('source_id,note').eq('person_id', personId);
  if (linkError) throw linkError;
  const ids = [...new Set((links || []).map((row) => row.source_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data: sources, error } = await supabase.from('sources').select('id,title,source_type,repository,citation,url,notes,evidence_status,created_at').in('id', ids);
  if (error) throw error;
  const notes = new Map((links || []).map((row) => [row.source_id, row.note]));
  return (sources || []).map((source) => ({ ...source, person_note: notes.get(source.id) || null, kind: 'citation' }));
}

function addClaimLabel(map, evidenceId, value) {
  const text = String(value || '').trim();
  if (!text) return;
  const existing = map.get(evidenceId) || [];
  if (!existing.includes(text)) existing.push(text);
  map.set(evidenceId, existing);
}

async function linkedEvidence(personId) {
  const { data: directClaims, error: directError } = await supabase.from('genealogy_claims').select('id,claim_label').eq('person_id', personId);
  if (directError) throw directError;

  const { data: relationships, error: relationshipError } = await supabase.from('relationships').select('id').or(`person1_id.eq.${personId},person2_id.eq.${personId}`);
  if (relationshipError) throw relationshipError;
  const relationshipIds = (relationships || []).map((row) => row.id).filter(Boolean);

  let relationshipClaims = [];
  if (relationshipIds.length) {
    const { data, error } = await supabase.from('genealogy_claims').select('id,claim_label').in('relationship_id', relationshipIds);
    if (error) throw error;
    relationshipClaims = data || [];
  }

  const claims = [...(directClaims || []), ...relationshipClaims];
  const claimIds = [...new Set(claims.map((row) => row.id).filter(Boolean))];
  let evidenceIds = [];
  const claimLabels = new Map();
  if (claimIds.length) {
    const { data: links, error } = await supabase.from('claim_evidence').select('claim_id,evidence_id,note').in('claim_id', claimIds);
    if (error) throw error;
    evidenceIds = (links || []).map((row) => row.evidence_id).filter(Boolean);
    const byClaim = new Map(claims.map((row) => [row.id, row.claim_label]));
    for (const row of links || []) addClaimLabel(claimLabels, row.evidence_id, byClaim.get(row.claim_id) || row.note || 'Linked family claim');
  }

  const { data: contributions, error: contributionError } = await supabase.from('contributions').select('payload').eq('target_person_id', personId).eq('status', 'approved');
  if (contributionError) throw contributionError;
  for (const contribution of contributions || []) for (const ref of contribution.payload?.evidence_items || []) if (ref?.id) evidenceIds.push(ref.id);

  const ids = [...new Set(evidenceIds)];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('evidence_items').select('id,evidence_type,title,document_date,date_text,issuing_authority,repository,storage_path,original_filename,notes,visibility,review_status,source_class').in('id', ids).eq('review_status', 'approved');
  if (error) throw error;
  return (data || []).map((item) => ({ ...item, claim_label: (claimLabels.get(item.id) || []).join('; ') || null, kind: 'stored' }));
}

function citationCard(item) {
  const url = safeUrl(item.url);
  return `<article class="person-evidence-card"><div class="person-evidence-card-head"><h4>${esc(item.title || 'Research source')}</h4><span class="person-evidence-kind">${esc(label(item.source_type || 'source'))}</span></div>${item.evidence_status ? `<p><strong>Evidence status:</strong> ${esc(label(item.evidence_status))}</p>` : ''}${item.repository ? `<p><strong>Repository:</strong> ${esc(item.repository)}</p>` : ''}${item.citation ? `<p class="person-evidence-citation">${esc(item.citation)}</p>` : ''}${item.person_note ? `<p class="person-evidence-note">${esc(item.person_note)}</p>` : ''}${url ? `<div class="person-evidence-actions"><a class="button secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open source</a></div>` : ''}</article>`;
}

function storedCard(item, index) {
  const date = item.date_text || item.document_date || '';
  return `<article class="person-evidence-card"><div class="person-evidence-card-head"><h4>${esc(item.title || item.original_filename || 'Family evidence')}</h4><span class="person-evidence-kind">${esc(label(item.evidence_type || item.source_class))}</span></div><p><strong>Record review:</strong> approved</p>${item.repository ? `<p><strong>Repository:</strong> ${esc(item.repository)}</p>` : ''}${date ? `<p><strong>Date:</strong> ${esc(date)}</p>` : ''}${item.claim_label ? `<p><strong>Linked claim:</strong> ${esc(item.claim_label)}</p>` : ''}${item.notes ? `<p class="person-evidence-note">${esc(item.notes)}</p>` : ''}${item.storage_path ? `<div class="person-evidence-actions"><button class="button secondary" type="button" data-stored-evidence="${index}">View private record</button></div>` : ''}</article>`;
}

async function render(personId) {
  if (!host || !personId || String(personId).startsWith('pending:')) { host?.replaceChildren(); return; }
  currentPersonId = personId;
  const token = ++loadToken;
  host.innerHTML = '<p class="person-evidence-loading">Loading evidence and records...</p>';
  try {
    const [sources, evidence] = await Promise.all([legacySources(personId), linkedEvidence(personId)]);
    if (token !== loadToken || currentPersonId !== personId) return;
    if (!sources.length && !evidence.length) { host.replaceChildren(); return; }
    host.innerHTML = `<section class="person-evidence-section"><div class="person-evidence-heading"><div><p class="eyebrow">Research archive</p><h3>Evidence and records</h3></div><span class="person-evidence-count">${sources.length + evidence.length}</span></div><div class="person-evidence-list">${evidence.map(storedCard).join('')}${sources.map(citationCard).join('')}</div></section>`;
    host.querySelectorAll('[data-stored-evidence]').forEach((button) => button.addEventListener('click', () => { const item = evidence[Number(button.dataset.storedEvidence)]; if (item) void openStoredEvidence(item); }));
  } catch (error) {
    if (token === loadToken) host.innerHTML = `<p class="person-evidence-empty">Evidence could not be loaded: ${esc(error?.message || 'unknown error')}</p>`;
  }
}

function selectedIdFromEvent(event) {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest('[data-person-id], [data-snapshot-person]')?.dataset?.personId || target?.closest('[data-snapshot-person]')?.dataset?.snapshotPerson || null;
}

treeCanvas?.addEventListener('click', (event) => { const id = selectedIdFromEvent(event); if (id) void render(id); }, true);
treeCanvas?.addEventListener('keydown', (event) => { if (!['Enter', ' '].includes(event.key)) return; const id = selectedIdFromEvent(event); if (id) void render(id); }, true);
centreSelect?.addEventListener('change', () => { if (centreSelect.value) void render(centreSelect.value); });
document.addEventListener('genealogy:archive-ready', () => { if (centreSelect?.value) void render(centreSelect.value); });
