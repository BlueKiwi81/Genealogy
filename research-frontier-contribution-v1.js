import { supabase } from './supabase-client-v1.js';

const form = document.getElementById('contributionForm');
const message = document.getElementById('contributionMessage');
const textArea = document.getElementById('contributionText');
const centreSelect = document.getElementById('centreSelect');
const personName = document.getElementById('personName');
const MAX_FILES = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf','jpg','jpeg','png','webp','heic','heif','tif','tiff']);
let currentTargetId = centreSelect?.value || null;

function af() { return (window.GenealogyI18n?.language || document.documentElement.lang || 'en') === 'af'; }
function t(en, afr) { return af() ? afr : en; }
function setMessage(text='', type='') { if (!message) return; message.textContent=text; message.className=`message${type?` ${type}`:''}`; }
function extensionOf(name) { const parts=String(name||'').toLowerCase().split('.'); return parts.length>1?parts.pop():''; }
function safeName(name) { return String(name||'record').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(-120)||'record'; }
function titleFrom(description, filename) { return (String(description||'').split(/\r?\n/).map(v=>v.trim()).find(Boolean)||filename||'Family research source').slice(0,180); }
function selectedPersonName() { const value=personName?.textContent?.trim()||''; return value && value !== 'Choose a person' ? value : ''; }
function sourceClassFor(evidenceType) {
  if (['birth_certificate','identity_document','civil_register'].includes(evidenceType)) return 'official_record';
  if (['baptism_record','marriage_record','church_register'].includes(evidenceType)) return 'church_record';
  if (['death_notice','estate_record'].includes(evidenceType)) return 'estate_or_probate';
  if (evidenceType === 'grave_record') return 'cemetery_or_grave';
  if (['family_bible','family_document','letter'].includes(evidenceType)) return 'family_document';
  if (evidenceType === 'photograph') return 'photograph';
  if (evidenceType === 'newspaper_notice') return 'published_or_indexed_source';
  if (evidenceType === 'researcher_report') return 'researcher_material';
  return 'other';
}

