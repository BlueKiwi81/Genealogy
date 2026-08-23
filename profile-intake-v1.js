const SUPABASE_HOST = 'jkakvpsiiffnidggcqzc.supabase.co';
const previousFetch = window.fetch.bind(window);
let pendingExtras = null;

const HISTORICAL_PERIODS = [
  {
    key: 'south_african_war',
    label: 'South African War / Anglo-Boer War',
    years: '1899-1902',
    start: 1899,
    end: 1902,
    prompt: 'Do we know anything about how the South African War affected this person or their family?',
    detailHint: 'Military service, displacement, loss of property, refugee experience, concentration camp, commando service, or any family recollection.',
    camp: true,
  },
  {
    key: 'first_world_war',
    label: 'First World War',
    years: '1914-1918',
    start: 1914,
    end: 1918,
    prompt: 'Do we know anything about how the First World War affected this person or their family?',
    detailHint: 'Military service, workplace or family impact, illness, travel, bereavement, or any other remembered effect.',
  },
  {
    key: 'second_world_war',
    label: 'Second World War',
    years: '1939-1945',
    start: 1939,
    end: 1945,
    prompt: 'Do we know anything about how the Second World War affected this person or their family?',
    detailHint: 'Military service, home-front experience, work, migration, bereavement, or any other remembered effect.',
  },
];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function labelFor(form, fieldName) {
  const field = form.elements.namedItem(fieldName);
  return field?.closest('label') || null;
}

