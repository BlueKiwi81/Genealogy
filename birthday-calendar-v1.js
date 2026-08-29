import { supabase } from './supabase-client-v1.js';

const FUNCTION_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co/functions/v1/birthday-calendar';

const state = {
  ready: false,
  settings: null,
  preferences: new Map(),
  selectedPersonId: null,
  saving: false,
};

function el(id) {
  return document.getElementById(id);
}

function setMessage(text = '', type = '') {
  const node = el('birthdayCalendarMessage');
  if (!node) return;
  node.textContent = text;
  node.className = `message${type ? ` ${type}` : ''}`;
}

async function api(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in again to change your calendar.');
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'The birthday calendar could not be updated.');
  return data;
}

function settingsFromForm() {
  return {
    scope: el('birthdayCalendarScope')?.value || 'close_family',
    show_age: Boolean(el('birthdayCalendarShowAge')?.checked),
    include_deceased_milestones: Boolean(el('birthdayCalendarMemorials')?.checked),
    include_deceased_child_milestones: Boolean(el('birthdayCalendarChildMemorials')?.checked),
  };
}

function applyServerData(data) {
  state.settings = data?.subscription || null;
  state.preferences = new Map((data?.preferences || []).map((row) => [row.person_id, row.preference]));
  render();
}

function selectedName() {
  const option = el('centreSelect')?.selectedOptions?.[0];
  const node = document.querySelector(`[data-person-id="${CSS.escape(state.selectedPersonId || '')}"]`);
  const aria = node?.getAttribute?.('aria-label');
  if (aria) return aria;
  if (state.selectedPersonId === el('centreSelect')?.value && option?.textContent) {
    return option.textContent.replace(/\s+\((?:b\.|d\.|\d{4}).*\)$/, '').trim();
  }
  return 'this relative';
}

function renderPreference() {
  const wrap = el('birthdayPersonPreferenceWrap');
  const select = el('birthdayPersonPreference');
  const name = el('birthdayPersonPreferenceName');
  if (!wrap || !select || !name) return;
  if (!state.settings || !state.selectedPersonId) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  name.textContent = selectedName();
  select.value = state.preferences.get(state.selectedPersonId) || 'default';
}

function render() {
  const subscription = state.settings;
  const scope = el('birthdayCalendarScope');
  const showAge = el('birthdayCalendarShowAge');
  const memorials = el('birthdayCalendarMemorials');
  const childMemorials = el('birthdayCalendarChildMemorials');
  const activate = el('birthdayCalendarActivate');
  const save = el('birthdayCalendarSave');
  const subscribe = el('birthdayCalendarSubscribe');
  const copy = el('birthdayCalendarCopy');
  const rotate = el('birthdayCalendarRotate');
  const disable = el('birthdayCalendarDisable');
  const status = el('birthdayCalendarStatus');

  if (subscription) {
    scope.value = subscription.scope || 'close_family';
    showAge.checked = subscription.show_age !== false;
    memorials.checked = subscription.include_deceased_milestones !== false;
    childMemorials.checked = subscription.include_deceased_child_milestones !== false;
  }

  const active = Boolean(subscription?.enabled);
  if (status) {
    status.textContent = !subscription
      ? 'No calendar subscription yet.'
      : active
        ? 'Your calendar subscription is active and will refresh from the family database.'
        : 'Your calendar subscription is paused.';
  }

  activate?.classList.toggle('hidden', active);
  if (activate) activate.textContent = subscription ? 'Reactivate calendar' : 'Create calendar subscription';
  save?.classList.toggle('hidden', !subscription);
  subscribe?.classList.toggle('hidden', !active);
  copy?.classList.toggle('hidden', !subscription);
  rotate?.classList.toggle('hidden', !subscription);
  disable?.classList.toggle('hidden', !active);

  if (subscribe && subscription?.webcal_url) subscribe.href = subscription.webcal_url;
  renderPreference();
}

