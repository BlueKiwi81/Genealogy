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
  return ({ identified_only: 'Identified', available_local: 'File located', needs_file: 'Ready for upload', imported: 'Imported', hold: 'Hold for review' })[value] || value;
}

function associationLabel(value) {
  return ({ confirmed_person: 'confirmed', person_present_position_unknown: 'present - position unknown', context_only: 'context only', tentative: 'tentative' })[value] || value;
}

function evidenceLabel(value) {
  return String(value || 'family_supplied').replaceAll('_', ' ');
}

function mappingsFor(itemId) {
  return mappings.filter((mapping) => mapping.item_id === itemId);
}

function setMessage(text = '', type = '') {
  const message = document.getElementById('photoImportMessage');
  if (!message) return;
  message.textContent = text;
  message.className = `message${type ? ` ${type}` : ''}`;
}

function peopleOptions(itemId) {
  const used = new Set(mappingsFor(itemId).map((mapping) => mapping.person_id));
  return [...people]
    .filter((person) => !used.has(person.id))
    .sort((a, b) => canonicalName(a).localeCompare(canonicalName(b)))
    .map((person) => `<option value="${esc(person.id)}">${esc(canonicalName(person))}</option>`)
    .join('');
}

function mappingHtml(item, mapping) {
  const person = peopleById.get(mapping.person_id);
  const removable = item.import_status !== 'imported';
  return `<span class="photo-map-person">
    <span><strong>${esc(canonicalName(person))}</strong><small>${esc(associationLabel(mapping.association_status))} · ${esc(evidenceLabel(mapping.evidence_status))}</small></span>
    ${removable ? `<button class="photo-map-remove" type="button" data-remove-person="${esc(mapping.person_id)}" aria-label="Remove ${esc(canonicalName(person))} from this archive item">Remove</button>` : ''}
  </span>`;
}

