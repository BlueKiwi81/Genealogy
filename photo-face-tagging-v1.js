import { supabase } from './supabase-client-v1.js';

let session = null;
let canEdit = false;
let people = [];
let peopleById = new Map();
let enhancing = false;

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

function installStyles() {
  if (document.getElementById('photoFaceTagStyles')) return;
  const style = document.createElement('style');
  style.id = 'photoFaceTagStyles';
  style.textContent = `
    .photo-review-visual{margin:12px 0;padding:12px;border:1px solid #dfd5c8;border-radius:12px;background:#fbf8f2}
    .photo-review-visual-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px}
    .photo-review-visual-head strong{font-size:.95rem;line-height:1.35}
    .photo-review-visual-help{margin:7px 0 0;color:#695f56;font-size:.84rem;line-height:1.5}
    .photo-review-missing{display:grid;gap:9px;padding:12px;border:1px dashed #cfc2b3;border-radius:10px;background:#fff}
    .photo-review-missing p{margin:0;font-size:.86rem;line-height:1.5;color:#655b52}
    .photo-review-upload-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .photo-review-upload-row input{min-width:220px;font-size:.86rem}
    .face-tag-stage{position:relative;display:block;width:fit-content;max-width:100%;margin:0 auto;background:#eee7de;border-radius:10px;overflow:hidden;line-height:0;cursor:crosshair}
    .face-tag-stage img{display:block;max-width:100%;max-height:72vh;width:auto;height:auto;object-fit:contain}
    .face-tag-layer{position:absolute;inset:0;pointer-events:none}
    .face-tag-marker{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;display:flex;align-items:center;gap:5px;border:0;background:transparent;padding:0;cursor:pointer;line-height:1.2}
    .face-tag-dot{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid #6b5948;box-shadow:0 1px 5px rgba(0,0,0,.3);font:700 10px/1 Arial,sans-serif;color:#40362e}
    .face-tag-name{max-width:170px;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.94);box-shadow:0 1px 4px rgba(0,0,0,.2);font:700 11px/1.25 Arial,sans-serif;color:#332c26;white-space:normal;text-align:left}
    .face-tag-pending{position:absolute;transform:translate(-50%,-50%);width:26px;height:26px;border:3px solid #9d6b2d;border-radius:50%;background:rgba(255,255,255,.72);box-shadow:0 1px 6px rgba(0,0,0,.28);pointer-events:none}
    .face-tag-editor{display:none;grid-template-columns:minmax(220px,1fr) auto auto;gap:8px;align-items:end;margin-top:10px;padding:10px;border-radius:10px;background:#f2ece3}
    .face-tag-editor.active{display:grid}
    .face-tag-editor label{display:grid;gap:5px;font-size:.82rem;font-weight:700;color:#554b43}
    .face-tag-editor select{width:100%;padding:8px;border:1px solid #d3c8bb;border-radius:8px;background:#fff;font-size:.88rem}
    .face-tag-status{margin:7px 0 0;font-size:.82rem;line-height:1.45;color:#665c53}
    .face-tag-status.error{color:#8a3e36}
    .photo-dialog .face-tag-stage{max-width:min(88vw,1100px);max-height:76vh}
    .photo-dialog .face-tag-stage img{max-width:min(88vw,1100px);max-height:76vh}
    .photo-dialog-tagging{margin:8px 0 2px}
    @media(max-width:700px){.face-tag-editor{grid-template-columns:1fr}.photo-review-upload-row{display:grid}.photo-review-upload-row input{min-width:0;width:100%}.face-tag-name{display:none}}
  `;
  document.head.appendChild(style);
}

function peopleOptions(selected = '') {
  return people.map((person) => `<option value="${esc(person.id)}"${person.id === selected ? ' selected' : ''}>${esc(canonicalName(person))}</option>`).join('');
}

async function signedUrlFor(path) {
  const { data, error } = await supabase.storage.from('person-photos').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

function storagePathFromSignedUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    const markers = ['/storage/v1/object/sign/person-photos/', '/object/sign/person-photos/'];
    for (const marker of markers) {
      const index = parsed.pathname.indexOf(marker);
      if (index >= 0) return decodeURIComponent(parsed.pathname.slice(index + marker.length));
    }
  } catch (_) {}
  return '';
}