function installStyles() {
  if (document.getElementById('researchFrontierContributionV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'researchFrontierContributionV1Styles';
  style.textContent = `
    .research-frontier-controls{grid-column:1/-1;margin:2px 0 0;padding:13px 14px;border:1px solid #d7c399;border-radius:12px;background:#fff8e9}
    .research-frontier-controls.hidden{display:none!important}.research-frontier-controls>strong{display:block;margin-bottom:4px;font:700 .84rem/1.3 Arial,sans-serif;color:#5a4938}.research-frontier-controls>p{margin:0 0 10px;color:#6d5f51;font:.8rem/1.45 Arial,sans-serif}
    .research-frontier-strength{margin:0;padding:0;border:0}.research-frontier-strength legend{margin:0 0 7px;font:700 .72rem/1.3 Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#74675c}.research-frontier-strength-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.research-frontier-strength-grid label{position:relative}.research-frontier-strength-grid input{position:absolute;opacity:0;pointer-events:none}.research-frontier-strength-grid span{display:grid;gap:2px;min-height:58px;padding:9px;border:1px solid #d8ccbc;border-radius:10px;background:#fff;cursor:pointer}.research-frontier-strength-grid span strong{font:700 .76rem/1.25 Arial,sans-serif}.research-frontier-strength-grid span small{font:.68rem/1.3 Arial,sans-serif;color:#796d62}.research-frontier-strength-grid input:checked+span{border-color:#826746;background:#f2e4ce;box-shadow:inset 0 0 0 1px #826746}
    @media(max-width:760px){.research-frontier-strength-grid{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(style);
}

function controlsHtml() {
  return `
    <strong>${t('Keep this on the research frontier','Hou dit op die navorsingsfront')}</strong>
    <p>${t('Use this when the evidence points in a direction but does not yet prove the person, date or relationship. It will remain explicitly provisional even after editor review.','Gebruik dit wanneer die bewyse in ’n rigting wys maar die persoon, datum of verwantskap nog nie bewys nie. Dit bly uitdruklik voorlopig, selfs ná redakteursoorsig.')}</p>
    <fieldset class="research-frontier-strength">
      <legend>${t('How strong is the lead?','Hoe sterk is die leidraad?')}</legend>
      <div class="research-frontier-strength-grid">
        <label><input type="radio" name="researchFrontierStatus" value="strong"><span><strong>${t('Strong lead','Sterk leidraad')}</strong><small>${t('Several pieces point the same way; still not proved.','Verskeie stukke wys dieselfde rigting; nog nie bewys nie.')}</small></span></label>
        <label><input type="radio" name="researchFrontierStatus" value="probable"><span><strong>${t('Probable','Waarskynlik')}</strong><small>${t('More likely than not; direct evidence still needed.','Meer waarskynlik as nie; direkte bewyse nog nodig.')}</small></span></label>
        <label><input type="radio" name="researchFrontierStatus" value="hypothesis" checked><span><strong>${t('Hypothesis','Hipotese')}</strong><small>${t('A plausible working theory to test.','’n Aanvaarbare werksteorie om te toets.')}</small></span></label>
        <label><input type="radio" name="researchFrontierStatus" value="unresolved"><span><strong>${t('Unresolved','Onopgelos')}</strong><small>${t('Worth preserving, but its meaning is still unclear.','Die moeite werd om te behou, maar die betekenis is nog onseker.')}</small></span></label>
      </div>
    </fieldset>`;
}

function installUi() {
  installStyles();
  const grid = document.querySelector('#contributionCategoryPicker .contribution-category-grid');
  const picker = document.getElementById('contributionCategoryPicker');
  if (!grid || !picker) return false;
  if (!document.getElementById('frontierResearchChip')) {
    const label = document.createElement('label');
    label.className = 'contribution-category-chip';
    label.id = 'frontierResearchChip';
    label.innerHTML = `<input id="researchFrontierCategory" type="checkbox" name="contributionCategory" value="research"><span>${t('Research frontier / hypothesis','Navorsingsfront / hipotese')}</span>`;
    grid.appendChild(label);
  }
  if (!document.getElementById('researchFrontierControls')) {
    const controls = document.createElement('section');
    controls.id = 'researchFrontierControls';
    controls.className = 'research-frontier-controls hidden';
    controls.innerHTML = controlsHtml();
    picker.insertAdjacentElement('afterend', controls);
  }
  const checkbox = document.getElementById('researchFrontierCategory');
  if (checkbox && checkbox.dataset.bound !== '1') {
    checkbox.dataset.bound = '1';
    checkbox.addEventListener('change', () => document.getElementById('researchFrontierControls')?.classList.toggle('hidden', !checkbox.checked));
  }
  return true;
}

async function approvedSession() {
  const { data:{session} } = await supabase.auth.getSession();
  if (!session) throw new Error(t('Please sign in again before submitting research.','Meld asseblief weer aan voordat jy navorsing indien.'));
  const { data:profile, error } = await supabase.from('app_users').select('status').eq('user_id',session.user.id).maybeSingle();
  if (error || profile?.status !== 'approved') throw new Error(t('Your family access must be approved before you can submit research.','Jou familietoegang moet goedgekeur wees voordat jy navorsing kan indien.'));
  return session;
}

async function targetPersonId() {
  if (currentTargetId) return currentTargetId;
  const displayed = selectedPersonName();
  if (displayed) {
    const { data, error } = await supabase.from('people').select('id,given_names,preferred_name,surname');
    if (!error) {
      const normalize = (v) => String(v||'').trim();
      const matches = (data||[]).filter((p) => {
        const formal = [normalize(p.given_names),normalize(p.surname)].filter(Boolean).join(' ');
        const preferred = [normalize(p.preferred_name)||normalize(p.given_names),normalize(p.surname)].filter(Boolean).join(' ');
        return formal === displayed || preferred === displayed;
      });
      if (matches.length === 1) return matches[0].id;
    }
  }
  return centreSelect?.value || null;
}

async function uploadEvidence(session, description) {
  const files = [...(document.getElementById('sourceFiles')?.files || [])];
  const evidenceType = document.getElementById('sourceEvidenceType')?.value || 'other';
  const containsLivingData = document.getElementById('sourceContainsLivingData')?.checked ?? false;
  const policyAccepted = document.getElementById('sourcePolicyAcknowledge')?.checked ?? false;
  if (!policyAccepted) throw new Error(t('Please confirm the source-review and privacy note before uploading.','Bevestig asseblief die bronhersiening- en privaatheidsnota voordat jy oplaai.'));
  if (!files.length) throw new Error(t('Please attach at least one record or image.','Heg asseblief ten minste een rekord of beeld aan.'));
  if (files.length > MAX_FILES) throw new Error(t(`Please attach no more than ${MAX_FILES} files in one submission.`,`Heg asseblief hoogstens ${MAX_FILES} lêers in een indiening aan.`));
  for (const file of files) {
    const ext = extensionOf(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`${file.name}: ${t('unsupported file type','nie ’n ondersteunde lêertipe nie')}`);
    if (file.size > MAX_BYTES) throw new Error(`${file.name}: ${t('larger than 15 MB','groter as 15 MB')}`);
  }
  const evidence = [];
  for (const file of files) {
    const path = `${session.user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error:uploadError } = await supabase.storage.from('family-evidence').upload(path,file,{contentType:file.type||undefined,upsert:false});
    if (uploadError) throw uploadError;
    const { data:item, error } = await supabase.from('evidence_items').insert({
      submitted_by:session.user.id,
      evidence_type:evidenceType,
      source_class:sourceClassFor(evidenceType),
      title:titleFrom(description,file.name),
      storage_path:path,
      original_filename:file.name,
      notes:description,
      contains_living_person_data:containsLivingData,
      privacy_review_status:containsLivingData ? 'restricted' : 'pending',
      visibility:'restricted',
      review_status:'pending'
    }).select('id,storage_path,original_filename,title,evidence_type,source_class,privacy_review_status').single();
    if (error) throw error;
    evidence.push(item);
  }
  return { evidence, containsLivingData };
}

async function submitResearch(event) {
  if (!form || event.target !== form || !document.getElementById('researchFrontierCategory')?.checked) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const description = textArea?.value.trim() || '';
  const targetName = selectedPersonName();
  if (!targetName) { setMessage(t('First click the person this research belongs to.','Klik eers op die persoon aan wie hierdie navorsing behoort.'),'error'); return; }
  if (!description) { setMessage(t('Describe the research lead or hypothesis you want to preserve.','Beskryf die navorsingsleidraad of hipotese wat jy wil behou.'),'error'); return; }
  try {
    const session = await approvedSession();
    const personId = await targetPersonId();
    if (!personId) throw new Error(t('I could not identify the selected family record.','Ek kon nie die gekose familierekord identifiseer nie.'));
    const categories = [...document.querySelectorAll('input[name="contributionCategory"]:checked')].map((node) => node.value);
    const sourceSelected = categories.includes('source');
    const uploaded = sourceSelected ? await uploadEvidence(session, description) : { evidence:[], containsLivingData:false };
    const evidence = uploaded.evidence;
    const status = document.querySelector('input[name="researchFrontierStatus"]:checked')?.value || 'hypothesis';
    const lang = document.getElementById('contributionLanguageSelect')?.value || 'en';
    const firstLine = description.split(/\r?\n/).map((v)=>v.trim()).find(Boolean) || 'Family research lead';
    const payload = {
      submitted_by:session.user.id,
      target_person_id:personId,
      contribution_type:'research',
      original_language:lang,
      narrative_text:description,
      payload:{
        categories,
        research_frontier:true,
        frontier_status:status,
        frontier_title:firstLine.slice(0,180),
        attached_to_name:targetName,
        selected_record_linkage:true,
        contains_living_person_data:uploaded.containsLivingData,
        evidence_items:evidence.map((item)=>({id:item.id,storage_path:item.storage_path,original_filename:item.original_filename,title:item.title,evidence_type:item.evidence_type,source_class:item.source_class,privacy_review_status:item.privacy_review_status})),
        attachment_count:evidence.length
      }
    };
    const { error } = await supabase.from('contributions').insert(payload);
    if (error) throw error;
    currentTargetId = personId;
    form.reset();
    document.getElementById('researchFrontierControls')?.classList.add('hidden');
    document.getElementById('sourceUploadArea')?.classList.add('hidden');
    const list = document.getElementById('sourceFileList'); if (list) list.innerHTML='';
    if (evidence.length) setMessage(t(`Record submitted for review as ${status} research-frontier evidence about ${targetName}. It remains provisional until editor review.`,`Rekord vir hersiening ingedien as ${status} navorsingsfront-bewys oor ${targetName}. Dit bly voorlopig tot redakteursoorsig.`),'success');
    else setMessage(t(`Research frontier submission saved about ${targetName} as ${status}. It is not canonical or documented.`,`Navorsingsfront-indiening oor ${targetName} as ${status} gestoor. Dit is nie kanoniek of gedokumenteer nie.`),'success');
    document.dispatchEvent(new CustomEvent('genealogy:research-frontier-submitted',{detail:{person_id:personId,status}}));
  } catch (error) {
    setMessage(error?.message || t('The research submission could not be saved.','Die navorsingsindiening kon nie gestoor word nie.'),'error');
  }
}

// Register before contribution-workflow-v2.js. Research submissions are handled here;
// all ordinary contributions pass through untouched to the existing workflow.
document.addEventListener('submit', submitResearch, true);
document.addEventListener('click', (event) => {
  const node = event.target instanceof Element ? event.target.closest('[data-person-id],[data-snapshot-person]') : null;
  const id = node?.dataset?.personId || node?.dataset?.snapshotPerson;
  if (id) currentTargetId = id;
}, true);
centreSelect?.addEventListener('change', () => { currentTargetId = centreSelect.value || null; });

document.addEventListener('genealogy:language-changed', () => {
  const chip = document.querySelector('#frontierResearchChip span');
  if (chip) chip.textContent = t('Research frontier / hypothesis','Navorsingsfront / hipotese');
  const controls = document.getElementById('researchFrontierControls');
  if (controls) controls.innerHTML = controlsHtml();
});

const observer = new MutationObserver(() => { if (installUi()) observer.disconnect(); });
observer.observe(document.body,{childList:true,subtree:true});
installUi();