function statusOptions(current) {
  const values = [
    ['hold', 'Hold for review'],
    ['identified_only', 'Identified - mapping reviewed'],
    ['available_local', 'File located - ready to upload'],
    ['needs_file', 'Ready for upload - file still needed'],
  ];
  return values.map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`).join('');
}

function associationOptions() {
  return `
    <option value="confirmed_person">Confirmed person</option>
    <option value="person_present_position_unknown">Person present - position unknown</option>
    <option value="context_only">Context only</option>
    <option value="tentative" selected>Tentative</option>`;
}

function evidenceOptions() {
  return `
    <option value="family_supplied" selected>Family supplied</option>
    <option value="strong">Strong</option>
    <option value="probable">Probable</option>
    <option value="hypothesis">Hypothesis</option>
    <option value="unresolved">Unresolved</option>
    <option value="documented">Documented</option>`;
}

function activeItemHtml(item) {
  const mapped = mappingsFor(item.id);
  const peopleHtml = mapped.length
    ? mapped.map((mapping) => mappingHtml(item, mapping)).join('')
    : '<span class="photo-map-none">No person-level attachment yet. Add one below before marking this item ready for upload.</span>';
  const uploadable = ['needs_file', 'available_local'].includes(item.import_status) && mapped.length;
  const availablePeople = peopleOptions(item.id);

  return `
    <details class="photo-import-item" data-item-id="${esc(item.id)}">
      <summary class="photo-import-item-summary">
        <span class="photo-import-meta-main"><span class="photo-source-code">${esc(item.source_item)}</span><strong>${esc(item.source_description)}</strong></span>
        <span class="photo-import-status status-${esc(item.import_status)}">${esc(statusLabel(item.import_status))}</span>
      </summary>
      <div class="photo-import-item-body">
        <p class="photo-import-collection">${esc(item.source_collection)}</p>
        <div class="photo-map-row">${peopleHtml}</div>

        <div class="photo-import-review-grid">
          <label><span>Queue status</span><select class="photo-status-select">${statusOptions(item.import_status)}</select></label>
          <label class="photo-review-note-field"><span>Review note</span><textarea class="photo-review-note" rows="2" placeholder="Why is this on hold, or what still needs checking?">${esc(item.notes || '')}</textarea></label>
          <div class="photo-import-review-actions">
            <button class="button secondary photo-save-status" type="button">Save status and note</button>
          </div>
        </div>

        <div class="photo-import-mapping-editor">
          <strong>Add or confirm a person in this image</strong>
          ${availablePeople ? `
            <div class="photo-mapping-grid">
              <label><span>Person</span><select class="photo-person-select"><option value="">Choose a person...</option>${availablePeople}</select></label>
              <label><span>Identification</span><select class="photo-association-select">${associationOptions()}</select></label>
              <label><span>Evidence status</span><select class="photo-evidence-select">${evidenceOptions()}</select></label>
              <label class="photo-identification-note-field"><span>Identification note</span><input class="photo-identification-note" type="text" placeholder="e.g. labelled Oom At in family scrapbook" /></label>
            </div>
            <button class="button secondary photo-add-mapping" type="button">Add person mapping</button>`
            : '<p class="small">Every current family person is already mapped to this archive item.</p>'}
        </div>

        ${uploadable ? `
          <div class="photo-import-upload">
            <div><strong>Import the original image</strong><small>Choose the matching source photograph. It will be attached to every person mapped above.</small></div>
            <input class="photo-import-file" type="file" accept="image/*" />
            <button class="button primary photo-import-button" type="button">Upload and attach</button>
          </div>` : `
          <p class="photo-import-next-step">${mapped.length ? 'When the image file is available, set the queue status to File located or Ready for upload.' : 'First confirm at least one person mapping. The item can remain on hold until the identification is good enough.'}</p>`}
      </div>
    </details>`;
}

function importedItemHtml(item) {
  const mapped = mappingsFor(item.id);
  const peopleHtml = mapped.length
    ? mapped.map((mapping) => mappingHtml(item, mapping)).join('')
    : '<span class="photo-map-none">Imported without a current person mapping.</span>';
  return `
    <details class="photo-import-item photo-import-item-complete" data-item-id="${esc(item.id)}">
      <summary class="photo-import-item-summary">
        <span class="photo-import-meta-main"><span class="photo-source-code">${esc(item.source_item)}</span><strong>${esc(item.source_description)}</strong></span>
        <span class="photo-import-status status-imported">Imported</span>
      </summary>
      <div class="photo-import-item-body">
        <p class="photo-import-collection">${esc(item.source_collection)}</p>
        <div class="photo-map-row">${peopleHtml}</div>
        ${item.notes ? `<p class="photo-import-note">${esc(item.notes)}</p>` : ''}
        <p class="small">This item has already been imported. It is kept here as an audit trail rather than as work waiting for you.</p>
      </div>
    </details>`;
}

function ensurePanel() {
  if (!editorArea) return null;
  let panel = document.getElementById('photoImportPanel');
  if (panel && panel.tagName !== 'DETAILS') {
    const replacement = document.createElement('details');
    replacement.id = 'photoImportPanel';
    replacement.className = 'panel photo-import-panel';
    panel.replaceWith(replacement);
    panel = replacement;
  }
  if (panel) return panel;
  panel = document.createElement('details');
  panel.id = 'photoImportPanel';
  panel.className = 'panel photo-import-panel';
  editorArea.appendChild(panel);
  return panel;
}

function render() {
  const panel = ensurePanel();
  if (!panel) return;
  const wasOpen = panel.open;
  const openItems = new Set([...panel.querySelectorAll('.photo-import-item[open]')].map((row) => row.dataset.itemId));
  const active = items.filter((item) => item.import_status !== 'imported');
  const importedItems = items.filter((item) => item.import_status === 'imported');
  const ready = active.filter((item) => ['needs_file', 'available_local'].includes(item.import_status)).length;
  const held = active.filter((item) => item.import_status === 'hold').length;

  panel.innerHTML = `
    <summary class="photo-import-panel-summary">
      <span>
        <span class="eyebrow">Family editor</span>
        <strong>Archive photo import queue</strong>
        <small>${active.length} item${active.length === 1 ? '' : 's'} still need review or a source file.</small>
      </span>
      <span class="photo-import-summary-side">
        <span class="photo-import-counts"><span>${ready} ready</span><span>${held} on hold</span><span>${importedItems.length} imported</span></span>
        <span class="photo-import-panel-indicator" aria-hidden="true">+</span>
      </span>
    </summary>
    <div class="photo-import-panel-body">
      <p class="small photo-import-intro">Open only the items that need attention. Held items can be mapped to a person, annotated and moved to a ready state. Imported items are separated below so they do not clutter the working queue.</p>
      <p id="photoImportMessage" class="message" aria-live="polite"></p>
      <div class="photo-import-list">
        ${active.length ? active.map(activeItemHtml).join('') : '<div class="queue-empty">Nothing in the archive photo queue currently needs action.</div>'}
      </div>
      ${importedItems.length ? `
        <details class="photo-import-completed">
          <summary>Previously imported (${importedItems.length})</summary>
          <div class="photo-import-list photo-import-completed-list">${importedItems.map(importedItemHtml).join('')}</div>
        </details>` : ''}
    </div>`;

  panel.open = wasOpen;
  panel.querySelectorAll('.photo-import-item').forEach((row) => {
    if (openItems.has(row.dataset.itemId)) row.open = true;
  });

  panel.querySelectorAll('.photo-import-button').forEach((button) => {
    button.addEventListener('click', () => void uploadItem(button.closest('.photo-import-item')));
  });
  panel.querySelectorAll('.photo-save-status').forEach((button) => {
    button.addEventListener('click', () => void saveItemReview(button.closest('.photo-import-item')));
  });
  panel.querySelectorAll('.photo-add-mapping').forEach((button) => {
    button.addEventListener('click', () => void addMapping(button.closest('.photo-import-item')));
  });
  panel.querySelectorAll('[data-remove-person]').forEach((button) => {
    button.addEventListener('click', () => void removeMapping(button.closest('.photo-import-item'), button.dataset.removePerson));
  });
}

async function saveItemReview(article) {
  if (!article) return;
  const item = items.find((entry) => entry.id === article.dataset.itemId);
  if (!item) return;
  const nextStatus = article.querySelector('.photo-status-select')?.value || item.import_status;
  const notes = article.querySelector('.photo-review-note')?.value.trim() || null;
  const mapped = mappingsFor(item.id);
  if (['needs_file', 'available_local'].includes(nextStatus) && !mapped.length) {
    setMessage('Add at least one person mapping before marking this archive item ready for a file.', 'error');
    return;
  }
  setMessage(`Saving review for ${item.source_item}...`);
  const { error } = await supabase.from('photo_import_items').update({ import_status: nextStatus, notes }).eq('id', item.id);
  if (error) {
    setMessage(`Could not save ${item.source_item}: ${error.message}`, 'error');
    return;
  }
  setMessage(`${item.source_item} updated to ${statusLabel(nextStatus)}.`, 'success');
  await loadQueue(true, item.id);
}

async function addMapping(article) {
  if (!article) return;
  const item = items.find((entry) => entry.id === article.dataset.itemId);
  const personId = article.querySelector('.photo-person-select')?.value || '';
  if (!item || !personId) {
    setMessage('Choose the person you are identifying in this image.', 'error');
    return;
  }
  const associationStatus = article.querySelector('.photo-association-select')?.value || 'tentative';
  const evidenceStatus = article.querySelector('.photo-evidence-select')?.value || 'family_supplied';
  const identificationNote = article.querySelector('.photo-identification-note')?.value.trim() || null;
  setMessage(`Adding person mapping to ${item.source_item}...`);
  const { error } = await supabase.from('photo_import_people').upsert({
    item_id: item.id,
    person_id: personId,
    association_status: associationStatus,
    evidence_status: evidenceStatus,
    identification_note: identificationNote,
  }, { onConflict: 'item_id,person_id' });
  if (error) {
    setMessage(`Could not add the person mapping: ${error.message}`, 'error');
    return;
  }
  const person = peopleById.get(personId);
  setMessage(`${canonicalName(person)} is now mapped to ${item.source_item}.`, 'success');
  await loadQueue(true, item.id);
}

async function removeMapping(article, personId) {
  if (!article || !personId) return;
  const item = items.find((entry) => entry.id === article.dataset.itemId);
  const person = peopleById.get(personId);
  if (!item) return;
  setMessage(`Removing ${canonicalName(person)} from ${item.source_item}...`);
  const { error } = await supabase.from('photo_import_people').delete().eq('item_id', item.id).eq('person_id', personId);
  if (error) {
    setMessage(`Could not remove the mapping: ${error.message}`, 'error');
    return;
  }
  setMessage(`${canonicalName(person)} was removed from ${item.source_item}.`, 'success');
  await loadQueue(true, item.id);
}

async function uploadItem(article) {
  if (!article) return;
  const item = items.find((entry) => entry.id === article.dataset.itemId);
  const file = article.querySelector('.photo-import-file')?.files?.[0];
  if (!item || !file) {
    setMessage('Choose the matching photograph first.', 'error');
    return;
  }
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
    setMessage('Please choose an image smaller than 20 MB.', 'error');
    return;
  }

  const mapped = mappingsFor(item.id);
  if (!mapped.length) {
    setMessage('Confirm at least one person mapping before importing the image.', 'error');
    return;
  }
  const storagePath = `archive/${slugify(item.source_collection)}/${slugify(item.source_item)}-${crypto.randomUUID()}.${safeExt(file)}`;
  setMessage(`Uploading ${item.source_item}...`);

  const { error: uploadError } = await supabase.storage.from('person-photos').upload(storagePath, file, {
    contentType: file.type || undefined,
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) {
    setMessage(`Upload failed: ${uploadError.message}`, 'error');
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
      setMessage(`The file uploaded but could not be attached: ${rowError.message}`, 'error');
      return;
    }
  }

  const { error: statusError } = await supabase.from('photo_import_items').update({ import_status: 'imported' }).eq('id', item.id);
  if (statusError) {
    setMessage(`Photo attached, but queue status could not be updated: ${statusError.message}`, 'error');
  } else {
    setMessage(`${item.source_item} imported and attached to ${mapped.length} ${mapped.length === 1 ? 'person' : 'people'}.`, 'success');
  }
  await loadQueue(true);
}

async function loadQueue(keepOpen = false, openItemId = null) {
  const panel = document.getElementById('photoImportPanel');
  const shouldOpen = keepOpen ? (panel?.open ?? true) : false;
  const [itemResult, mappingResult, peopleResult] = await Promise.all([
    supabase.from('photo_import_items').select('*').order('source_collection').order('source_item'),
    supabase.from('photo_import_people').select('*'),
    supabase.from('people').select('id,given_names,preferred_name,surname'),
  ]);
  if (itemResult.error) throw itemResult.error;
  if (mappingResult.error) throw mappingResult.error;
  if (peopleResult.error) throw peopleResult.error;
  items = itemResult.data || [];
  mappings = mappingResult.data || [];
  people = peopleResult.data || [];
  peopleById = new Map(people.map((person) => [person.id, person]));
  render();
  const nextPanel = document.getElementById('photoImportPanel');
  if (nextPanel) nextPanel.open = shouldOpen;
  if (openItemId) {
    const row = nextPanel?.querySelector(`[data-item-id="${CSS.escape(openItemId)}"]`);
    if (row) row.open = true;
  }
}

async function initialise() {
  const { data } = await supabase.auth.getSession();
  session = data.session;
  if (!session) return;
  const { data: me } = await supabase.from('app_users').select('role,status').eq('user_id', session.user.id).maybeSingle();
  if (me?.status !== 'approved' || !['editor','admin'].includes(me?.role)) return;
  await loadQueue(false);
}

supabase.auth.onAuthStateChange((_event, nextSession) => {
  session = nextSession;
  if (session) void initialise();
});

void initialise();
