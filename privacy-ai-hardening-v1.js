function appendAiRetentionDisclosure() {
  const overlay = document.getElementById('familyPolicyOverlay');
  if (!overlay || overlay.dataset.aiRetentionClarified === 'true') return;
  const sections = [...overlay.querySelectorAll('.policy-dialog-body section')];
  const aiSection = sections.find((section) => section.querySelector('h3')?.textContent?.startsWith('4. Automated document analysis'));
  if (!aiSection) return;

  const cleanup = document.createElement('p');
  cleanup.innerHTML = 'For a format that requires a temporary OpenAI File object, the archive attempts to delete it immediately after analysis, retries deletion if necessary, and also creates the temporary file with a <strong>one-hour automatic expiry</strong> as a fail-safe. This expiry does not change OpenAI\'s separate standard abuse-monitoring retention described below.';
  aiSection.appendChild(cleanup);

  const control = document.createElement('p');
  control.innerHTML = 'The application code does not opt family material into model training, data sharing, fine-tuning or evaluation use. OpenAI\'s API default is no training unless the API organisation explicitly opts in. Organisation-level OpenAI Data Controls are account settings outside this website\'s code, so the family archive policy is to keep that optional data sharing <strong>off</strong>.';
  aiSection.appendChild(control);
  overlay.dataset.aiRetentionClarified = 'true';
}

function appendUploadDisclosure() {
  const box = document.querySelector('.source-privacy-box');
  if (!box || box.querySelector('.source-ai-disclosure')) return;
  const note = document.createElement('p');
  note.className = 'source-upload-help source-ai-disclosure';
  note.textContent = 'Supported documents and photos may be sent to OpenAI for private transcription and evidence comparison. The AI reading remains a proposal until reviewed. Full processing and retention details are in Research, Sources & Privacy at the bottom of the page.';
  box.appendChild(note);
}

appendAiRetentionDisclosure();
appendUploadDisclosure();
