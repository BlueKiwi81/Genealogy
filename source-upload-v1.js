import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const form = document.getElementById('contributionForm');
const typeSelect = document.getElementById('contributionType');
const textArea = document.getElementById('contributionText');
const language = document.getElementById('language');
const message = document.getElementById('contributionMessage');
const centreSelect = document.getElementById('centreSelect');
const personName = document.getElementById('personName');

const MAX_FILES = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff']);

function setMessage(text, type = '') {
  if (!message) return;
  message.textContent = text;
  message.className = `message${type ? ` ${type}` : ''}`;
}

function safeName(name) {
  return String(name || 'record')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(-120) || 'record';
}

function extensionOf(name) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function titleFrom(description, filename) {
  const firstLine = String(description || '').split(/\r?\n/).map((v) => v.trim()).find(Boolean) || '';
  return (firstLine || filename || 'Family source').slice(0, 180);
}

function selectedPersonId() {
  const selected = centreSelect?.value || null;
  return selected;
}

function installUploadUi() {
  if (!form || !typeSelect || document.getElementById('sourceUploadArea')) return;

  const sourceOption = [...typeSelect.options].find((option) => option.value === 'source');
  if (sourceOption) sourceOption.textContent = 'Document, photo or source';

  const area = document.createElement('div');
  area.id = 'sourceUploadArea';
  area.className = 'source-upload-area hidden';
  area.innerHTML = `
    <label for="sourceFiles">Attach record</label>
    <input id="sourceFiles" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,application/pdf,image/*" />
    <p class="source-upload-help">Attach up to ${MAX_FILES} PDF or image files, maximum 15 MB each. Originals are preserved unchanged and reviewed before they become evidence in the family archive.</p>
    <div id="sourceFileList" class="source-file-list"></div>`;

  typeSelect.insertAdjacentElement('afterend', area);

  const style = document.createElement('style');
  style.textContent = `
    .source-upload-area{padding:12px;border:1px solid rgba(96,82,67,.24);border-radius:12px;background:rgba(250,247,242,.8)}
    .source-upload-area.hidden{display:none}
    .source-upload-area input[type=file]{width:100%;box-sizing:border-box;padding:10px;background:#fff;border:1px solid rgba(96,82,67,.28);border-radius:9px}
    .source-upload-help{margin:7px 0 0;font-size:.82rem;line-height:1.4;color:#6d6358}
    .source-file-list{margin-top:7px;font-size:.82rem;color:#51483f}
    .source-file-list div{margin-top:3px}
  `;
  document.head.appendChild(style);

  const fileInput = document.getElementById('sourceFiles');
  const fileList = document.getElementById('sourceFileList');

  function syncVisibility() {
    const isSource = typeSelect.value === 'source';
    area.classList.toggle('hidden', !isSource);
    if (textArea) {
      textArea.placeholder = isSource
        ? 'Describe the record and what you believe it shows. For example: Marriage invitation for Nick Liebenberg and Sarie Wessels.'
        : 'Write in whichever language is most natural to you.';
    }
  }

  function showFiles() {
    const files = [...(fileInput.files || [])];
    fileList.innerHTML = files.map((file) => `<div>${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)</div>`).join('');
  }

  typeSelect.addEventListener('change', syncVisibility);
  fileInput.addEventListener('change', showFiles);
  syncVisibility();
}

async function uploadSourceContribution(event) {
  if (!form || !typeSelect || typeSelect.value !== 'source') return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const fileInput = document.getElementById('sourceFiles');
  const files = [...(fileInput?.files || [])];
  const description = textArea?.value.trim() || '';

  if (!description) {
    setMessage('Please describe the record and what it relates to.', 'error');
    return;
  }
  if (!files.length) {
    setMessage('Please attach at least one record or image.', 'error');
    return;
  }
  if (files.length > MAX_FILES) {
    setMessage(`Please attach no more than ${MAX_FILES} files in one submission.`, 'error');
    return;
  }
  for (const file of files) {
    const ext = extensionOf(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setMessage(`${file.name} is not a supported PDF or image file.`, 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage(`${file.name} is larger than 15 MB.`, 'error');
      return;
    }
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    setMessage('Please sign in again before uploading a record.', 'error');
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from('app_users')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== 'approved') {
    setMessage('Your family access must be approved before you can upload records.', 'error');
    return;
  }

  const targetPersonId = selectedPersonId();
  setMessage(`Uploading ${files.length === 1 ? 'record' : `${files.length} records`}...`);

  try {
    const evidenceItems = [];
    for (const file of files) {
      const objectPath = `${session.user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from('family-evidence')
        .upload(objectPath, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) throw uploadError;

      const evidencePayload = {
        submitted_by: session.user.id,
        evidence_type: 'other',
        title: titleFrom(description, file.name),
        storage_path: objectPath,
        original_filename: file.name,
        notes: description,
        visibility: 'restricted',
        review_status: 'pending',
      };
      const { data: evidence, error: evidenceError } = await supabase
        .from('evidence_items')
        .insert(evidencePayload)
        .select('id, storage_path, original_filename, title')
        .single();
      if (evidenceError) throw evidenceError;
      evidenceItems.push(evidence);
    }

    const payload = {
      submitted_by: session.user.id,
      target_person_id: targetPersonId,
      contribution_type: 'source',
      original_language: language?.value.trim() || 'en',
      narrative_text: description,
      payload: {
        evidence_items: evidenceItems.map((item) => ({
          id: item.id,
          storage_path: item.storage_path,
          original_filename: item.original_filename,
          title: item.title,
        })),
        attachment_count: evidenceItems.length,
        attached_to_name: personName?.textContent?.trim() || null,
      },
    };

    const { error: contributionError } = await supabase.from('contributions').insert(payload);
    if (contributionError) throw contributionError;

    form.reset();
    if (language) language.value = 'en';
    typeSelect.value = 'story';
    document.getElementById('sourceUploadArea')?.classList.add('hidden');
    document.getElementById('sourceFileList').innerHTML = '';
    if (textArea) textArea.placeholder = 'Write in whichever language is most natural to you.';
    setMessage('Record submitted for review. The original file has been preserved securely.', 'success');
  } catch (error) {
    setMessage(error?.message || 'The record could not be uploaded. Please try again.', 'error');
  }
}

if (form && typeSelect) {
  installUploadUi();
  form.addEventListener('submit', uploadSourceContribution, true);
}