function yearOf(value) {
  const match = String(value || '').match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function lifeStatusFor(form) {
  const field = form.elements.namedItem('life_status');
  if (field?.value) return field.value;
  return form.elements.namedItem('death_date')?.value ? 'deceased' : 'unknown';
}

function periodApplicability(form, period) {
  const birthYear = yearOf(form.elements.namedItem('birth_date')?.value);
  const deathYear = yearOf(form.elements.namedItem('death_date')?.value);
  const status = lifeStatusFor(form);
  if (!birthYear) return null;
  if (birthYear > period.end) return null;
  if (deathYear && deathYear < period.start) return null;
  if (deathYear && deathYear >= period.start) return 'definite';
  if (status === 'alive') return 'definite';
  return 'possible';
}

function historicalPromptHtml(period, applicability) {
  const qualifier = applicability === 'possible'
    ? `Based on the dates entered, this person <strong>may have been alive</strong> during ${esc(period.label)} (${period.years}).`
    : `This person appears to have been alive during ${esc(period.label)} (${period.years}).`;
  return `<div class="smart-history-item" data-history-key="${period.key}">
    <p>${qualifier}</p>
    <label>${esc(period.prompt)}
      <select name="history_${period.key}_status">
        <option value="">Skip for now</option>
        <option value="no_known_information">No information currently known</option>
        <option value="known">Yes, we know something</option>
      </select>
    </label>
    <div class="smart-history-known hidden" data-history-known="${period.key}">
      <label>What do we know?<textarea name="history_${period.key}_details" rows="3" placeholder="${esc(period.detailHint)}"></textarea></label>
      ${period.camp ? `<label>Concentration camp, if known<input name="history_${period.key}_camp" placeholder="Camp name or place" /></label>` : ''}
    </div>
  </div>`;
}

function refreshHistoricalPrompts(form) {
  const host = form.querySelector('[data-smart-history-host]');
  if (!host) return;
  const applicable = HISTORICAL_PERIODS
    .map((period) => ({ period, applicability: periodApplicability(form, period) }))
    .filter((entry) => entry.applicability);

  if (!applicable.length) {
    host.innerHTML = '';
    host.classList.add('hidden');
    return;
  }

  const previous = {};
  HISTORICAL_PERIODS.forEach((period) => {
    previous[period.key] = {
      status: form.elements.namedItem(`history_${period.key}_status`)?.value || '',
      details: form.elements.namedItem(`history_${period.key}_details`)?.value || '',
      camp: form.elements.namedItem(`history_${period.key}_camp`)?.value || '',
    };
  });

  host.classList.remove('hidden');
  host.innerHTML = `<details class="smart-history-details">
    <summary><span>Historical context</span><small>${applicable.length} relevant period${applicable.length === 1 ? '' : 's'} identified from the dates</small></summary>
    <p class="smart-history-intro">These are research prompts, not assumptions. If nothing is known, say so and move on.</p>
    ${applicable.map(({ period, applicability }) => historicalPromptHtml(period, applicability)).join('')}
  </details>`;

  applicable.forEach(({ period }) => {
    const statusField = form.elements.namedItem(`history_${period.key}_status`);
    const detailsField = form.elements.namedItem(`history_${period.key}_details`);
    const campField = form.elements.namedItem(`history_${period.key}_camp`);
    if (previous[period.key]?.status) statusField.value = previous[period.key].status;
    if (detailsField && previous[period.key]?.details) detailsField.value = previous[period.key].details;
    if (campField && previous[period.key]?.camp) campField.value = previous[period.key].camp;
    const known = form.querySelector(`[data-history-known="${period.key}"]`);
    const sync = () => known?.classList.toggle('hidden', statusField?.value !== 'known');
    statusField?.addEventListener('change', sync);
    sync();
  });
}

function syncDeathFields(form) {
  const status = lifeStatusFor(form);
  const deathBlock = form.querySelector('[data-death-details]');
  if (!deathBlock) return;
  const show = status === 'deceased';
  deathBlock.classList.toggle('hidden', !show);
  deathBlock.querySelectorAll('input,select,textarea').forEach((field) => { field.disabled = !show; });
}

function moveLabel(container, label) {
  if (label) container.appendChild(label);
}

function enhanceForm(form) {
  if (!form || form.dataset.smartProfileEnhanced === '1') return;
  form.dataset.smartProfileEnhanced = '1';

  const grid = form.querySelector('.tree-edit-grid');
  if (!grid) return;

  const isEdit = form.id === 'editPersonSuggestionForm';
  const preferredLabel = labelFor(form, 'preferred_name');
  const genderLabel = labelFor(form, 'gender');
  const occupationLabel = labelFor(form, 'occupation_summary');
  const narrativeLabel = labelFor(form, 'narrative_summary');
  const deathDateLabel = labelFor(form, 'death_date');
  const deathPlaceLabel = labelFor(form, 'death_place');
  const birthDate = form.elements.namedItem('birth_date');
  const birthPlaceLabel = labelFor(form, 'birth_place');

  const existingDeathDate = form.elements.namedItem('death_date')?.value || '';
  const inferredStatus = existingDeathDate ? 'deceased' : (isEdit ? '' : 'unknown');

  const statusLabel = document.createElement('label');
  statusLabel.innerHTML = `Are they alive?<select name="life_status">
    ${isEdit ? '<option value="" selected>Keep current / not changing</option>' : ''}
    <option value="unknown"${inferredStatus === 'unknown' ? ' selected' : ''}>Unknown / not sure</option>
    <option value="alive">Yes</option>
    <option value="deceased"${inferredStatus === 'deceased' ? ' selected' : ''}>No - deceased</option>
  </select>`;
  const birthLabel = birthDate?.closest('label');
  if (birthLabel) birthLabel.insertAdjacentElement('afterend', statusLabel);
  else grid.appendChild(statusLabel);

  const residenceLabel = document.createElement('label');
  residenceLabel.className = 'smart-profile-wide';
  residenceLabel.innerHTML = `Where did they live?<textarea name="residence_summary" rows="2" placeholder="${isEdit ? 'Add or replace this only if you want to change it' : 'Places or areas, even if dates are not known'}"></textarea>`;
  grid.insertAdjacentElement('afterend', residenceLabel);

  const deathBlock = document.createElement('div');
  deathBlock.className = 'smart-death-details';
  deathBlock.dataset.deathDetails = '1';
  deathBlock.innerHTML = '<p class="smart-section-title">Death and final resting place</p>';
  const deathGrid = document.createElement('div');
  deathGrid.className = 'tree-edit-grid';
  moveLabel(deathGrid, deathDateLabel);
  moveLabel(deathGrid, deathPlaceLabel);
  const restTypeLabel = document.createElement('label');
  restTypeLabel.innerHTML = `<span>Buried or cremated?</span><select name="final_rest_type"><option value="">${isEdit ? 'Keep current / not changing' : 'Unknown / not recorded'}</option><option value="buried">Buried</option><option value="cremated">Cremated</option><option value="other">Other</option><option value="unknown">Unknown</option></select>`;
  const restPlaceLabel = document.createElement('label');
  restPlaceLabel.innerHTML = `<span>Burial / cremation place</span><input name="final_rest_place" placeholder="${isEdit ? 'Leave blank to keep current' : 'Cemetery, crematorium or place'}" />`;
  deathGrid.append(restTypeLabel, restPlaceLabel);
  deathBlock.appendChild(deathGrid);
  residenceLabel.insertAdjacentElement('afterend', deathBlock);

  const extra = document.createElement('details');
  extra.className = 'smart-profile-extra';
  extra.innerHTML = '<summary><span>Add more about this person</span><small>Optional</small></summary><div class="smart-profile-extra-body"></div>';
  const extraBody = extra.querySelector('.smart-profile-extra-body');
  moveLabel(extraBody, preferredLabel);
  moveLabel(extraBody, genderLabel);
  moveLabel(extraBody, occupationLabel);
  const militaryLabel = document.createElement('label');
  militaryLabel.innerHTML = `<span>Military or other service</span><textarea name="military_service_summary" rows="2" placeholder="${isEdit ? 'Leave blank to keep current' : 'Military, railway, police, church, public service or other significant service'}"></textarea>`;
  extraBody.appendChild(militaryLabel);
  moveLabel(extraBody, narrativeLabel);
  deathBlock.insertAdjacentElement('afterend', extra);

  const historyHost = document.createElement('div');
  historyHost.dataset.smartHistoryHost = '1';
  historyHost.className = 'smart-history-host hidden';
  extra.insertAdjacentElement('afterend', historyHost);

  const statusField = form.elements.namedItem('life_status');
  statusField?.addEventListener('change', () => {
    syncDeathFields(form);
    refreshHistoricalPrompts(form);
  });
  birthDate?.addEventListener('change', () => refreshHistoricalPrompts(form));
  form.elements.namedItem('death_date')?.addEventListener('change', () => refreshHistoricalPrompts(form));

  if (birthPlaceLabel && birthPlaceLabel.parentElement !== grid) grid.appendChild(birthPlaceLabel);
  syncDeathFields(form);
  refreshHistoricalPrompts(form);
}

function collectHistoricalContext(form) {
  const result = {};
  HISTORICAL_PERIODS.forEach((period) => {
    const status = form.elements.namedItem(`history_${period.key}_status`)?.value || '';
    if (!status) return;
    const entry = { status };
    const details = form.elements.namedItem(`history_${period.key}_details`)?.value?.trim();
    const camp = form.elements.namedItem(`history_${period.key}_camp`)?.value?.trim();
    if (details) entry.details = details;
    if (camp) entry.concentration_camp = camp;
    result[period.key] = entry;
  });
  return result;
}

function collectExtras(form) {
  const isEdit = form.id === 'editPersonSuggestionForm';
  const result = {};
  const lifeStatus = form.elements.namedItem('life_status')?.value || '';
  const residence = form.elements.namedItem('residence_summary')?.value?.trim() || '';
  const restType = form.elements.namedItem('final_rest_type')?.value || '';
  const restPlace = form.elements.namedItem('final_rest_place')?.value?.trim() || '';
  const military = form.elements.namedItem('military_service_summary')?.value?.trim() || '';
  const historical = collectHistoricalContext(form);

  if (isEdit) {
    if (lifeStatus) result.life_status = lifeStatus;
    if (residence) result.residence_summary = residence;
    if (restType) result.final_rest_type = restType;
    if (restPlace) result.final_rest_place = restPlace;
    if (military) result.military_service_summary = military;
    if (Object.keys(historical).length) result.historical_context = historical;
    return result;
  }

  result.life_status = lifeStatus || 'unknown';
  result.residence_summary = residence || null;
  result.final_rest_type = restType || null;
  result.final_rest_place = restPlace || null;
  result.military_service_summary = military || null;
  result.historical_context = historical;
  return result;
}

function captureProfileSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!['addRelativeSuggestionForm', 'editPersonSuggestionForm'].includes(form.id)) return;
  pendingExtras = {
    at: Date.now(),
    mode: form.id === 'addRelativeSuggestionForm' ? 'add_relative' : 'edit_person',
    values: collectExtras(form),
  };
}