function buildPanel() {
  if (el('birthdayCalendarPanel')) return;
  const personPanel = el('personPanel');
  if (!personPanel) return;
  const panel = document.createElement('section');
  panel.className = 'panel birthday-calendar-panel';
  panel.id = 'birthdayCalendarPanel';
  panel.innerHTML = `
    <p class="eyebrow">Family tools</p>
    <h2>Birthday calendar</h2>
    <p class="small birthday-calendar-intro">Subscribe once and your calendar will stay in step with the family tree. Living birthdays use recorded dates only; memorial birthdays follow the relationship and milestone rules.</p>

    <div id="birthdayCalendarStatus" class="birthday-calendar-status"></div>

    <label class="select-label birthday-calendar-field">Who should I see?
      <select id="birthdayCalendarScope">
        <option value="close_family">Close family - recommended</option>
        <option value="extended_family">Extended family</option>
        <option value="all_family">All living family</option>
        <option value="custom">Custom only</option>
      </select>
    </label>
    <p class="birthday-calendar-help">Close family follows your place in the tree. Custom choices below can always add or remove a particular relative.</p>

    <label class="check-row birthday-calendar-check"><input id="birthdayCalendarShowAge" type="checkbox" checked /> <span>Show the age the person will turn.</span></label>
    <label class="check-row birthday-calendar-check"><input id="birthdayCalendarMemorials" type="checkbox" checked /> <span>Include significant "would have been" birthdays for close or significant deceased relatives.</span></label>
    <label class="check-row birthday-calendar-check"><input id="birthdayCalendarChildMemorials" type="checkbox" checked /> <span>Include five-year birthday milestones for children who died young, for their closest family.</span></label>

    <div class="birthday-calendar-actions">
      <button id="birthdayCalendarActivate" class="button primary" type="button">Create calendar subscription</button>
      <button id="birthdayCalendarSave" class="button secondary hidden" type="button">Save calendar choices</button>
      <a id="birthdayCalendarSubscribe" class="button primary hidden" href="#">Subscribe on this device</a>
      <button id="birthdayCalendarCopy" class="button secondary hidden" type="button">Copy subscription link</button>
      <button id="birthdayCalendarRotate" class="button ghost hidden" type="button">Reset private link</button>
      <button id="birthdayCalendarDisable" class="button ghost hidden" type="button">Pause subscription</button>
    </div>

    <div id="birthdayPersonPreferenceWrap" class="birthday-person-preference hidden">
      <strong>Selected relative</strong>
      <span id="birthdayPersonPreferenceName"></span>
      <label class="select-label">Birthday calendar preference
        <select id="birthdayPersonPreference">
          <option value="default">Use relationship rules</option>
          <option value="include">Always include</option>
          <option value="exclude">Do not include</option>
        </select>
      </label>
      <p class="birthday-calendar-help">For a living relative, "Always include" adds their annual birthday regardless of scope. For a deceased relative, it allows the memorial milestone rules to apply.</p>
    </div>

    <p id="birthdayCalendarMessage" class="message" aria-live="polite"></p>`;
  personPanel.insertAdjacentElement('afterend', panel);

  el('birthdayCalendarActivate')?.addEventListener('click', async () => {
    if (state.saving) return;
    state.saving = true;
    setMessage('Creating your private calendar link...');
    try {
      applyServerData(await api('activate', settingsFromForm()));
      setMessage('Calendar subscription ready. Use "Subscribe on this device" or copy the link for another calendar app.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Unable to create the calendar.', 'error');
    } finally {
      state.saving = false;
    }
  });

  el('birthdayCalendarSave')?.addEventListener('click', async () => {
    if (state.saving || !state.settings) return;
    state.saving = true;
    setMessage('Saving calendar choices...');
    try {
      applyServerData(await api('update', settingsFromForm()));
      setMessage('Calendar choices saved.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Unable to save the calendar choices.', 'error');
    } finally {
      state.saving = false;
    }
  });

  el('birthdayCalendarCopy')?.addEventListener('click', async () => {
    const url = state.settings?.subscription_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Subscription link copied. In Google Calendar or Outlook, add it as a calendar from URL.', 'success');
    } catch {
      window.prompt('Copy this private calendar subscription link:', url);
    }
  });

  el('birthdayCalendarRotate')?.addEventListener('click', async () => {
    if (!state.settings || state.saving) return;
    if (!window.confirm('Reset the private calendar link? The old subscription URL will stop working immediately.')) return;
    state.saving = true;
    setMessage('Resetting the private link...');
    try {
      applyServerData(await api('rotate'));
      setMessage('Private link reset. Re-subscribe any calendar that used the old link.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Unable to reset the private link.', 'error');
    } finally {
      state.saving = false;
    }
  });

  el('birthdayCalendarDisable')?.addEventListener('click', async () => {
    if (!state.settings || state.saving) return;
    state.saving = true;
    setMessage('Pausing the calendar subscription...');
    try {
      applyServerData(await api('disable'));
      setMessage('Calendar subscription paused. Existing calendar apps will no longer receive this feed.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Unable to pause the calendar.', 'error');
    } finally {
      state.saving = false;
    }
  });

  el('birthdayPersonPreference')?.addEventListener('change', async (event) => {
    if (!state.selectedPersonId || !state.settings || state.saving) return;
    state.saving = true;
    setMessage('Saving this relative preference...');
    try {
      applyServerData(await api('set_person_preference', {
        person_id: state.selectedPersonId,
        preference: event.target.value,
      }));
      setMessage('Relative preference saved.', 'success');
    } catch (error) {
      setMessage(error?.message || 'Unable to save this relative preference.', 'error');
    } finally {
      state.saving = false;
    }
  });
}

async function load() {
  if (state.ready) return;
  state.ready = true;
  buildPanel();
  state.selectedPersonId = el('centreSelect')?.value || null;
  setMessage('Loading birthday calendar settings...');
  try {
    applyServerData(await api('get'));
    setMessage('');
  } catch (error) {
    setMessage(error?.message || 'Birthday calendar settings could not be loaded.', 'error');
  }
}

document.addEventListener('genealogy:archive-ready', () => {
  void load();
});

document.addEventListener('click', (event) => {
  const node = event.target?.closest?.('[data-person-id]');
  if (!node?.dataset?.personId) return;
  state.selectedPersonId = node.dataset.personId;
  window.setTimeout(renderPreference, 0);
}, true);

el('centreSelect')?.addEventListener('change', () => {
  state.selectedPersonId = el('centreSelect')?.value || null;
  window.setTimeout(renderPreference, 0);
});
