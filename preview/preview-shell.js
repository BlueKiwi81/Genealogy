import { supabase } from '../supabase-client-v1.js';
import { renderFamilyGroup } from './family-group-v1.js';

const state = {
  view: 'home',
  treeMode: 'fan',
  stories: null,
  initialized: false,
  groupRenderToken: 0,
};

const ui = {
  appArea: document.getElementById('appArea'),
  home: document.getElementById('previewHome'),
  explore: document.getElementById('previewExploreArea'),
  story: document.getElementById('storyArea'),
  storyIndex: document.getElementById('storyIndex'),
  storyReader: document.getElementById('storyReader'),
  storyBack: document.getElementById('storyBack'),
  storyStatus: document.getElementById('storyStatus'),
  viewTitle: document.getElementById('viewTitle'),
  viewSummary: document.getElementById('viewSummary'),
  treeEyebrow: document.getElementById('previewTreeEyebrow'),
  treeHeading: document.getElementById('previewTreeHeading'),
  treeCanvas: document.getElementById('treeCanvas'),
  treeStatus: document.getElementById('treeStatus'),
  centreSelect: document.getElementById('centreSelect'),
};

const BLOCK_LABELS = {
  documented: 'Documented',
  family_voice: 'Remembered by the family',
  historical_setting: 'Historical setting',
  research_frontier: 'Still being researched',
  narrative: 'Family story',
  quote: 'Family voice',
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function humanize(value) {
  return String(value || '')
    .replaceAll('-', ' ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function yearRange(section) {
  const from = section?.date_from?.slice(0, 4) || '';
  const to = section?.date_to?.slice(0, 4) || '';
  if (from && to && from !== to) return `${from}-${to}`;
  return from || to || '';
}

function nativeViewSelect() {
  return document.getElementById('treeViewMode');
}

function generationSelect() {
  return document.getElementById('generationDepth');
}

function setNativeMode(mode) {
  const select = nativeViewSelect();
  if (!select) return false;
  if (select.value !== mode) {
    select.value = mode;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

function setGenerationVisibility(visible) {
  const select = generationSelect();
  const label = select?.closest('label');
  if (label) label.hidden = !visible;
}

function capFanDepth() {
  const select = generationSelect();
  if (!select) return;
  if ([...select.options].some((option) => option.value === '5') && select.value !== '5') {
    select.value = '5';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function syncTreeButtons() {
  document.querySelectorAll('[data-preview-tree-mode]').forEach((button) => {
    const active = button.dataset.previewTreeMode === state.treeMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function ensureTreeControls() {
  const select = nativeViewSelect();
  if (!select) return false;
  select.closest('label')?.classList.add('preview-native-view-hidden');
  if (document.getElementById('previewTreeModes')) {
    syncTreeButtons();
    return true;
  }

  const modes = document.createElement('div');
  modes.id = 'previewTreeModes';
  modes.className = 'preview-tree-modes';
  modes.setAttribute('aria-label', 'Family tree view');
  modes.innerHTML = `
    <button type="button" class="preview-tree-mode" data-preview-tree-mode="fan">Family Fan</button>
    <button type="button" class="preview-tree-mode" data-preview-tree-mode="group">Family Group</button>`;

  const controls = select.closest('.enhanced-tree-controls');
  if (controls) controls.prepend(modes);
  else select.closest('label')?.insertAdjacentElement('beforebegin', modes);

  modes.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preview-tree-mode]');
    if (!button) return;
    state.treeMode = button.dataset.previewTreeMode;
    syncTreeButtons();
    setPrimaryView('tree');
  });

  syncTreeButtons();
  return true;
}

function updatePrimaryTabs(view) {
  document.querySelectorAll('.preview-primary-tab[data-preview-view]').forEach((button) => {
    const active = button.dataset.previewView === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function setExploreLabels(view) {
  if (view === 'places') {
    if (ui.treeEyebrow) ui.treeEyebrow.textContent = 'Family geography';
    if (ui.treeHeading) ui.treeHeading.textContent = 'Our family map';
    if (ui.viewTitle) ui.viewTitle.textContent = 'Places & Journeys';
    if (ui.viewSummary) ui.viewSummary.textContent = 'Follow where family lives unfolded, where people moved, and which historical events belong to the surrounding landscape rather than to a personal-presence claim.';
    return;
  }
  if (ui.treeEyebrow) ui.treeEyebrow.textContent = 'Interactive tree';
  if (ui.treeHeading) ui.treeHeading.textContent = state.treeMode === 'group' ? 'Family group' : 'Family fan';
}

function selectCentrePerson(personId) {
  const select = ui.centreSelect;
  if (!select || !personId) return;
  const option = [...select.options].find((item) => item.value === personId);
  if (!option) return;
  select.value = personId;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

async function renderGroupSafely() {
  if (state.view !== 'tree' || state.treeMode !== 'group' || !ui.centreSelect?.value) return;
  const token = ++state.groupRenderToken;
  try {
    await renderFamilyGroup({
      centreId: ui.centreSelect.value,
      canvas: ui.treeCanvas,
      title: ui.viewTitle,
      summary: ui.viewSummary,
      status: ui.treeStatus,
      onSelect: (id) => {
        selectCentrePerson(id);
        window.setTimeout(() => renderGroupSafely(), 80);
      },
    });
  } catch (error) {
    if (token !== state.groupRenderToken || state.view !== 'tree' || state.treeMode !== 'group') return;
    if (ui.treeStatus) ui.treeStatus.textContent = `Family Group could not load: ${error?.message || 'unknown error'}`;
  }
}

function showFan() {
  state.groupRenderToken += 1;
  document.body.classList.remove('preview-group-mode');
  setGenerationVisibility(true);
  setNativeMode('ancestry');
  window.setTimeout(() => capFanDepth(), 30);
}

function showGroup() {
  document.body.classList.add('preview-group-mode');
  setGenerationVisibility(false);
  setNativeMode('ancestry');
  window.setTimeout(() => renderGroupSafely(), 70);
}

function showPlaces() {
  state.groupRenderToken += 1;
  document.body.classList.remove('preview-group-mode');
  setGenerationVisibility(false);
  setNativeMode('map');
}

function setPrimaryView(view) {
  if (!['home', 'tree', 'places', 'story'].includes(view)) return;
  state.view = view;
  updatePrimaryTabs(view);
  document.body.classList.toggle('preview-places-mode', view === 'places');
  ui.home?.classList.toggle('hidden', view !== 'home');
  ui.explore?.classList.toggle('hidden', !['tree', 'places'].includes(view));
  ui.story?.classList.toggle('hidden', view !== 'story');

  ensureTreeControls();

  if (view === 'tree') {
    setExploreLabels('tree');
    if (state.treeMode === 'group') showGroup();
    else showFan();
  } else if (view === 'places') {
    setExploreLabels('places');
    showPlaces();
  } else if (view === 'story') {
    state.groupRenderToken += 1;
    void loadStoryIndex();
  } else {
    state.groupRenderToken += 1;
  }

  if (view !== 'story') closeStoryReader();
}

function storyCard(section) {
  const years = yearRange(section);
  const minutes = section.estimated_minutes ? `${section.estimated_minutes} min read` : 'Short read';
  return `<button type="button" class="story-card" data-story-slug="${esc(section.slug)}">
    <span class="story-card-kicker"><span>${esc(humanize(section.line_key || 'Family history'))}</span>${years ? `<span>${esc(years)}</span>` : ''}</span>
    <h3>${esc(section.title)}</h3>
    ${section.subtitle ? `<span class="story-card-subtitle">${esc(section.subtitle)}</span>` : ''}
    ${section.summary ? `<span class="story-card-summary">${esc(section.summary)}</span>` : ''}
    <span class="story-card-meta">${esc(minutes)}</span>
  </button>`;
}

async function loadStoryIndex(force = false) {
  if (!ui.storyIndex) return;
  if (state.stories && !force) {
    renderStoryIndex();
    return;
  }
  if (ui.storyStatus) ui.storyStatus.textContent = 'Loading family stories...';
  const { data, error } = await supabase
    .from('story_sections')
    .select('id,slug,title,subtitle,summary,line_key,date_from,date_to,hero_place_id,primary_person_id,sort_order,estimated_minutes')
    .eq('status', 'published')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    if (ui.storyStatus) ui.storyStatus.textContent = '';
    ui.storyIndex.innerHTML = `<div class="story-error">The Story layer could not be loaded: ${esc(error.message)}</div>`;
    return;
  }
  state.stories = data || [];
  if (ui.storyStatus) ui.storyStatus.textContent = '';
  renderStoryIndex();
}

function renderStoryIndex() {
  if (!ui.storyIndex) return;
  closeStoryReader();
  ui.storyIndex.innerHTML = state.stories?.length
    ? state.stories.map(storyCard).join('')
    : '<div class="panel"><p>No story sections are published yet.</p></div>';
}

async function resolvePerson(id) {
  if (!id) return null;
  const { data } = await supabase.from('people')
    .select('id,given_names,preferred_name,surname,birth_surname,current_surname,birth_date,death_date')
    .eq('id', id).maybeSingle();
  return data || null;
}

async function resolvePlace(id) {
  if (!id) return null;
  const { data } = await supabase.from('places')
    .select('id,canonical_name,historical_names,locality,district,province,country')
    .eq('id', id).maybeSingle();
  return data || null;
}

function personName(person) {
  if (!person) return '';
  const given = person.preferred_name || person.given_names || '';
  const surname = person.birth_surname || person.surname || person.current_surname || '';
  return [given, surname].filter(Boolean).join(' ');
}

function blockHtml(block) {
  const kind = block.block_type || 'narrative';
  const label = BLOCK_LABELS[kind] || humanize(kind);
  return `<section class="story-block" data-kind="${esc(kind)}">
    ${kind === 'narrative' && !block.heading ? '' : `<span class="story-block-label">${esc(label)}</span>`}
    ${block.heading ? `<h3>${esc(block.heading)}</h3>` : ''}
    <p>${esc(block.body)}</p>
    ${block.source_reference ? `<details class="story-block-source"><summary>Source or research basis</summary><div>${esc(block.source_reference)}</div></details>` : ''}
  </section>`;
}

async function openStory(slug) {
  if (!slug || !ui.storyReader) return;
  if (ui.storyStatus) ui.storyStatus.textContent = 'Opening story...';
  const sectionResult = await supabase.from('story_sections')
    .select('id,slug,title,subtitle,summary,line_key,date_from,date_to,hero_place_id,primary_person_id,estimated_minutes')
    .eq('slug', slug).eq('status', 'published').eq('is_active', true).single();

  if (sectionResult.error) {
    if (ui.storyStatus) ui.storyStatus.textContent = '';
    ui.storyReader.classList.remove('hidden');
    ui.storyReader.innerHTML = `<div class="story-error">This story could not be opened: ${esc(sectionResult.error.message)}</div>`;
    return;
  }

  const section = sectionResult.data;
  const [blocksResult, person, place] = await Promise.all([
    supabase.from('story_blocks')
      .select('id,block_order,block_type,heading,body,person_id,place_id,source_reference,evidence_status')
      .eq('section_id', section.id).eq('is_active', true).order('block_order'),
    resolvePerson(section.primary_person_id),
    resolvePlace(section.hero_place_id),
  ]);

  if (ui.storyStatus) ui.storyStatus.textContent = '';
  if (blocksResult.error) {
    ui.storyReader.classList.remove('hidden');
    ui.storyReader.innerHTML = `<div class="story-error">The story text could not be loaded: ${esc(blocksResult.error.message)}</div>`;
    return;
  }

  const years = yearRange(section);
  const meta = [humanize(section.line_key), years, section.estimated_minutes ? `${section.estimated_minutes} min read` : '', place?.canonical_name]
    .filter(Boolean).map((item) => `<span>${esc(item)}</span>`).join('');
  const crosslinks = [];
  if (section.primary_person_id) crosslinks.push(`<button type="button" class="button secondary" data-story-person="${esc(section.primary_person_id)}">See ${esc(personName(person) || 'this person')} in the Family Tree</button>`);
  if (section.hero_place_id) crosslinks.push('<button type="button" class="button secondary" data-story-map>See this world in Places &amp; Journeys</button>');

  ui.storyIndex.classList.add('hidden');
  ui.storyBack?.classList.remove('hidden');
  ui.storyReader.classList.remove('hidden');
  ui.storyReader.innerHTML = `
    <header class="story-reader-header">
      <p class="eyebrow">Family Story</p>
      <h2>${esc(section.title)}</h2>
      ${section.subtitle ? `<p class="story-reader-subtitle">${esc(section.subtitle)}</p>` : ''}
      ${section.summary ? `<p class="story-reader-summary">${esc(section.summary)}</p>` : ''}
      <div class="story-reader-meta">${meta}</div>
    </header>
    ${(blocksResult.data || []).map(blockHtml).join('')}
    ${crosslinks.length ? `<div class="story-crosslinks">${crosslinks.join('')}</div>` : ''}`;
}

function closeStoryReader() {
  if (!ui.storyReader || !ui.storyIndex) return;
  ui.storyReader.classList.add('hidden');
  ui.storyReader.replaceChildren();
  ui.storyIndex.classList.remove('hidden');
  ui.storyBack?.classList.add('hidden');
}

function wireEvents() {
  document.addEventListener('click', (event) => {
    const destination = event.target.closest('[data-preview-view]');
    if (destination) {
      setPrimaryView(destination.dataset.previewView);
      return;
    }
    const story = event.target.closest('[data-story-slug]');
    if (story) {
      void openStory(story.dataset.storySlug);
      return;
    }
    const personButton = event.target.closest('[data-story-person]');
    if (personButton) {
      selectCentrePerson(personButton.dataset.storyPerson);
      state.treeMode = 'fan';
      syncTreeButtons();
      setPrimaryView('tree');
      return;
    }
    if (event.target.closest('[data-story-map]')) setPrimaryView('places');
  });

  ui.storyBack?.addEventListener('click', () => closeStoryReader());
  ui.centreSelect?.addEventListener('change', () => {
    if (state.view === 'tree' && state.treeMode === 'group') {
      window.setTimeout(() => renderGroupSafely(), 80);
    }
  });
}

function initializePreview() {
  if (state.initialized) return;
  state.initialized = true;
  wireEvents();
  ensureTreeControls();
  setPrimaryView('home');
  [40, 160, 500].forEach((delay) => window.setTimeout(() => ensureTreeControls(), delay));
}

const appObserver = new MutationObserver(() => {
  if (ui.appArea && !ui.appArea.classList.contains('hidden')) {
    initializePreview();
    appObserver.disconnect();
  }
});

if (ui.appArea) {
  if (!ui.appArea.classList.contains('hidden')) initializePreview();
  else appObserver.observe(ui.appArea, { attributes: true, attributeFilter: ['class'] });
}