document.addEventListener('submit', captureProfileSubmit, true);

window.fetch = async function profileIntakeFetch(input, init) {
  try {
    const urlText = typeof input === 'string' ? input : input?.url;
    const url = urlText ? new URL(urlText, window.location.href) : null;
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url?.hostname === SUPABASE_HOST && url.pathname === '/rest/v1/tree_change_sets' && method === 'POST' && pendingExtras && Date.now() - pendingExtras.at < 5000) {
      const rawBody = init?.body;
      if (typeof rawBody === 'string') {
        const parsed = JSON.parse(rawBody);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        rows.forEach((row) => {
          if (row?.change_type !== pendingExtras.mode || !row.payload) return;
          const key = row.change_type === 'add_relative' ? 'relative' : 'after';
          row.payload[key] = { ...(row.payload[key] || {}), ...pendingExtras.values };
        });
        const nextBody = JSON.stringify(Array.isArray(parsed) ? rows : rows[0]);
        pendingExtras = null;
        return previousFetch(input, { ...init, body: nextBody });
      }
    }
  } catch {
    pendingExtras = null;
  }
  return previousFetch(input, init);
};

function scanForForms(root = document) {
  root.querySelectorAll?.('#addRelativeSuggestionForm, #editPersonSuggestionForm').forEach(enhanceForm);
}

