import { supabase } from './supabase-client-v1.js';

const form = document.getElementById('contributionForm');
const typeSelect = document.getElementById('contributionType');
const contributionMessage = document.getElementById('contributionMessage');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeUrl(value) {
  const text = String(value || '').trim();
  if (!/^https:\/\//i.test(text)) return null;
  return text;
}

function recommendationLabel(value) {
  const labels = {
    used_successfully: 'Used successfully by this family',
    recommended: 'Recommended',
    referred_not_yet_used: 'Referred to us - not yet fully tested',
    useful: 'Useful research route',
    advanced: 'More advanced',
  };
  return labels[value] || 'Useful research route';
}

function resourceGroup(resource) {
  if (['website', 'document_service', 'cemetery'].includes(resource.resource_type)) return 'online';
  if (['archive', 'church_archive'].includes(resource.resource_type)) return 'archives';
  return 'people';
}

function renderResource(resource) {
  const url = safeUrl(resource.url);
  const name = escapeHtml(resource.name);
  const description = escapeHtml(resource.description);
  const guidance = resource.guidance ? `<p class="research-resource-guidance">${escapeHtml(resource.guidance)}</p>` : '';
  const status = escapeHtml(recommendationLabel(resource.recommendation_status));
  const links = [];
  if (url) links.push(`<a class="button secondary research-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open website</a>`);
  if (resource.email) links.push(`<a class="button ghost research-link" href="mailto:${encodeURIComponent(resource.email)}">${escapeHtml(resource.email)}</a>`);
  return `
    <article class="research-resource-card">
      <div class="research-resource-head">
        <h4>${name}</h4>
        <span class="research-status">${status}</span>
      </div>
      <p>${description}</p>
      ${guidance}
      ${links.length ? `<div class="research-resource-actions">${links.join('')}</div>` : ''}
    </article>`;
}

async function loadResearchResources(container) {
  if (!container || container.dataset.loaded === 'true') return;
  container.innerHTML = '<p class="small">Loading the family research directory...</p>';
  const { data, error } = await supabase
    .from('research_resources')
    .select('resource_type,name,description,url,email,recommendation_status,guidance,sort_order')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    container.innerHTML = '<p class="message error">The research directory could not be loaded. Please check that you are signed in with approved family access.</p>';
    return;
  }

  const groups = { online: [], archives: [], people: [] };
  for (const item of data || []) groups[resourceGroup(item)].push(item);

  container.innerHTML = `
    <section class="research-resource-group">
      <h3>Start online</h3>
      <p class="small">These are useful first stops for locating records, indexes and archive references.</p>
      <div class="research-resource-grid">${groups.online.map(renderResource).join('')}</div>
    </section>
    <section class="research-resource-group">
      <h3>Archives and church records</h3>
      <p class="small">Use these when the record exists but is not available as a downloadable image online.</p>
      <div class="research-resource-grid">${groups.archives.map(renderResource).join('')}</div>
    </section>
    <section class="research-resource-group">
      <h3>Researchers and record retrieval</h3>
      <p class="small">The notes below distinguish people we have used successfully from people who were professionally referred to us but whom we have not yet tested through a completed commission.</p>
      <div class="research-resource-grid">${groups.people.map(renderResource).join('')}</div>
    </section>`;
  container.dataset.loaded = 'true';
}

