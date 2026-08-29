const SUPABASE_HOST = 'jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_URL = `https://${SUPABASE_HOST}`;
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';

const originalFetch = window.fetch.bind(window);
window.__genealogyOriginalFetch = originalFetch;

let cache = { userId: null, at: 0, changes: [] };

function headerValue(input, init, name) {
  const fromInit = new Headers(init?.headers || {}).get(name);
  if (fromInit) return fromInit;
  if (input instanceof Request) return input.headers.get(name);
  return null;
}

function jwtSubject(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)).sub || null;
  } catch {
    return null;
  }
}

async function pendingChanges(authHeader, userId) {
  const now = Date.now();
  if (cache.userId === userId && now - cache.at < 1200) return cache.changes;
  const params = new URLSearchParams({
    select: 'id,target_person_id,change_type,payload,before_snapshot,base_updated_at,status,created_at',
    submitted_by: `eq.${userId}`,
    status: 'eq.pending',
    order: 'created_at.asc',
  });
  const response = await originalFetch(`${SUPABASE_URL}/rest/v1/tree_change_sets?${params}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: authHeader,
      Accept: 'application/json',
    },
  });
  if (!response.ok) return [];
  const changes = await response.json();
  cache = { userId, at: now, changes: Array.isArray(changes) ? changes : [] };
  return cache.changes;
}

function pseudoPerson(change) {
  const relative = change.payload?.relative || {};
  const deathDate = relative.death_date || null;
  return {
    id: `pending:${change.id}`,
    slug: null,
    given_names: relative.given_names || 'Pending relative',
    surname: relative.surname || null,
    preferred_name: relative.preferred_name || null,
    preferred_name_status: relative.preferred_name ? 'family_supplied' : 'unresolved',
    gender: relative.gender || null,
    birth_date: relative.birth_date || null,
    death_date: deathDate,
    life_status: relative.life_status || (deathDate ? 'deceased' : 'unknown'),
    birth_place: relative.birth_place || null,
    death_place: relative.death_place || null,
    occupation_summary: relative.occupation_summary || null,
    narrative_summary: relative.narrative_summary || null,
    source_status: 'family_supplied',
    privacy_level: 'family',
    created_at: change.created_at,
    updated_at: change.created_at,
    pending_change_id: change.id,
    pending_change_type: 'add_relative',
    is_pending: true,
    is_active: true,
  };
}

// Synthetic pending relatives belong in broad working-tree collection queries.
// They must never be injected into a query that is asking Supabase for a
// specific subset (especially id=eq.<person> / maybeSingle), because doing so
// changes the query's cardinality and can make a valid single-person lookup fail.
function canAppendPendingPeople(url) {
  const harmlessKeys = new Set(['select', 'order', 'limit', 'offset']);
  for (const [key, value] of url.searchParams.entries()) {
    if (harmlessKeys.has(key)) continue;
    if (key === 'is_active' && value === 'eq.true') continue;
    return false;
  }
  return true;
}

function overlayPeople(rows, changes, allowPendingAdditions = true) {
  let people = rows.map((row) => ({ ...row }));
  for (const change of changes) {
    if (change.change_type === 'remove_person') {
      people = people.filter((person) => person.id !== change.target_person_id);
      continue;
    }
    if (change.change_type === 'edit_person') {
      const after = change.payload?.after || {};
      people = people.map((person) => person.id === change.target_person_id
        ? { ...person, ...after, pending_change_id: change.id, pending_change_type: 'edit_person', is_pending: true }
        : person);
      continue;
    }
    if (change.change_type === 'add_relative' && allowPendingAdditions) people.push(pseudoPerson(change));
  }
  return people.filter((person) => person.is_active !== false);
}

function pendingRelationship(change, person1Id, person2Id, type, suffix = '0') {
  return {
    id: `pending-rel:${change.id}:${suffix}`,
    person1_id: person1Id,
    person2_id: person2Id,
    relationship_type: type,
    relationship_status: change.payload?.relationship_status || 'current',
    start_date: change.payload?.start_date || null,
    end_date: change.payload?.end_date || null,
    date_note: change.payload?.date_note || null,
    notes: 'Pending family contribution',
    source_status: 'family_supplied',
    created_at: change.created_at,
    updated_at: change.created_at,
    pending_change_id: change.id,
    is_pending: true,
    is_active: true,
  };
}

function overlayRelationships(rows, changes) {
  let relationships = rows.map((row) => ({ ...row })).filter((row) => row.is_active !== false);
  for (const change of changes) {
    if (change.change_type === 'remove_person') {
      relationships = relationships.filter((r) => r.person1_id !== change.target_person_id && r.person2_id !== change.target_person_id);
      continue;
    }
    if (change.change_type === 'remove_relationship') {
      const relationshipId = change.payload?.relationship_id;
      relationships = relationships.filter((r) => r.id !== relationshipId);
      continue;
    }
    if (change.change_type !== 'add_relative') continue;

    const pendingId = `pending:${change.id}`;
    const targetId = change.target_person_id;
    const role = change.payload?.role;
    if (role === 'parent') {
      relationships.push(pendingRelationship(change, pendingId, targetId, 'parent'));
    } else if (role === 'child') {
      relationships.push(pendingRelationship(change, targetId, pendingId, 'parent'));
    } else if (role === 'spouse' || role === 'partner') {
      relationships.push(pendingRelationship(change, targetId, pendingId, role));
    } else if (role === 'sibling') {
      const parents = relationships.filter((r) => r.relationship_type === 'parent' && r.person2_id === targetId);
      if (parents.length) {
        parents.forEach((parent, index) => relationships.push({
          ...pendingRelationship(change, parent.person1_id, pendingId, 'parent', String(index)),
          relationship_status: 'current',
        }));
      } else {
        relationships.push(pendingRelationship(change, targetId, pendingId, 'sibling'));
      }
    }
  }
  return relationships;
}

function responseWithJson(response, value) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

window.fetch = async function genealogyOverlayFetch(input, init) {
  const response = await originalFetch(input, init);
  try {
    const urlText = typeof input === 'string' ? input : input?.url;
    if (!urlText) return response;
    const url = new URL(urlText, window.location.href);
    if (url.hostname !== SUPABASE_HOST || !response.ok) return response;
    if (!['/rest/v1/people', '/rest/v1/relationships'].includes(url.pathname)) return response;
    if (headerValue(input, init, 'x-genealogy-canonical') === '1') return response;

    const authHeader = headerValue(input, init, 'authorization');
    if (!authHeader?.startsWith('Bearer ')) return response;
    window.__genealogyAuthHeader = authHeader;
    const userId = jwtSubject(authHeader.slice(7));
    if (!userId) return response;

    const rows = await response.clone().json();
    if (!Array.isArray(rows)) return response;
    const changes = await pendingChanges(authHeader, userId);
    if (!changes.length) {
      const activeRows = rows.filter((row) => row.is_active !== false);
      return activeRows.length === rows.length ? response : responseWithJson(response, activeRows);
    }

    const overlaid = url.pathname.endsWith('/people')
      ? overlayPeople(rows, changes, canAppendPendingPeople(url))
      : overlayRelationships(rows, changes);
    return responseWithJson(response, overlaid);
  } catch {
    return response;
  }
};

function clearPendingCache() {
  cache = { userId: null, at: 0, changes: [] };
}

document.addEventListener('genealogy:tree-suggestions-updated', clearPendingCache);

// One interaction stack only. Research-frontier loads the UI polish,
// explorer controls, interaction guard and frontier-alternate layer.
import('./research-frontier-v1.js?v=6').catch(() => {});