function installStyles() {
  if (document.getElementById('smartProfileIntakeStyles')) return;
  const style = document.createElement('style');
  style.id = 'smartProfileIntakeStyles';
  style.textContent = `
    .smart-profile-wide{display:grid!important;gap:4px!important}.smart-profile-wide textarea{resize:vertical}
    .smart-death-details{display:grid;gap:7px;padding:10px;border-radius:11px;background:rgba(239,231,219,.55);border:1px solid rgba(93,72,53,.12)}.smart-death-details.hidden{display:none}.smart-section-title{margin:0;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#7a695c}
    .smart-profile-extra{border:1px solid rgba(93,72,53,.17);border-radius:11px;background:#fbf5ec}.smart-profile-extra summary,.smart-history-details summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;cursor:pointer;font-size:10.5px;font-weight:800;color:#514439}.smart-profile-extra summary small,.smart-history-details summary small{font-size:8.5px;font-weight:600;color:#8a7b6e}.smart-profile-extra-body{display:grid;gap:9px;padding:0 11px 11px}.smart-profile-extra-body label{display:grid;gap:4px}
    .smart-history-host.hidden{display:none}.smart-history-details{border:1px solid rgba(127,96,56,.21);border-radius:11px;background:#fff8e9}.smart-history-intro{font-size:9.5px;line-height:1.45;color:#786a5d;padding:0 11px;margin:0 0 7px}.smart-history-item{display:grid;gap:7px;padding:10px 11px;border-top:1px solid rgba(127,96,56,.14)}.smart-history-item p{margin:0;font-size:10px;line-height:1.45;color:#5e5044}.smart-history-known{display:grid;gap:7px}.smart-history-known.hidden{display:none}
  `;
  document.head.appendChild(style);
}

installStyles();
scanForForms();
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches?.('#addRelativeSuggestionForm, #editPersonSuggestionForm')) enhanceForm(node);
    scanForForms(node);
  }));
});
observer.observe(document.body, { childList: true, subtree: true });
