import { supabase } from './supabase-client-v1.js';

const message = document.getElementById('contributionMessage');
const seen = new Set();
let running = false;

function setMessage(text, type = '') {
  if (!message) return;
  message.textContent = text;
  message.className = `message${type ? ` ${type}` : ''}`;
}

function evidenceRefs(payload) {
  const raw = Array.isArray(payload?.evidence_items) ? payload.evidence_items : [];
  return raw.map((item) => typeof item === 'string' ? item : item?.id).filter(Boolean);
}

function hasSourceCategory(row) {
  if (row?.contribution_type === 'source') return true;
  const categories = Array.isArray(row?.payload?.categories) ? row.payload.categories : [];
  return categories.includes('source');
}

async function latestOwnSource() {
  const { data:{ session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('contributions')
    .select('id,contribution_type,payload,created_at')
    .eq('submitted_by', session.user.id)
    .order('created_at', { ascending:false })
    .limit(12);
  if (error) throw error;
  return (data || []).find(hasSourceCategory) || null;
}

async function analyzeLatestUpload() {
  if (running) return;
  running = true;
  try {
    const contribution = await latestOwnSource();
    if (!contribution || seen.has(contribution.id)) return;
    seen.add(contribution.id);
    const ids = evidenceRefs(contribution.payload);
    if (!ids.length) return;

    setMessage(`Record saved privately. Reading ${ids.length === 1 ? 'the document' : `${ids.length} documents`} now...`);
    let completed = 0;
    let manual = 0;
    let failed = 0;
    for (const evidenceId of ids) {
      try {
        const { data, error } = await supabase.functions.invoke('evidence-document-review', {
          body:{ action:'analyze', evidence_id:evidenceId, contribution_id:contribution.id },
        });
        if (error || data?.error) throw error || new Error(data.error);
        if (data?.review?.review_status === 'manual_required') manual += 1;
        else completed += 1;
      } catch {
        failed += 1;
      }
    }

    if (failed === ids.length) {
      setMessage('Record submitted safely. Automatic transcription could not finish, so the editor can retry the document analysis from the review desk.', 'success');
    } else {
      const parts = [];
      if (completed) parts.push(`${completed} transcribed`);
      if (manual) parts.push(`${manual} flagged for closer reading`);
      if (failed) parts.push(`${failed} can be retried`);
      const frontier = contribution.payload?.research_frontier === true;
      setMessage(`Record submitted safely. Intelligent document review completed: ${parts.join(', ')}. ${frontier ? 'The research remains provisional on the research frontier until an editor reviews it.' : 'Nothing has changed the family tree until an editor approves the evidence proposals.'}`, 'success');
    }
  } finally {
    running = false;
  }
}

if (message) {
  const observer = new MutationObserver(() => {
    const text = message.textContent || '';
    if (/^Record submitted for review/i.test(text)) analyzeLatestUpload().catch(() => {});
  });
  observer.observe(message, { childList:true, characterData:true,subtree:true });
}