function installContributionTabs() {
  if (!form || !typeSelect || document.getElementById('contributionModeTabs')) return;
  const panel = form.closest('.panel');
  if (!panel) return;

  const heading = panel.querySelector('h2');
  if (heading) heading.textContent = 'Contribute and research';

  const tabs = document.createElement('div');
  tabs.id = 'contributionModeTabs';
  tabs.className = 'contribution-mode-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.innerHTML = `
    <button class="contribution-mode-tab is-active" data-mode="share" type="button" role="tab" aria-selected="true">Share information</button>
    <button class="contribution-mode-tab" data-mode="upload" type="button" role="tab" aria-selected="false">Upload a record</button>
    <button class="contribution-mode-tab" data-mode="research" type="button" role="tab" aria-selected="false">Research Help</button>`;
  form.before(tabs);

  const research = document.createElement('div');
  research.id = 'researchHelpPanel';
  research.className = 'research-help-panel hidden';
  research.innerHTML = `
    <div class="research-intro">
      <p class="eyebrow">Research Help</p>
      <h3>Looking for evidence?</h3>
      <p>Family knowledge matters, but the tree becomes more reliable when we can connect it to the record that supports it. Use the resources below to look for civil, church, estate, grave and family records.</p>
    </div>
    <div class="research-baseline">
      <h3>What counts as evidence here?</h3>
      <p><strong>Documented</strong> means that a reviewed record directly supports the particular claim and we are satisfied that it belongs to the right person. It does not mean that every fact about that person is proved.</p>
      <p><strong>Family documented</strong> covers material such as a family Bible, handwritten notes, a labelled photograph, a family booklet, a funeral leaflet or other retained family document. These are real documentary sources, while still being identified as family material rather than an official civil or church record.</p>
      <p><strong>Family supplied</strong> is information or recollection supplied by a family member where no supporting document has yet been attached. Strong, probable, hypothesis and unresolved statuses are used where the evidence requires more caution.</p>
    </div>
    <div class="research-steps">
      <h3>When you find something</h3>
      <ol>
        <li>Save or download the original image or document if the website permits it.</li>
        <li>Keep the full source reference: website address, archive reference, film or image number, congregation, cemetery or repository.</li>
        <li>Keep enough context to identify the record. Where possible, do not crop away headings, page numbers or neighbouring information that helps locate it again.</li>
        <li>Return here, select the relevant person and choose <strong>Upload a record</strong>.</li>
        <li>Tell us what you think the record shows. The original is stored privately and the app will attempt an intelligent transcription and evidence comparison. The AI reading remains a proposal until an editor accepts it.</li>
      </ol>
      <p class="small">An index, family-tree entry or search result can be a very useful lead. Where an underlying original record exists, we prefer to attach and assess that record before calling the claim documented.</p>
    </div>
    <div id="researchResourceDirectory" class="research-resource-directory"></div>`;
  form.after(research);

  function setMode(mode) {
    for (const button of tabs.querySelectorAll('.contribution-mode-tab')) {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    const isResearch = mode === 'research';
    form.classList.toggle('hidden', isResearch);
    contributionMessage?.classList.toggle('hidden', isResearch);
    research.classList.toggle('hidden', !isResearch);

    if (mode === 'upload') {
      typeSelect.value = 'source';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (mode === 'share' && typeSelect.value === 'source') {
      typeSelect.value = 'story';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (mode === 'research') {
      loadResearchResources(document.getElementById('researchResourceDirectory'));
    }
  }

  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode]');
    if (button) setMode(button.dataset.mode);
  });

  typeSelect.addEventListener('change', () => {
    const current = tabs.querySelector('.contribution-mode-tab.is-active')?.dataset.mode;
    if (current === 'research') return;
    const mode = typeSelect.value === 'source' ? 'upload' : 'share';
    for (const button of tabs.querySelectorAll('.contribution-mode-tab')) {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  });
}

function policyMarkup() {
  return `
    <div class="policy-dialog" role="dialog" aria-modal="true" aria-labelledby="familyPolicyTitle">
      <div class="policy-dialog-head">
        <div><p class="eyebrow">Family archive policy</p><h2 id="familyPolicyTitle">Research, sources and privacy</h2></div>
        <button id="closeFamilyPolicy" class="button ghost" type="button" aria-label="Close policy">Close</button>
      </div>
      <div class="policy-dialog-body">
        <section>
          <h3>1. Evidence and source policy</h3>
          <p>We keep the source and the claim separate. A document can be genuine without proving every conclusion attached to it. A claim becomes documented only after the record has been reviewed for identity, relevance and what it actually establishes.</p>
          <p>Official civil, church, estate and archival records can support a <strong>documented</strong> status. Family Bibles, handwritten notes, labelled photographs, booklets, funeral leaflets and similar retained material can support a <strong>family documented</strong> status. Information supplied without an attached record normally remains <strong>family supplied</strong> until stronger evidence is found.</p>
          <p>Indexes, online family trees and researcher suggestions are useful leads, but they do not become official proof simply because they appear online. Conflicting or uncertain evidence remains visible rather than being silently harmonised.</p>
        </section>
        <section>
          <h3>2. Private family access</h3>
          <p>The application itself is delivered through a public website, but the family database is not intended as a public genealogy database. Family records are fetched only for signed-in users whose family access has been approved. Database access is controlled by row-level access rules rather than by merely hiding information on the page.</p>
          <p>Uploaded evidence is stored in a private file bucket. New uploads begin as restricted and pending review. The original file is not given a public file address.</p>
        </section>
        <section>
          <h3>3. Living family members</h3>
          <p>We take a conservative approach to living people. The ordinary family profile is not intended to store or display full identity numbers, private addresses, phone numbers, email addresses, medical information or intimate personal information. If a historical source contains such details about a living person, the source can be retained privately without exposing those details in the family profile.</p>
          <p>Approved family access is not permission to republish another living person's private information outside the family archive.</p>
        </section>
        <section>
          <h3>4. Automated document analysis and OpenAI</h3>
          <p>When an approved family contributor uploads a supported document or photograph, the archive may send that file to the OpenAI API so that it can be transcribed and compared with the selected person's existing family record. The AI is asked to preserve uncertain handwriting, identify names, dates, places and relationships, flag conflicts and privacy concerns, and propose claim-level evidence changes. Its output is a review proposal, not an automatic authority over the family tree.</p>
          <p>The original source remains in the archive's private Supabase storage. For supported PDFs and ordinary image formats, the current implementation sends the file content directly for analysis and sets the OpenAI response request to <strong>store: false</strong>. It does not create a persistent OpenAI File object for those files. If a file format requires a temporary OpenAI File object for processing, that temporary file is deleted immediately after the analysis attempt, including when analysis fails.</p>
          <p>OpenAI states that data sent through the API is not used to train or improve its models unless the API organisation explicitly opts in to share data. This family archive is designed on the basis that we do <strong>not</strong> opt in to training or data sharing. The archive does not use uploaded family material for fine-tuning or training.</p>
          <p>Setting <strong>store: false</strong> avoids keeping the response as ordinary application state, but it is not the same as a contractual zero-retention service. OpenAI's standard API may retain customer content in abuse-monitoring logs for up to 30 days unless the API organisation has separately been approved for Zero Data Retention or Modified Abuse Monitoring. We therefore do not promise that automated analysis means the document never temporarily leaves Supabase.</p>
          <p>Documents that contain information about living people remain restricted. The automated review also looks for identity numbers, addresses, personal contact information, signatures, medical information and similar sensitive material and flags the source for conservative handling without intentionally copying those sensitive values into the ordinary family profile.</p>
          <p>The online research assistant is disabled when a person is living or the record does not establish that they are deceased. When it researches a deceased person, identifying details for living or potentially living relatives are withheld from the AI request. Its search results remain provisional research leads and cannot change the canonical tree without human review.</p>
        </section>
        <section>
          <h3>5. Contributions, acknowledgement and ownership</h3>
          <p>We keep cumulative provenance: who supplied information, suggested a correction, contributed research, supplied a record or added a photograph. Later contributions do not replace earlier contributors. A person's profile may therefore acknowledge several family researchers and contributors over time.</p>
          <p>We preserve this acknowledgement without needing to expose a contributor's private contact details to other family members.</p>
          <p>Voice recollections may be recorded in English or Afrikaans. The original audio remains oral, family-supplied evidence. After review, an editor may add a transcript or an edited narrative, but the transcript does not convert recollection into documentary proof.</p>
          <p>Uploading a family document allows it to be retained and used for family-history research. It does not transfer copyright or ownership of the original material to the family archive.</p>
        </section>
        <section>
          <h3>6. Corrections and restrictions</h3>
          <p>Family members may submit corrections and may ask for information about themselves to be reviewed or restricted. The editor can retain research provenance without continuing to display information that should not be shown in an ordinary living-person profile.</p>
        </section>
        <section>
          <h3>7. Security</h3>
          <p>We use authentication, approved-family access rules, private file storage and editor-only review controls to reduce the risk of unauthorised access. No online system can promise absolute security, so we also minimise the sensitive information we store and keep raw source documents more restricted than ordinary family-tree information.</p>
        </section>
      </div>
    </div>`;
}

function installPolicyLink() {
  if (document.getElementById('familyPolicyFooter')) return;
  const shell = document.querySelector('.app-shell') || document.body;
  const footer = document.createElement('footer');
  footer.id = 'familyPolicyFooter';
  footer.className = 'family-policy-footer';
  footer.innerHTML = `<button id="openFamilyPolicy" class="family-policy-link" type="button">Research, Sources & Privacy</button><span>Private family research archive</span>`;
  shell.appendChild(footer);

  const overlay = document.createElement('div');
  overlay.id = 'familyPolicyOverlay';
  overlay.className = 'policy-overlay hidden';
  overlay.innerHTML = policyMarkup();
  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.add('hidden');
    document.body.classList.remove('policy-open');
  };
  const open = () => {
    overlay.classList.remove('hidden');
    document.body.classList.add('policy-open');
    document.getElementById('closeFamilyPolicy')?.focus();
  };

  document.getElementById('openFamilyPolicy')?.addEventListener('click', open);
  document.getElementById('closeFamilyPolicy')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });
}

installContributionTabs();
installPolicyLink();
