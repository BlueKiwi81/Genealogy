import { supabase } from './supabase-client-v1.js';

const MAX_FILES = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(['pdf','jpg','jpeg','png','webp','heic','heif','tif','tiff']);
let current = null;

function af() {
  return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af';
}
function t(en, afr) { return af() ? afr : en; }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function extOf(name) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}
function safeName(name) {
  return String(name || 'record').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(-120) || 'record';
}
function sourceClass(type) {
  if (['birth_certificate','civil_register'].includes(type)) return 'official_record';
  if (['baptism_record','marriage_record','church_register'].includes(type)) return 'church_record';
  if (['death_notice','estate_record'].includes(type)) return 'estate_or_probate';
  if (['family_bible','family_document','letter'].includes(type)) return 'family_document';
  if (type === 'researcher_report') return 'researcher_material';
  if (type === 'newspaper_notice') return 'published_or_indexed_source';
  if (type === 'photograph') return 'photograph';
  return 'other';
}
function roleLabel(role) {
  if (role === 'father') return t('father','vader');
  if (role === 'mother') return t('mother','moeder');
  return t('parent','ouer');
}

function ensureStyles() {
  if (document.getElementById('uncertaintyResolutionStyles')) return;
  const style = document.createElement('style');
  style.id = 'uncertaintyResolutionStyles';
  style.textContent = `
    .uncertainty-resolution-overlay{position:fixed;inset:0;z-index:10055;display:grid;place-items:center;padding:18px;background:rgba(38,31,25,.48)}
    .uncertainty-resolution-dialog{width:min(720px,100%);max-height:min(90vh,880px);overflow:auto;background:#fffdf8;border:1px solid #d8cec1;border-radius:18px;box-shadow:0 24px 70px rgba(30,24,19,.24);color:#443a31}
    .uncertainty-resolution-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:20px 22px 14px;border-bottom:1px solid #e2d8cc}.uncertainty-resolution-head h2{margin:0}.uncertainty-resolution-head p{margin:0 0 4px}
    .uncertainty-resolution-body{display:grid;gap:13px;padding:18px 22px 22px}.uncertainty-resolution-context{margin:0;padding:11px 12px;border-radius:10px;background:#f8f1e6;font:.82rem/1.45 Arial,sans-serif;color:#5b5047}
    .uncertainty-resolution-candidate{margin:0;padding:10px 12px;border-left:3px solid #a18a72;background:#f5f1eb;font:.78rem/1.45 Arial,sans-serif;color:#65594e}
    .uncertainty-resolution-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.uncertainty-resolution-body label{display:grid;gap:5px}.uncertainty-resolution-body textarea{min-height:115px}.uncertainty-resolution-body select,.uncertainty-resolution-body input[type=file]{width:100%;box-sizing:border-box}
    .uncertainty-resolution-file-list{font:.76rem/1.4 Arial,sans-serif;color:#6e645b}.uncertainty-resolution-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap}.uncertainty-resolution-status{min-height:1.2em;margin:0;font:.8rem/1.45 Arial,sans-serif;color:#6b6158}.uncertainty-resolution-status.error{color:#8a2828}.uncertainty-resolution-status.success{color:#315f38}
    @media(max-width:620px){.uncertainty-resolution-grid{grid-template-columns:1fr}.uncertainty-resolution-actions .button{width:100%}}
  `;
  document.head.appendChild(style);
}

function close() {
  document.getElementById('uncertaintyResolutionOverlay')?.remove();
  document.body.style.removeProperty('overflow');
  current = null;
}
function status(text, type='') {
  const node = document.getElementById('uncertaintyResolutionStatus');
  if (!node) return;
  node.textContent = text;
  node.className = `uncertainty-resolution-status${type ? ` ${type}` : ''}`;
}
function showFiles() {
  const files = [...(document.getElementById('uncertaintyResolutionFiles')?.files || [])];
  const node = document.getElementById('uncertaintyResolutionFileList');
  if (node) node.innerHTML = files.map((file) => `<div>${esc(file.name)} · ${Math.max(1,Math.round(file.size/1024))} KB</div>`).join('');
}

