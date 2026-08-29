import { supabase } from './supabase-client-v1.js';

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function sourceClassFor(evidenceType) {
  if (['birth_certificate', 'identity_document', 'civil_register'].includes(evidenceType)) return 'official_record';
  if (['baptism_record', 'marriage_record', 'church_register'].includes(evidenceType)) return 'church_record';
  if (['death_notice', 'estate_record'].includes(evidenceType)) return 'estate_or_probate';
  if (evidenceType === 'grave_record') return 'cemetery_or_grave';
  if (['family_bible', 'family_document', 'letter'].includes(evidenceType)) return 'family_document';
  if (evidenceType === 'photograph') return 'photograph';
  if (evidenceType === 'newspaper_notice') return 'published_or_indexed_source';
  if (evidenceType === 'researcher_report') return 'researcher_material';
  return 'other';
}

function canonicalName(person) {
  return [person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ');
}

function displayName(person) {
  return [person?.preferred_name?.trim() || person?.given_names?.trim(), person?.surname?.trim()].filter(Boolean).join(' ');
}

function selectedPersonName() {
  const value = personName?.textContent?.trim() || '';
  return value && value !== 'Choose a person' ? value : '';
}

async function selectedPersonId() {
  const displayed = selectedPersonName();
  if (displayed) {
    const { data, error } = await supabase.from('people').select('id, given_names, preferred_name, surname');
    if (!error) {
      const matches = (data || []).filter((person) => canonicalName(person) === displayed || displayName(person) === displayed);
      if (matches.length === 1) return matches[0].id;
    }
  }
  return centreSelect?.value || null;
}

function updateTargetGuide() {
  const target = selectedPersonName();
  const targetBox = document.getElementById('contributionTarget');
  if (!targetBox) return;
  if (target) {
    targetBox.innerHTML = `<strong>Linked to:</strong> ${escapeHtml(target)}<span>Anything you submit now will be attached to this person's record.</span>`;
    targetBox.classList.remove('needs-selection');
  } else {
    targetBox.innerHTML = '<strong>No person selected.</strong><span>Click the person or fan cell that your information belongs to before submitting.</span>';
    targetBox.classList.add('needs-selection');
  }
}

function installContributionGuide() {
  if (!form || document.getElementById('contributionGuide')) return;
  const guide = document.createElement('div');
  guide.id = 'contributionGuide';
  guide.className = 'contribution-guide';
  guide.innerHTML = `
    <strong>Before you submit</strong>
    <p>First click the person or fan cell that the information belongs to. Then check the name below. Your comment, correction, story or uploaded record will be linked to that person's family record.</p>
    <div id="contributionTarget" class="contribution-target"></div>`;
  form.insertBefore(guide, form.firstChild);

  const style = document.createElement('style');
  style.textContent = `
    .contribution-guide{padding:12px 13px;border:1px solid #d8c6af;border-radius:12px;background:#fbf4e9;font:.84rem/1.45 Arial,sans-serif;color:#51483f}
    .contribution-guide>strong{display:block;margin-bottom:4px;color:#3e3329;font-size:.8rem;letter-spacing:.025em}
    .contribution-guide p{margin:0 0 9px;line-height:1.45}
    .contribution-target{padding:8px 10px;border-radius:9px;background:#eef4e9;border:1px solid #c8d8bd}
    .contribution-target strong{display:inline;color:#315f38}
    .contribution-target span{display:block;margin-top:2px;font-size:.77rem;color:#655c53}
    .contribution-target.needs-selection{background:#fff1e8;border-color:#e4c2a7}
    .contribution-target.needs-selection strong{color:#8a4b28}
    .source-upload-area{padding:12px;border:1px solid rgba(96,82,67,.24);border-radius:12px;background:rgba(250,247,242,.8)}
    .source-upload-area.hidden{display:none}
    .source-upload-area input[type=file],.source-upload-area select{width:100%;box-sizing:border-box;padding:10px;background:#fff;border:1px solid rgba(96,82,67,.28);border-radius:9px}
    .source-upload-help{margin:7px 0 0;font-size:.82rem;line-height:1.4;color:#6d6358}
    .source-file-list{margin-top:7px;font-size:.82rem;color:#51483f}
    .source-file-list div{margin-top:3px}
    .source-privacy-box{display:grid;gap:8px;margin-top:10px;padding:10px;border-radius:10px;background:#f5f1ea;border:1px solid rgba(96,82,67,.16)}
    .source-privacy-box .check-row{align-items:flex-start;font-size:.8rem;line-height:1.4}
  `;
  document.head.appendChild(style);

  updateTargetGuide();
  if (personName) {
    const observer = new MutationObserver(updateTargetGuide);
    observer.observe(personName, { childList: true, subtree: true, characterData: true });
  }
  centreSelect?.addEventListener('change', () => setTimeout(updateTargetGuide, 50));
}

function installUploadUi() {
  if (!form || !typeSelect || document.getElementById('sourceUploadArea')) return;

  const sourceOption = [...typeSelect.options].find((option) => option.value === 'source');
  if (sourceOption) sourceOption.textContent = 'Document, photo or source';

  const area = document.createElement('div');
  area.id = 'sourceUploadArea';
  area.className = 'source-upload-area hidden';
  area.innerHTML = `
    <label for="sourceEvidenceType">What kind of record is this?</label>
    <select id="sourceEvidenceType">
      <option value="birth_certificate">Birth certificate or civil birth record</option>
      <option value="baptism_record">Baptism or christening record</option>
      <option value="marriage_record">Marriage record</option>
      <option value="death_notice">Death notice or death record</option>
      <option value="estate_record">Estate or probate record</option>
      <option value="identity_document">Identity document</option>
      <option value="church_register">Church register or membership record</option>
      <option value="civil_register">Civil register</option>
      <option value="family_bible">Family Bible</option>
      <option value="family_document">Family booklet, handwritten notes or other family document</option>
      <option value="grave_record">Grave or cemetery record</option>
      <option value="newspaper_notice">Newspaper notice</option>
      <option value="photograph">Photograph</option>
      <option value="letter">Letter or correspondence</option>
      <option value="researcher_report">Researcher report</option>
      <option value="other" selected>Other record or source</option>
    </select>
    <label for="sourceFiles">Attach record</label>
    <input id="sourceFiles" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,application/pdf,image/*" />
    <p class="source-upload-help">Attach up to ${MAX_FILES} PDF or image files, maximum 15 MB each. If possible, keep the full page, source heading, page number or archive reference visible so the record can be found again.</p>
    <div id="sourceFileList" class="source-file-list"></div>
    <div class="source-privacy-box">
      <label class="check-row"><input id="sourceContainsLivingData" type="checkbox" /> <span>This source contains private or identifying information about a living person.</span></label>
      <label class="check-row"><input id="sourcePolicyAcknowledge" type="checkbox" /> <span>I understand that the original will be stored privately and remain pending until it is reviewed. Uploading a document does not automatically make every claim in it documented.</span></label>
      <p class="source-upload-help">New source files begin restricted. If a record contains living-person information, we can retain the original without exposing those private details in the ordinary family profile.</p>
    </div>`;

  typeSelect.insertAdjacentElement('afterend', area);

  const fileInput = document.getElementById('sourceFiles');
  const fileList = document.getElementById('sourceFileList');

  function syncVisibility() {
    const isSource = typeSelect.value === 'source';
    area.classList.toggle('hidden', !isSource);
    if (textArea) {
      textArea.placeholder = isSource
        ? 'Describe the record, where it came from and what you believe it shows. Include a URL, film number, archive reference or congregation/cemetery where relevant.'
        : 'Write in whichever language is most natural to you.';
    }
  }

  function showFiles() {
    const files = [...(fileInput.files || [])];
    fileList.innerHTML = files.map((file) => `<div>${escapeHtml(file.name)} (${Math.max(1, Math.round(file.size / 1024))} KB)</div>`).join('');
  }

  typeSelect.addEventListener('change', syncVisibility);
  fileInput.addEventListener('change', showFiles);
  syncVisibility();
}

async function approvedSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again before submitting information.');
  const { data: profile, error } = await supabase
    .from('app_users')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error || profile?.status !== 'approved') throw new Error('Your family access must be approved before you can submit information.');
  return session;
}