async function loadTags(storagePath) {
  const { data, error } = await supabase.from('photo_face_tags')
    .select('id,storage_path,person_id,x_pct,y_pct,source_status,identification_note')
    .eq('storage_path', storagePath)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

function markerHtml(tag, index) {
  const person = peopleById.get(tag.person_id);
  const name = canonicalName(person) || 'Tagged person';
  return `<button type="button" class="face-tag-marker" data-face-tag-id="${esc(tag.id)}" style="left:${Number(tag.x_pct)}%;top:${Number(tag.y_pct)}%" title="${esc(name)}">
    <span class="face-tag-dot">${index + 1}</span><span class="face-tag-name">${esc(name)}</span>
  </button>`;
}

async function renderMarkers(stage, storagePath) {
  const layer = stage.querySelector('.face-tag-layer');
  if (!layer) return;
  try {
    const tags = await loadTags(storagePath);
    layer.innerHTML = tags.map(markerHtml).join('');
  } catch (_) {
    layer.innerHTML = '';
  }
}

function ensureTagEditor(host, prefix = '') {
  let editor = host.querySelector('.face-tag-editor');
  if (editor) return editor;
  editor = document.createElement('div');
  editor.className = `face-tag-editor ${prefix}`.trim();
  editor.innerHTML = `
    <label>Who is this?<select class="face-tag-person"><option value="">Choose a person...</option>${peopleOptions()}</select></label>
    <button type="button" class="button primary face-tag-save">Save face tag</button>
    <button type="button" class="button ghost face-tag-cancel">Cancel</button>
    <p class="face-tag-status" style="grid-column:1/-1"></p>`;
  host.appendChild(editor);
  return editor;
}

function clearPending(stage, editor) {
  stage.querySelector('.face-tag-pending')?.remove();
  stage.dataset.pendingX = '';
  stage.dataset.pendingY = '';
  editor?.classList.remove('active');
  const status = editor?.querySelector('.face-tag-status');
  if (status) { status.textContent = ''; status.classList.remove('error'); }
}

function setPending(stage, editor, event) {
  const img = stage.querySelector('img');
  if (!img || !img.complete) return;
  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
  const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
  stage.querySelector('.face-tag-pending')?.remove();
  const pending = document.createElement('span');
  pending.className = 'face-tag-pending';
  pending.style.left = `${x}%`;
  pending.style.top = `${y}%`;
  stage.appendChild(pending);
  stage.dataset.pendingX = String(x);
  stage.dataset.pendingY = String(y);
  editor.classList.add('active');
  editor.querySelector('.face-tag-person')?.focus();
}

async function representativePhoto(storagePath) {
  const { data } = await supabase.from('person_photos')
    .select('caption,date_text,place,source_status,source_collection,source_item')
    .eq('storage_path', storagePath)
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function ensurePersonPhotoLink(personId, storagePath, context = {}) {
  const { data: existing, error: existingError } = await supabase.from('person_photos')
    .select('id')
    .eq('person_id', personId)
    .eq('storage_path', storagePath)
    .limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return existing[0].id;

  const base = context.photo || await representativePhoto(storagePath) || {};
  const row = {
    person_id: personId,
    storage_path: storagePath,
    caption: context.caption ?? base.caption ?? null,
    date_text: base.date_text ?? null,
    place: base.place ?? null,
    source_status: context.source_status || base.source_status || 'family_supplied',
    source_collection: context.source_collection ?? base.source_collection ?? null,
    source_item: context.source_item ?? base.source_item ?? null,
    association_status: 'confirmed_person',
    identification_note: context.identification_note || 'Face tagged by family editor.',
    uploaded_by: session?.user?.id || null,
  };
  const { data, error } = await supabase.from('person_photos').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

async function saveTag(stage, editor, storagePath, context = {}) {
  const personId = editor.querySelector('.face-tag-person')?.value || '';
  const x = Number(stage.dataset.pendingX);
  const y = Number(stage.dataset.pendingY);
  const status = editor.querySelector('.face-tag-status');
  if (!personId || !Number.isFinite(x) || !Number.isFinite(y)) {
    status.textContent = 'Click the person\'s face and choose their name first.';
    status.classList.add('error');
    return;
  }
  status.textContent = 'Saving tag and linking the photograph...';
  status.classList.remove('error');
  const person = peopleById.get(personId);

  try {
    const { error: tagError } = await supabase.from('photo_face_tags').upsert({
      storage_path: storagePath,
      person_id: personId,
      x_pct: x,
      y_pct: y,
      source_status: 'family_supplied',
      identification_note: 'Face position identified by family editor.',
      created_by: session?.user?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'storage_path,person_id' });
    if (tagError) throw tagError;

    if (context.item_id) {
      const { error: mapError } = await supabase.from('photo_import_people').upsert({
        item_id: context.item_id,
        person_id: personId,
        association_status: 'confirmed_person',
        evidence_status: 'family_supplied',
        identification_note: 'Face tagged in archive review by family editor.',
      }, { onConflict: 'item_id,person_id' });
      if (mapError) throw mapError;
    }

    await ensurePersonPhotoLink(personId, storagePath, context);
    await renderMarkers(stage, storagePath);
    clearPending(stage, editor);
    status.textContent = `${canonicalName(person)} is now tagged and this photograph is linked to their profile.`;
    document.dispatchEvent(new CustomEvent('genealogy:photo-tags-updated', { detail: { personId, storagePath } }));
  } catch (error) {
    status.textContent = error?.message || 'The face tag could not be saved.';
    status.classList.add('error');
  }
}

function bindStage(stage, editor, storagePath, context = {}) {
  if (stage.dataset.tagBound === '1') return;
  stage.dataset.tagBound = '1';
  stage.addEventListener('click', (event) => {
    if (event.target.closest?.('.face-tag-marker')) return;
    setPending(stage, editor, event);
  });
  editor.querySelector('.face-tag-cancel')?.addEventListener('click', () => clearPending(stage, editor));
  editor.querySelector('.face-tag-save')?.addEventListener('click', () => void saveTag(stage, editor, storagePath, context));
}

async function findExistingArchiveStorage(item) {
  if (item.storage_path) return item.storage_path;
  const { data } = await supabase.from('person_photos')
    .select('storage_path')
    .eq('source_collection', item.source_collection)
    .eq('source_item', item.source_item)
    .limit(1)
    .maybeSingle();
  if (!data?.storage_path) return '';
  await supabase.from('photo_import_items').update({ storage_path: data.storage_path }).eq('id', item.id);
  return data.storage_path;
}

async function uploadArchiveSource(item, file, visual) {
  const status = visual.querySelector('.face-tag-status') || visual.querySelector('.photo-review-visual-help');
  if (!file?.type?.startsWith('image/')) {
    if (status) status.textContent = 'Choose an image file first.';
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    if (status) status.textContent = 'Please use an image smaller than 20 MB.';
    return;
  }
  const path = `archive-review/${slugify(item.source_collection)}/${slugify(item.source_item)}-${crypto.randomUUID()}.${safeExt(file)}`;
  if (status) status.textContent = `Uploading ${item.source_item} for private review...`;
  const { error: uploadError } = await supabase.storage.from('person-photos').upload(path, file, {
    cacheControl: '3600', contentType: file.type || undefined, upsert: false,
  });
  if (uploadError) {
    if (status) status.textContent = `Upload failed: ${uploadError.message}`;
    return;
  }
  const { error: rowError } = await supabase.from('photo_import_items').update({
    storage_path: path,
    source_image_uploaded_by: session?.user?.id || null,
    source_image_uploaded_at: new Date().toISOString(),
  }).eq('id', item.id);
  if (rowError) {
    await supabase.storage.from('person-photos').remove([path]);
    if (status) status.textContent = `The image uploaded but could not be attached to the review item: ${rowError.message}`;
    return;
  }
  await enhanceArchiveItem(visual.closest('.photo-import-item'), true);
}

async function enhanceArchiveItem(card, force = false) {
  if (!canEdit || !card?.dataset?.itemId) return;
  if (!force && card.dataset.photoVisualReady === '1') return;
  card.dataset.photoVisualReady = 'loading';
  const itemId = card.dataset.itemId;
  const { data: item, error } = await supabase.from('photo_import_items')
    .select('id,source_collection,source_item,source_description,import_status,storage_path')
    .eq('id', itemId).maybeSingle();
  if (error || !item || !card.isConnected) { card.dataset.photoVisualReady = ''; return; }

  let visual = card.querySelector('.photo-review-visual');
  if (!visual) {
    visual = document.createElement('div');
    visual.className = 'photo-review-visual';
    const collection = card.querySelector('.photo-import-collection');
    if (collection) collection.insertAdjacentElement('afterend', visual);
    else card.querySelector('.photo-import-item-body')?.prepend(visual);
  }

  const storagePath = await findExistingArchiveStorage(item);
  if (!storagePath) {
    visual.innerHTML = `
      <div class="photo-review-visual-head"><strong>Image preview</strong></div>
      <div class="photo-review-missing">
        <p>The catalogue entry exists, but its source image has not yet been attached to the private archive. Attach it first so you can review the actual photograph before identifying anyone.</p>
        <div class="photo-review-upload-row"><input class="photo-review-source-file" type="file" accept="image/*" /><button class="button primary photo-review-source-upload" type="button">Attach source image for review</button></div>
        <p class="face-tag-status"></p>
      </div>`;
    visual.querySelector('.photo-review-source-upload')?.addEventListener('click', () => {
      const file = visual.querySelector('.photo-review-source-file')?.files?.[0];
      void uploadArchiveSource(item, file, visual);
    });
    const next = card.querySelector('.photo-import-next-step');
    if (next) next.textContent = 'Attach the source image above first. Then click faces in the preview to identify and link people.';
    card.dataset.photoVisualReady = '1';
    return;
  }

  try {
    const url = await signedUrlFor(storagePath);
    visual.innerHTML = `
      <div class="photo-review-visual-head"><strong>Image preview</strong><span class="photo-import-status">Click a face to tag</span></div>
      <div class="face-tag-stage" data-storage-path="${esc(storagePath)}"><img src="${esc(url)}" alt="${esc(item.source_description || item.source_item)}" /><div class="face-tag-layer"></div></div>
      <p class="photo-review-visual-help">Click directly on a face, choose the person, then save. The tag is stored with the photograph and the same image is linked to that person's profile.</p>`;
    const stage = visual.querySelector('.face-tag-stage');
    const editor = ensureTagEditor(visual);
    const context = {
      item_id: item.id,
      caption: item.source_description || null,
      source_collection: item.source_collection,
      source_item: item.source_item,
      source_status: 'family_supplied',
      identification_note: `Face tagged in ${item.source_item} during archive review.`,
    };
    bindStage(stage, editor, storagePath, context);
    await renderMarkers(stage, storagePath);
    const next = card.querySelector('.photo-import-next-step');
    if (next && !card.querySelector('.photo-map-person')) next.textContent = 'Use the preview above to click and tag the people you can identify. Unidentified people can remain untagged.';
    card.dataset.photoVisualReady = '1';
  } catch (previewError) {
    visual.innerHTML = `<p class="face-tag-status error">The source image is attached but the preview could not be opened: ${esc(previewError?.message || 'unknown error')}</p>`;
    card.dataset.photoVisualReady = '1';
  }
}

function prepareDialogStructure(dialog) {
  if (!dialog || dialog.dataset.faceTagPrepared === '1') return;
  const img = dialog.querySelector('.photo-dialog-image');
  if (!img) return;
  const stage = document.createElement('div');
  stage.className = 'face-tag-stage';
  img.replaceWith(stage);
  stage.appendChild(img);
  const layer = document.createElement('div');
  layer.className = 'face-tag-layer';
  stage.appendChild(layer);
  const controls = document.createElement('div');
  controls.className = 'photo-dialog-tagging';
  const copy = dialog.querySelector('.photo-dialog-copy');
  if (copy) copy.insertAdjacentElement('beforebegin', controls);
  else dialog.appendChild(controls);
  dialog.dataset.faceTagPrepared = '1';
}

async function enhanceOpenPhotoDialog() {
  if (!canEdit) return;
  const dialog = document.getElementById('personPhotoDialog');
  if (!dialog?.open) return;
  prepareDialogStructure(dialog);
  const stage = dialog.querySelector('.face-tag-stage');
  const img = stage?.querySelector('img');
  const controls = dialog.querySelector('.photo-dialog-tagging');
  if (!stage || !img || !controls) return;
  const storagePath = storagePathFromSignedUrl(img.src);
  if (!storagePath) return;
  if (stage.dataset.activeStoragePath === storagePath) return;
  stage.dataset.activeStoragePath = storagePath;
  stage.dataset.tagBound = '';
  controls.innerHTML = '<p class="photo-review-visual-help">Editor tagging: click a face in the photograph, choose the person, and save. This links the same photograph to that person too.</p>';
  const editor = ensureTagEditor(controls, 'photo-dialog-face-editor');
  bindStage(stage, editor, storagePath, {});
  await renderMarkers(stage, storagePath);
}

async function enhanceVisibleArchiveCards() {
  if (!canEdit || enhancing) return;
  enhancing = true;
  try {
    const cards = [...document.querySelectorAll('.photo-import-item[data-item-id]')];
    for (const card of cards) await enhanceArchiveItem(card);
  } finally {
    enhancing = false;
  }
}

function observeUi() {
  const observer = new MutationObserver(() => {
    void enhanceVisibleArchiveCards();
    void enhanceOpenPhotoDialog();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'src'] });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.person-photo-thumb')) setTimeout(() => void enhanceOpenPhotoDialog(), 0);
  }, true);
  document.addEventListener('genealogy:photo-tags-updated', () => {
    setTimeout(() => void enhanceVisibleArchiveCards(), 0);
  });
}

async function initialise() {
  installStyles();
  const { data: sessionData } = await supabase.auth.getSession();
  session = sessionData.session;
  if (!session) return;
  const [{ data: me }, { data: peopleData }] = await Promise.all([
    supabase.from('app_users').select('role,status').eq('user_id', session.user.id).maybeSingle(),
    supabase.from('people').select('id,given_names,preferred_name,surname,is_active').eq('is_active', true).order('surname').order('given_names'),
  ]);
  canEdit = me?.status === 'approved' && ['editor', 'admin'].includes(me?.role);
  if (!canEdit) return;
  people = peopleData || [];
  peopleById = new Map(people.map((person) => [person.id, person]));
  observeUi();
  await enhanceVisibleArchiveCards();
  await enhanceOpenPhotoDialog();
}

void initialise();
