import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const personName = document.getElementById('personName');
const photosHost = document.getElementById('personPhotos');

let people = [];
let peopleByName = new Map();
let currentPerson = null;
let session = null;
let canEdit = false;
let loadToken = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ');
}

function safeExt(file) {
  const fromName = (file?.name || '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName && fromName.length <= 6) return fromName;
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' };
  return map[file?.type] || 'img';
}

function ensureDialog() {
  let dialog = document.getElementById('personPhotoDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'personPhotoDialog';
  dialog.className = 'photo-dialog';
  dialog.innerHTML = `
    <button class="photo-dialog-close" type="button" aria-label="Close photograph">×</button>
    <img class="photo-dialog-image" alt="" />
    <div class="photo-dialog-copy"></div>`;
  dialog.querySelector('.photo-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.appendChild(dialog);
  return dialog;
}

function openPhoto(photo, signedUrl) {
  const dialog = ensureDialog();
  const img = dialog.querySelector('.photo-dialog-image');
  const copy = dialog.querySelector('.photo-dialog-copy');
  img.src = signedUrl;
  img.alt = photo.caption || `Family photograph of ${canonicalName(currentPerson)}`;
  const meta = [photo.date_text, photo.place].filter(Boolean).join(' · ');
  copy.innerHTML = `${photo.caption ? `<strong>${esc(photo.caption)}</strong>` : ''}${meta ? `<span>${esc(meta)}</span>` : ''}`;
  dialog.showModal();
}

async function signedUrlFor(path) {
  const { data, error } = await supabase.storage.from('person-photos').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

function uploadFormHtml() {
  return `
    <form id="personPhotoUploadForm" class="photo-upload-form hidden">
      <label>Photo<input id="personPhotoFile" type="file" accept="image/*" required /></label>
      <label>Caption<input id="personPhotoCaption" type="text" maxlength="240" placeholder="Optional short caption" /></label>
      <div class="photo-form-row">
        <label>Approximate date<input id="personPhotoDate" type="text" maxlength="80" placeholder="e.g. c. 1955" /></label>
        <label>Place<input id="personPhotoPlace" type="text" maxlength="160" placeholder="Optional" /></label>
      </div>
      <label>Source status<select id="personPhotoStatus"><option value="family_supplied" selected>Family supplied</option><option value="documented">Documented</option><option value="strong">Strong</option><option value="probable">Probable</option><option value="hypothesis">Hypothesis</option><option value="unresolved">Unresolved</option></select></label>
      <div class="photo-form-actions"><button class="button primary" type="submit">Upload photo</button><button id="cancelPhotoUpload" class="button ghost" type="button">Cancel</button></div>
      <p id="personPhotoUploadMessage" class="message" aria-live="polite"></p>
    </form>`;
}

async function renderPhotos(person) {
  if (!photosHost || !person) return;
  const token = ++loadToken;
  photosHost.innerHTML = '<div class="photo-loading">Loading photographs…</div>';

  const { data: photos, error } = await supabase
    .from('person_photos')
    .select('id,person_id,storage_path,caption,date_text,place,source_status,is_primary,created_at')
    .eq('person_id', person.id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (token !== loadToken) return;
  if (error) {
    photosHost.innerHTML = canEdit ? `<div class="photo-empty">Photographs could not be loaded.</div>${uploadFormHtml()}` : '';
    bindUploadControls(person);
    return;
  }

  const items = [];
  for (const photo of photos || []) {
    try {
      items.push({ photo, url: await signedUrlFor(photo.storage_path) });
    } catch (_) {
      // Keep one inaccessible file from hiding the rest of the gallery.
    }
  }

  if (token !== loadToken) return;
  if (!items.length && !canEdit) {
    photosHost.replaceChildren();
    return;
  }

  const gallery = items.length ? `
    <div class="person-photo-grid">
      ${items.map(({ photo, url }, index) => `
        <button class="person-photo-thumb" type="button" data-photo-index="${index}" aria-label="Open photograph${photo.caption ? `: ${esc(photo.caption)}` : ''}">
          <img src="${esc(url)}" alt="${esc(photo.caption || `Family photograph of ${canonicalName(person)}`)}" loading="lazy" />
        </button>`).join('')}
    </div>` : '<p class="photo-empty">No photographs have been attached yet.</p>';

  photosHost.innerHTML = `
    <section class="person-photo-section">
      <div class="person-photo-heading"><div><p class="eyebrow">Family archive</p><h3>Photographs</h3></div>${canEdit ? '<button id="addPersonPhoto" class="button ghost photo-add-button" type="button">Add photo</button>' : ''}</div>
      ${gallery}
      ${canEdit ? uploadFormHtml() : ''}
    </section>`;

  photosHost.querySelectorAll('.person-photo-thumb').forEach((button) => {
    button.addEventListener('click', () => {
      const item = items[Number(button.dataset.photoIndex)];
      if (item) openPhoto(item.photo, item.url);
    });
  });
  bindUploadControls(person);
}

function bindUploadControls(person) {
  if (!photosHost || !canEdit) return;
  const add = photosHost.querySelector('#addPersonPhoto');
  const form = photosHost.querySelector('#personPhotoUploadForm');
  const cancel = photosHost.querySelector('#cancelPhotoUpload');
  if (add && form) add.addEventListener('click', () => form.classList.toggle('hidden'));
  if (cancel && form) cancel.addEventListener('click', () => { form.reset(); form.classList.add('hidden'); });
  if (form) form.addEventListener('submit', (event) => uploadPhoto(event, person));
}

async function uploadPhoto(event, person) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = form.querySelector('#personPhotoUploadMessage');
  const file = form.querySelector('#personPhotoFile')?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    message.textContent = 'Please choose an image file.';
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    message.textContent = 'Please use an image smaller than 20 MB.';
    return;
  }

  const caption = form.querySelector('#personPhotoCaption').value.trim();
  const dateText = form.querySelector('#personPhotoDate').value.trim();
  const place = form.querySelector('#personPhotoPlace').value.trim();
  const sourceStatus = form.querySelector('#personPhotoStatus').value;
  const folder = person.slug || person.id;
  const path = `${folder}/${crypto.randomUUID()}.${safeExt(file)}`;

  message.textContent = 'Uploading…';
  const { error: uploadError } = await supabase.storage.from('person-photos').upload(path, file, {
    cacheControl: '3600', contentType: file.type || undefined, upsert: false,
  });
  if (uploadError) {
    message.textContent = `Upload failed: ${uploadError.message}`;
    return;
  }

  const { error: rowError } = await supabase.from('person_photos').insert({
    person_id: person.id,
    storage_path: path,
    caption: caption || null,
    date_text: dateText || null,
    place: place || null,
    source_status: sourceStatus,
    uploaded_by: session?.user?.id || null,
  });

  if (rowError) {
    await supabase.storage.from('person-photos').remove([path]);
    message.textContent = `The image uploaded but could not be linked: ${rowError.message}`;
    return;
  }

  form.reset();
  await renderPhotos(person);
}

async function selectCurrentPerson() {
  if (!personName || !photosHost || !people.length) return;
  const name = personName.textContent.trim();
  if (!name || name === 'Choose a person') {
    photosHost.replaceChildren();
    currentPerson = null;
    return;
  }
  const person = peopleByName.get(name);
  if (!person || currentPerson?.id === person.id) return;
  currentPerson = person;
  await renderPhotos(person);
}

async function initialise() {
  const { data: sessionData } = await supabase.auth.getSession();
  session = sessionData.session;
  if (!session) return;

  const [{ data: peopleData }, { data: me }] = await Promise.all([
    supabase.from('people').select('id,slug,given_names,surname'),
    supabase.from('app_users').select('role,status').eq('user_id', session.user.id).maybeSingle(),
  ]);
  people = peopleData || [];
  peopleByName = new Map(people.map((person) => [canonicalName(person), person]));
  canEdit = me?.status === 'approved' && ['editor', 'admin'].includes(me?.role);
  await selectCurrentPerson();

  if (personName) {
    new MutationObserver(() => { void selectCurrentPerson(); }).observe(personName, { childList: true, characterData: true, subtree: true });
  }
}

void initialise();