function resetContributionForm() {
  form.reset();
  if (language) language.value = 'en';
  typeSelect.value = 'story';
  document.getElementById('sourceUploadArea')?.classList.add('hidden');
  const list = document.getElementById('sourceFileList');
  if (list) list.innerHTML = '';
  if (textArea) textArea.placeholder = 'Write in whichever language is most natural to you.';
  updateTargetGuide();
  typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

async function submitStandardContribution(session, targetPersonId, targetName, description) {
  const payload = {
    submitted_by: session.user.id,
    target_person_id: targetPersonId,
    contribution_type: typeSelect.value,
    original_language: language?.value.trim() || 'en',
    narrative_text: description,
    payload: {
      attached_to_name: targetName,
      selected_record_linkage: true,
    },
  };
  const { error } = await supabase.from('contributions').insert(payload);
  if (error) throw error;
  resetContributionForm();
  setMessage(`Submitted for review and linked to ${targetName}.`, 'success');
}

async function submitSourceContribution(session, targetPersonId, targetName, description) {
  const fileInput = document.getElementById('sourceFiles');
  const evidenceType = document.getElementById('sourceEvidenceType')?.value || 'other';
  const containsLivingData = document.getElementById('sourceContainsLivingData')?.checked ?? false;
  const policyAccepted = document.getElementById('sourcePolicyAcknowledge')?.checked ?? false;
  const files = [...(fileInput?.files || [])];

  if (!policyAccepted) throw new Error('Please confirm the source-review and privacy note before uploading.');
  if (!files.length) throw new Error('Please attach at least one record or image.');
  if (files.length > MAX_FILES) throw new Error(`Please attach no more than ${MAX_FILES} files in one submission.`);
  for (const file of files) {
    const ext = extensionOf(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`${file.name} is not a supported PDF or image file.`);
    if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 15 MB.`);
  }

  setMessage(`Uploading ${files.length === 1 ? 'record' : `${files.length} records`} for ${targetName}...`);
  const evidenceItems = [];
  for (const file of files) {
    const objectPath = `${session.user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from('family-evidence')
      .upload(objectPath, file, { contentType: file.type || undefined, upsert: false });
    if (uploadError) throw uploadError;

    const evidencePayload = {
      submitted_by: session.user.id,
      evidence_type: evidenceType,
      source_class: sourceClassFor(evidenceType),
      title: titleFrom(description, file.name),
      storage_path: objectPath,
      original_filename: file.name,
      notes: description,
      contains_living_person_data: containsLivingData,
      privacy_review_status: containsLivingData ? 'restricted' : 'pending',
      visibility: 'restricted',
      review_status: 'pending',
    };
    const { data: evidence, error: evidenceError } = await supabase
      .from('evidence_items')
      .insert(evidencePayload)
      .select('id, storage_path, original_filename, title, evidence_type, source_class, privacy_review_status')
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
        evidence_type: item.evidence_type,
        source_class: item.source_class,
        privacy_review_status: item.privacy_review_status,
      })),
      attachment_count: evidenceItems.length,
      contains_living_person_data: containsLivingData,
      attached_to_name: targetName,
      selected_record_linkage: true,
    },
  };

  const { error: contributionError } = await supabase.from('contributions').insert(payload);
  if (contributionError) throw contributionError;

  resetContributionForm();
  setMessage(`Record submitted for review and linked to ${targetName}. The original file is stored privately and remains restricted while it is reviewed.`, 'success');
}

async function handleContribution(event) {
  if (!form || !typeSelect) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const description = textArea?.value.trim() || '';
  const targetName = selectedPersonName();
  if (!targetName) {
    setMessage('First click the person or fan cell that this information belongs to.', 'error');
    return;
  }
  if (!description) {
    setMessage('Please enter the information you want to submit.', 'error');
    return;
  }

  try {
    const session = await approvedSession();
    const targetPersonId = await selectedPersonId();
    if (!targetPersonId) throw new Error('I could not identify the selected family record. Click the person in the fan again and retry.');

    if (typeSelect.value === 'source') {
      await submitSourceContribution(session, targetPersonId, targetName, description);
    } else {
      await submitStandardContribution(session, targetPersonId, targetName, description);
    }
  } catch (error) {
    setMessage(error?.message || 'The submission could not be saved. Please try again.', 'error');
  }
}

if (form && typeSelect) {
  installContributionGuide();
  installUploadUi();
  form.addEventListener('submit', handleContribution, true);
}
