import { supabase } from '../supabase-client-v1.js';

const state = {
  view: 'home',
  lastTreeMode: 'ancestry',
  stories: null,
  initialized: false,
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

function treePanel() {
  return document.querySelector('.tree-panel');
}

function snapshotActive() {
  return Boolean(treePanel()?.classList.contains('snapshot-active'));
}

function setPerspective(value) {
  const button = document.querySelector(`[data-tree-perspective="${value}"]`);
  if (!button) return false;
  if (button.getAttribute('aria-pressed') !== 'true') button.click();
  return true;
}

function setNativeTreeMode(mode) {
  const select = nativeViewSelect();
  if (!select) return false;
  if (mode !== 'map') state.lastTreeMode = mode;
  if (select.value !== mode) {
    select.value = mode;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  syncTreeModeButtons();
  return true;
}

function syncTreeModeButtons() {
  const activeMode = snapshotActive() ? 'family' : 'ancestry';
  document.querySelectorAll('[data-preview-tree-mode]').forEach((button) => {
    const active = state.view === 'tree' && button.dataset.previewTreeMode === activeMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function cleanFamilyGroupCopy() {
  if (state.view !== 'tree' || !snapshotActive()) return;
  if (ui.viewSummary) ui.viewSummary.textContent = 'Parents and grandparents form the upper half of the hourglass. The selected person and partner sit at the waist. Children, their partners and grandchildren expand below. Sibling households are deliberately kept out of the focus generation.';
  if (ui.treeHeading) ui.treeHeading.textContent = 'Family group';
  const heading = treePanel()?.querySelector('.panel-head h2');
  if (heading) heading.textContent = 'Family group';
  const status = document.getElementById('treeStatus');
  if (status) status.textContent = 'Focused family group: ancestors above, selected household at the centre, descendants below.';
}

function activateTreeMode(mode) {
  if (mode === 'family') {
    state.lastTreeMode = 'family';
    setNativeTreeMode('family');
    window.setTimeout(() => {
      setPerspective('snapshot');
      syncTreeModeButtons();
      cleanFamilyGroupCopy();
    }, 0);
    return;
  }
  state.lastTreeMode = 'ancestry';
  setPerspective('fan');
  setNativeTreeMode('ancestry');
  syncTreeModeButtons();
}

function ensureTreeModeControls() {
  const select = nativeViewSelect();
  if (!select || document.getElementById('previewTreeModes')) return;
  const label = select.closest('label');
  label?.classList.add('preview-native-view-hidden');

  const modes = document.createElement('div');
  modes.id = 'previewTreeModes';
  modes.className = 'preview-tree-modes';
  modes.setAttribute('aria-label', 'Family tree view');
  modes.innerHTML = `
    <button type="button" class="preview-tree-mode" data-preview-tree-mode="ancestry">Family Fan</button>
    <button type="button" class="preview-tree-mode" data-preview-tree-mode="family">Family Group</button>`;

  const controls = select.closest('.enhanced-tree-controls');
  if (controls) controls.prepend(modes);
  else label?.insertAdjacentElement('beforebegin', modes);

  modes.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preview-tree-mode]');
    if (!button) return;
    setPrimaryView('tree');
    activateTreeMode(button.dataset.previewTreeMode);
  });

  select.addEventListener('change', () => {
    if (select.value !== 'map' && !snapshotActive()) state.lastTreeMode = select.value === 'family' ? 'family' : 'ancestry';
    syncTreeModeButtons();
  });
  syncTreeModeButtons();
}

function setExploreCopy(view) {
  if (!ui.viewTitle || !ui.viewSummary) return;
  if (view === 'places') {
    ui.viewTitle.textContent = 'Places & Journeys';
    ui.viewSummary.textContent = 'Follow where family lives unfolded, where people moved, and which historical events belong to the surrounding landscape rather than to a personal-presence claim.';
    if (ui.treeEyebrow) ui.treeEyebrow.textContent = 'Family geography';
    if (ui.treeHeading) ui.treeHeading.textContent = 'Our family map';
  } else {
    ui.viewTitle.textContent = 'Family Tree';
    ui.viewSummary.textContent = 'Explore the same family relationships through the ancestral fan or the focussed family group.';
    if (ui.treeEyebrow) ui.treeEyebrow.textContent = 'Interactive tree';
    if (ui.treeHeading) ui.treeHeading.textContent = state.lastTreeMode === 'family' ? 'Family group' : 'Family fan';
  }
}

function updatePrimaryTabs(view) {
  document.querySelectorAll('[data-preview-view]').forEach((button) => {
    if (!button.classList.contains('preview-primary-tab')) return;
    const active = button.dataset.previewView === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function setPrimaryView(view) {
  if (!['home', 'tree', 'places', 'story'].includes(view)) return;
  state.view = view;
  updatePrimaryTabs(view);
  document.body.classList.toggle('preview-places-mode', view === 'places');
  ui.home?.classList.toggle('hidden', view !== 'home');
  ui.explore?.classList.toggle('hidden', !['tree', 'places'].includes(view));
  ui.story?.classList.toggle('hidden', view !== 'story');

  ensureTreeModeControls();

  if (view === 'tree') {
    setExploreCopy('tree');
    window.setTimeout(() => activateTreeMode(state.lastTreeMode === 'family' ? 'family' : 'ancestry'), 0);
  } else if (view === 'places') {
    setExploreCopy('places');
    setPerspective('fan');
    window.setTimeout(() => setNativeTreeMode('map'), 0);
  } else if (view === 'story') {
    loadStoryIndex();
  }

  if (view !== 'story') closeStoryReader(false);
  syncTreeModeButtons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  if (!ui.storyIndex || (state.stories && !force)) {
    if (state.stories) renderStoryIndex();
    return;
  }
  ui.storyStatus.textContent = 'Loading family stories...';
  const { data, error } = await supabase
    .from('story_sections')
    .select('id,slug,title,subtitle,summary,line_key,date_from,date_to,hero_place_id,primary_person_id,sort_order,estimated_minutes')
    .eq('status', 'published')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    ui.storyStatus.textContent = '';
    ui.storyIndex.innerHTML = `<div class="story-error">The Story layer could not be loaded: ${esc(error.message)}</div>`;
    return;
  }
  state.stories = data || [];
  ui.storyStatus.textContent = '';
  renderStoryIndex();
}

function renderStoryIndex() {
  if (!ui.storyIndex) return;
  closeStoryReader(false);
  if (!state.stories?.length) {
    ui.storyIndex.innerHTML = '<div class="panel"><p>No story sections are published yet.</p></div>';
    return;
  }
  ui.storyIndex.innerHTML = state.stories.map(storyCard).join('');
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
  ui.storyStatus.textContent = 'Opening story...';
  const sectionResult = await supabase.from('story_sections')
    .select('id,slug,title,subtitle,summary,line_key,date_from,date_to,hero_place_id,primary_person_id,estimated_minutes')
    .eq('slug', slug).eq('status', 'published').eq('is_active', true).single();
  if (sectionResult.error) {
    ui.storyStatus.textContent = '';
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
  ui.storyStatus.textContent = '';
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
  ui.storyBack.classList.remove('hidden');
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
  window.scrollTo({ top: ui.story.offsetTop - 12, behavior: 'smooth' });
}

function closeStoryReader(scroll = true) {
  if (!ui.storyReader || !ui.storyIndex) return;
  ui.storyReader.classList.add('hidden');
  ui.storyReader.replaceChildren();
  ui.storyIndex.classList.remove('hidden');
  ui.storyBack?.classList.add('hidden');
  if (scroll && state.view === 'story') window.scrollTo({ top: ui.story.offsetTop - 12, behavior: 'smooth' });
}

function centrePerson(personId) {
  const select = document.getElementById('centreSelect');
  if (!select || !personId) return;
  if ([...select.options].some((option) => option.value === personId)) {
    select.value = personId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
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
      openStory(story.dataset.storySlug);
      return;
    }
    const personButton = event.target.closest('[data-story-person]');
    if (personButton) {
      centrePerson(personButton.dataset.storyPerson);
      state.lastTreeMode = 'ancestry';
      setPrimaryView('tree');
      return;
    }
    if (event.target.closest('[data-story-map]')) setPrimaryView('places');
  });
  ui.storyBack?.addEventListener('click', () => closeStoryReader(true));
}

function initializePreview() {
  if (state.initialized) return;
  state.initialized = true;
  wireEvents();
  setPrimaryView('home');

  const controlsObserver = new MutationObserver(() => ensureTreeModeControls());
  controlsObserver.observe(ui.appArea || document.body, { childList: true, subtree: true });

  const panel = treePanel();
  if (panel) {
    const panelObserver = new MutationObserver(() => {
      syncTreeModeButtons();
      cleanFamilyGroupCopy();
    });
    panelObserver.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  ensureTreeModeControls();
}

const appObserver = new MutationObserver(() => {
  if (ui.appArea && !ui.appArea.classList.contains('hidden')) initializePreview();
});
if (ui.appArea) {
  appObserver.observe(ui.appArea, { attributes: true, attributeFilter: ['class'] });
  if (!ui.appArea.classList.contains('hidden')) initializePreview();
}
