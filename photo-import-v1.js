import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const editorArea = document.getElementById('editorArea');
let session = null;
let items = [];
let mappings = [];
let people = [];
let peopleById = new Map();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ');
}

function safeExt(file) {
  const ext = (file?.name || '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ext && ext.length <= 6) return ext;
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' };
  return map[file?.type] || 'img';
}

function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'archive';
}

function statusLabel(value) {
  return ({ identified_only: 'Identified', available_local: 'File located', needs_file: 'Ready for file', imported: 'Imported', hold: 'Hold for review' })[value] || value;
}

function associationLabel(value) {
  return ({ confirmed_person: 'confirmed', person_present_position_unknown: 'present - position unknown', context_only: 'context only', tentative: 'tentative' })[value] || value;
}

function mappingsFor(itemId) {
  return mappings.filter((mapping) => mapping.item_id === itemId);
}

function ensurePanel() {
  if (!editorArea) return null;
  let panel = document.getElementById('photoImportPanel');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'photoImportPanel';
  panel.className = 'panel photo-import-panel';
  editorArea.appendChild(panel);
  return panel;
}

function render() {
  const panel = ensurePanel();
  if (!panel) return;
  const ready = items.filter((item) => ['needs_file','available_local'].includes(item.import_status)).length;
  const held = items.filter((item) => item.import_status === 'hold').length;
  const imported = items.filter((item) => item.import_status === 'imported').length;

  panel.innerHTML = `
    <div class="photo-import-head">
      <div><p class="eyebrow">Family editor</p><h2>Archive photo import queue</h2><p class="small">Upload each source photograph once. The archive mappings below attach it to every person already identified in that image.</p></div>
      <div class="photo-import-counts"><span>${ready} ready</span><span>${held} on hold</span><span>${imported} imported</span></div>
    </div>
    <p id="photoImportMessage" class="message" aria-live="polite"></p>
    <div class="photo-import-list">
      ${items.map((item) => {
        const mapped = mappingsFor(item.id);
        const peopleHtml = mapped.length
          ? mapped.map((mapping) => {
              const person = peopleById.get(mapping.person_id);
              return `<span class="photo-map-person"><strong>${esc(canonicalName(person))}</strong><small>${esc(associationLabel(mapping.association_status))}</small></span>`;
            }).join('')
          : '<span class="photo-map-none">No person-level attachment yet</span>';
        const uploadable = ['needs_file','available_local'].includes(item.import_status) && mapped.length;
        return `
          <article class="photo-import-item" data-item-id="${esc(item.id)}">
            <div class="photo-import-meta">
              <div><span class="photo-source-code">${esc(item.source_item)}</span><strong>${esc(item.source_description)}</strong></div>
              <span class="photo-import-status status-${esc(item.import_status)}">${esc(statusLabel(item.import_status))}</span>
            </div>
            <div class="photo-map-row">${peopleHtml}</div>
            ${item.notes ? `<p class="photo-import-note">${esc(item.notes)}</p>` : ''}
            ${uploadable ? `<div class="photo-import-upload"><input class="photo-import-file" type="file" accept="image/*" /><button class="button secondary photo-import-button" type="button">Upload and attach</button></div>` : ''}
          </article>`;
      }).join('')}
    </div>`;

  panel.querySelectorAll('.photo-import-button').forEach((button) => {
    button.addEventListener('click', () => void uploadItem(button.closest('.photo-import-item')));
  });
}

async function uploadItem(article) {
  if (!article) return;
  const item = items.find((entry) => entry.id === article.dataset.itemId);
  const file = article.querySelector('.photo-import-file')?.files?.[0];
  const message = document.getElementById('photoImportMessage');
  if (!item || !file) {
    if (message) message.textContent = 'Choose the matching photograph first.';
    return;
  }
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
    if (message) message.textContent = 'Please choose an image smaller than 20 MB.';
    return;
  }

  const mapped = mappingsFor(item.id);
  if (!mapped.length) return;
  const storagePath = `archive/${slugify(item.source_collection)}/${slugify(item.source_item)}-${crypto.randomUUID()}.${safeExt(file)}`;
  if (message) message.textContent = `Uploading ${item.source_item}…`;

  const { error: uploadError } = await supabase.storage.from('person-photos').upload(storagePath, file, {
    contentType: file.type || undefined,
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) {
    if (message) message.textContent = `Upload failed: ${uploadError.message}`;
    return;
  }

  const personIds = mapped.map((mapping) => mapping.person_id);
  const { data: existing } = await supabase
    .from('person_photos')
    .select('person_id')
    .eq('source_collection', item.source_collection)
    .eq('source_item', item.source_item)
    .in('person_id', personIds);
  const existingIds = new Set((existing || []).map((row) => row.person_id));
  const rows = mapped.filter((mapping) => !existingIds.has(mapping.person_id)).map((mapping) => ({
    person_id: mapping.person_id,
    storage_path: storagePath,
    caption: item.source_description,
    source_status: mapping.evidence_status,
    association_status: mapping.association_status,
    identification_note: mapping.identification_note || null,
    source_collection: item.source_collection,
    source_item: item.source_item,
    uploaded_by: session?.user?.id || null,
  }));

  if (rows.length) {
    const { error: rowError } = await supabase.from('person_photos').insert(rows);
    if (rowError) {
      await supabase.storage.from('person-photos').remove([storagePath]);
      if (message) message.textContent = `The file uploaded but could not be attached: ${rowError.message}`;
      return;
    }
  }

  const { error: statusError } = await supabase.from('photo_import_items').update({ import_status: 'imported' }).eq('id', item.id);
  if (statusError) {
    if (message) message.textContent = `Photo attached, but queue status could not be updated: ${statusError.message}`;
  } else if (message) {
    message.textContent = `${item.source_item} imported and attached to ${mapped.length} ${mapped.length === 1 ? 'person' : 'people'}.`;
  }
  await loadQueue();
}

async function loadQueue() {
  const [itemResult, mappingResult, peopleResult] = await Promise.all([
    supabase.from('photo_import_items').select('*').order('source_collection').order('source_item'),
    supabase.from('photo_import_people').select('*'),
    supabase.from('people').select('id,given_names,surname'),
  ]);
  if (itemResult.error) throw itemResult.error;
  if (mappingResult.error) throw mappingResult.error;
  if (peopleResult.error) throw peopleResult.error;
  items = itemResult.data || [];
  mappings = mappingResult.data || [];
  people = peopleResult.data || [];
  peopleById = new Map(people.map((person) => [person.id, person]));
  render();
}

async function initialise() {
  const { data } = await supabase.auth.getSession();
  session = data.session;
  if (!session) return;
  const { data: me } = await supabase.from('app_users').select('role,status').eq('user_id', session.user.id).maybeSingle();
  if (me?.status !== 'approved' || !['editor','admin'].includes(me?.role)) return;
  await loadQueue();
}

void initialise();