function open(detail) {
  if (!detail?.personId || !detail?.childId) return;
  close();
  ensureStyles();
  current = detail;
  const overlay = document.createElement('div');
  overlay.id = 'uncertaintyResolutionOverlay';
  overlay.className = 'uncertainty-resolution-overlay';
  const candidate = detail.candidate || null;
  const role = roleLabel(detail.role || 'parent');
  overlay.innerHTML = `<section class="uncertainty-resolution-dialog" role="dialog" aria-modal="true" aria-labelledby="uncertaintyResolutionTitle">
    <header class="uncertainty-resolution-head">
      <div><p class="eyebrow">${t('Help resolve this link','Help om hierdie skakel op te los')}</p><h2 id="uncertaintyResolutionTitle">${esc(detail.personName || '')} → ${esc(detail.childName || '')}</h2></div>
      <button class="button ghost" type="button" data-close-resolution>${t('Close','Sluit')}</button>
    </header>
    <form id="uncertaintyResolutionForm" class="uncertainty-resolution-body">
      <p class="uncertainty-resolution-context">${t(
        `This is currently a provisional ${role} relationship. You can add a name, date, archive reference or other research information, and you can attach a direct parent-naming record or supporting contextual material. Nothing submitted here confirms the relationship automatically.`,
        `Dit is tans 'n voorlopige ${role}-verwantskap. Jy kan 'n naam, datum, argiefverwysing of ander navorsingsinligting byvoeg, en jy kan 'n direkte rekord wat die ouer noem of ondersteunende konteksmateriaal aanheg. Niks wat hier ingedien word, bevestig die verwantskap outomaties nie.`
      )}</p>
      ${candidate ? `<p class="uncertainty-resolution-candidate"><strong>${t('Research lead','Navorsingsleidraad')}:</strong> ${esc(candidate.label || '')}${candidate.year_text ? ` · ${esc(candidate.year_text)}` : ''}${candidate.detail ? `<br>${esc(candidate.detail)}` : ''}</p>` : ''}
      <label>${t('What information or evidence are you adding?','Watter inligting of bewysmateriaal voeg jy by?')}
        <textarea id="uncertaintyResolutionNote" placeholder="${t('For example: this record names his father as ... / this wartime record places the family at ...','Byvoorbeeld: hierdie rekord noem sy vader as ... / hierdie oorlogsrekord plaas die familie by ...')}"></textarea>
      </label>
      <div class="uncertainty-resolution-grid">
        <label>${t('How does this material help?','Hoe help hierdie materiaal?')}
          <select id="uncertaintyResolutionPurpose">
            <option value="direct_parent_record">${t('Direct record naming the parent','Direkte rekord wat die ouer noem')}</option>
            <option value="wartime_context">${t('Wartime / military context','Oorlogs- / militêre konteks')}</option>
            <option value="archive_context">${t('Archive, locality or household clue','Argief-, plek- of huishoudelike leidraad')}</option>
            <option value="family_material">${t('Family-held material or recollection','Familiebesit-materiaal of herinnering')}</option>
            <option value="other">${t('Other research information','Ander navorsingsinligting')}</option>
          </select>
        </label>
        <label>${t('Research strength','Navorsingssterkte')}
          <select id="uncertaintyResolutionStrength">
            <option value="hypothesis">${t('Hypothesis','Hipotese')}</option>
            <option value="probable">${t('Probable','Waarskynlik')}</option>
            <option value="strong">${t('Strong lead','Sterk leidraad')}</option>
            <option value="unresolved">${t('Unresolved','Onopgelos')}</option>
          </select>
        </label>
      </div>
      <label>${t('If you are attaching a record, what kind is it?','As jy ’n rekord aanheg, watter soort rekord is dit?')}
        <select id="uncertaintyResolutionEvidenceType">
          <option value="baptism_record">${t('Baptism / christening record','Dooprekord')}</option>
          <option value="birth_certificate">${t('Birth / civil record','Geboorte- / siviele rekord')}</option>
          <option value="marriage_record">${t('Marriage record','Huweliksrekord')}</option>
          <option value="death_notice">${t('Death notice / death record','Sterfkennisgewing / sterfterekord')}</option>
          <option value="estate_record">${t('Estate / probate record','Boedel- / probate-rekord')}</option>
          <option value="church_register">${t('Church register','Kerkregister')}</option>
          <option value="newspaper_notice">${t('Newspaper / published notice','Koerant- / gepubliseerde kennisgewing')}</option>
          <option value="family_bible">${t('Family Bible','Familiebybel')}</option>
          <option value="family_document">${t('Family document / notes','Familiedokument / notas')}</option>
          <option value="letter">${t('Letter / correspondence','Brief / korrespondensie')}</option>
          <option value="photograph">${t('Photograph','Foto')}</option>
          <option value="researcher_report">${t('Researcher report','Navorserverslag')}</option>
          <option value="other" selected>${t('Other archive or research source','Ander argief- of navorsingsbron')}</option>
        </select>
      </label>
      <label>${t('Attach original record or image','Heg oorspronklike rekord of beeld aan')}<input id="uncertaintyResolutionFiles" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,application/pdf,image/*"></label>
      <div id="uncertaintyResolutionFileList" class="uncertainty-resolution-file-list"></div>
      <label class="check-row"><input id="uncertaintyResolutionLiving" type="checkbox"><span>${t('This source contains private or identifying information about a living person.','Hierdie bron bevat private of identifiserende inligting oor ’n lewende persoon.')}</span></label>
      <label class="check-row"><input id="uncertaintyResolutionPolicy" type="checkbox" required><span>${t('I understand this remains provisional until the evidence is reviewed.','Ek verstaan dat dit voorlopig bly totdat die bewysmateriaal nagegaan is.')}</span></label>
      <p id="uncertaintyResolutionStatus" class="uncertainty-resolution-status" aria-live="polite"></p>
      <div class="uncertainty-resolution-actions"><button class="button ghost" type="button" data-close-resolution>${t('Cancel','Kanselleer')}</button><button id="uncertaintyResolutionSubmit" class="button primary" type="submit">${t('Submit for evidence review','Dien in vir bewyshersiening')}</button></div>
    </form>
  </section>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  overlay.querySelectorAll('[data-close-resolution]').forEach((button) => button.addEventListener('click', close));
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('#uncertaintyResolutionFiles')?.addEventListener('change', showFiles);
  overlay.querySelector('#uncertaintyResolutionForm')?.addEventListener('submit', submit);
  overlay.querySelector('#uncertaintyResolutionNote')?.focus();
}

async function analyzeEvidence(ids, contributionId) {
  let done=0, manual=0, failed=0;
  for (const id of ids) {
    try {
      const { data, error } = await supabase.functions.invoke('evidence-document-review', { body:{ action:'analyze', evidence_id:id, contribution_id:contributionId } });
      if (error || data?.error) throw error || new Error(data.error);
      if (data?.review?.review_status === 'manual_required') manual += 1;
      else done += 1;
    } catch { failed += 1; }
  }
  return { done, manual, failed };
}

async function submit(event) {
  event.preventDefault();
  if (!current) return;
  const note = document.getElementById('uncertaintyResolutionNote')?.value.trim() || '';
  const files = [...(document.getElementById('uncertaintyResolutionFiles')?.files || [])];
  if (!note && !files.length) return status(t('Add some information or attach a source before submitting.','Voeg inligting by of heg ’n bron aan voordat jy indien.'),'error');
  if (!document.getElementById('uncertaintyResolutionPolicy')?.checked) return status(t('Please confirm the evidence-review note first.','Bevestig asseblief eers die bewyshersieningsnota.'),'error');
  if (files.length > MAX_FILES) return status(t(`Please attach no more than ${MAX_FILES} files.`,`Heg asseblief nie meer as ${MAX_FILES} lêers aan nie.`),'error');
  for (const file of files) {
    if (!ALLOWED.has(extOf(file.name))) return status(t(`${file.name} is not a supported PDF or image.`,`${file.name} is nie ’n ondersteunde PDF of beeld nie.`),'error');
    if (file.size > MAX_BYTES) return status(t(`${file.name} is larger than 15 MB.`,`${file.name} is groter as 15 MB.`),'error');
  }
  const button = document.getElementById('uncertaintyResolutionSubmit');
  if (button) { button.disabled = true; button.textContent = t('Saving research...','Stoor navorsing...'); }
  try {
    const { data:{ session } } = await supabase.auth.getSession();
    if (!session) throw new Error(t('Please sign in again before submitting evidence.','Meld asseblief weer aan voordat jy bewysmateriaal indien.'));
    const { data:profile, error:profileError } = await supabase.from('app_users').select('status').eq('user_id',session.user.id).maybeSingle();
    if (profileError || profile?.status !== 'approved') throw new Error(t('Approved family access is required to submit evidence.','Goedgekeurde familietoegang is nodig om bewysmateriaal in te dien.'));

    const purpose = document.getElementById('uncertaintyResolutionPurpose')?.value || 'other';
    const strengthValue = document.getElementById('uncertaintyResolutionStrength')?.value || 'hypothesis';
    const strength = ['strong','probable','hypothesis','unresolved'].includes(strengthValue) ? strengthValue : 'hypothesis';
    const evidenceType = document.getElementById('uncertaintyResolutionEvidenceType')?.value || 'other';
    const living = Boolean(document.getElementById('uncertaintyResolutionLiving')?.checked);
    const evidence = [];
    const relationLabel = `${current.personName || ''} → ${current.childName || ''}`.trim();
    const combinedNote = [current.candidate?.label ? `Research lead: ${current.candidate.label}` : '', note].filter(Boolean).join('\n');

    for (const file of files) {
      const path = `${session.user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error:uploadError } = await supabase.storage.from('family-evidence').upload(path,file,{contentType:file.type||undefined,upsert:false});
      if (uploadError) throw uploadError;
      const { data:item, error:itemError } = await supabase.from('evidence_items').insert({
        submitted_by:session.user.id,
        evidence_type:evidenceType,
        source_class:sourceClass(evidenceType),
        title:`Research for provisional relationship: ${relationLabel}`.slice(0,180),
        storage_path:path,
        original_filename:file.name,
        notes:combinedNote || null,
        contains_living_person_data:living,
        privacy_review_status:living?'restricted':'pending',
        visibility:'restricted',
        review_status:'pending',
      }).select('id,storage_path,original_filename,title,evidence_type,source_class,privacy_review_status').single();
      if (itemError) throw itemError;
      evidence.push(item);
    }

    const payload = {
      submitted_by:session.user.id,
      target_person_id:current.childId,
      contribution_type:'research',
      original_language:document.documentElement.lang || 'en',
      narrative_text:note || t('Source supplied for review.','Bron vir hersiening verskaf.'),
      payload:{
        categories:['research','relationship',...(evidence.length?['source']:[])],
        research_frontier:true,
        frontier_status:strength,
        frontier_title:`Possible ${current.role || 'parent'}: ${relationLabel}`,
        existing_uncertain_relationship_id:current.relationshipId || null,
        proposed_parent_id:current.personId,
        anchor_person_id:current.childId,
        relationship_role:'parent',
        parent_slot:current.role || 'parent',
        material_purpose:purpose,
        research_frontier_candidate_id:current.candidate?.id || null,
        evidence_items:evidence,
        attachment_count:evidence.length,
        contains_living_person_data:living,
      },
    };
    const { data:contribution, error:contributionError } = await supabase.from('contributions').insert(payload).select('id').single();
    if (contributionError) throw contributionError;

    if (evidence.length) {
      status(t('Evidence saved privately. Reading the attached material now...','Bewysmateriaal is privaat gestoor. Die aangehegte materiaal word nou gelees...'));
      const result = await analyzeEvidence(evidence.map((item)=>item.id), contribution.id);
      const parts = [];
      if (result.done) parts.push(t(`${result.done} read`,`${result.done} gelees`));
      if (result.manual) parts.push(t(`${result.manual} flagged for closer review`,`${result.manual} vir nadere hersiening gemerk`));
      if (result.failed) parts.push(t(`${result.failed} available for editor retry`,`${result.failed} beskikbaar vir redakteur-herprobeer`));
      status(t(`Submitted as provisional relationship research. Intelligent review: ${parts.join(', ')}. The relationship has not been confirmed.`,`As voorlopige verwantskapsnavorsing ingedien. Intelligente hersiening: ${parts.join(', ')}. Die verwantskap is nie bevestig nie.`),'success');
    } else {
      status(t('Research information submitted. It remains provisional until an editor reviews it.','Navorsingsinligting is ingedien. Dit bly voorlopig totdat ’n redakteur dit nagegaan het.'),'success');
    }
    document.dispatchEvent(new CustomEvent('genealogy:provenance-updated'));
    document.dispatchEvent(new CustomEvent('genealogy:research-frontier-changed'));
    window.setTimeout(close,2400);
  } catch (error) {
    status(error?.message || t('The research could not be submitted.','Die navorsing kon nie ingedien word nie.'),'error');
  } finally {
    if (button && button.isConnected) { button.disabled = false; button.textContent = t('Submit for evidence review','Dien in vir bewyshersiening'); }
  }
}

document.addEventListener('genealogy:resolve-uncertainty', (event) => open(event.detail));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.getElementById('uncertaintyResolutionOverlay')) close(); });
