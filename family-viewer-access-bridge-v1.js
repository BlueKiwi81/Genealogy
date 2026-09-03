import { supabase } from './supabase-client-v1.js';

const REGISTRATION_KEY = 'genealogyRegistrationDraft';

function savedRelatedName() {
  const visible = document.getElementById('registerRelatedTo')?.value
    || document.getElementById('completeRelatedTo')?.value;
  if (String(visible || '').trim()) return String(visible).trim();
  try {
    const draft = JSON.parse(localStorage.getItem(REGISTRATION_KEY) || 'null') || {};
    return String(draft.related_to_name || '').trim();
  } catch {
    return '';
  }
}

function addRelatedName(values) {
  const related = savedRelatedName() || null;
  const apply = (row) => row && typeof row === 'object'
    ? { ...row, related_to_name: related }
    : row;
  return Array.isArray(values) ? values.map(apply) : apply(values);
}

if (!supabase.__familyViewerAccessBridgeInstalled) {
  supabase.__familyViewerAccessBridgeInstalled = true;
  const originalFrom = supabase.from.bind(supabase);

  supabase.from = (relation) => {
    const builder = originalFrom(relation);
    if (relation !== 'access_requests') return builder;

    if (typeof builder.insert === 'function') {
      const originalInsert = builder.insert.bind(builder);
      builder.insert = (values, options) => originalInsert(addRelatedName(values), options);
    }
    if (typeof builder.upsert === 'function') {
      const originalUpsert = builder.upsert.bind(builder);
      builder.upsert = (values, options) => originalUpsert(addRelatedName(values), options);
    }
    return builder;
  };
}
