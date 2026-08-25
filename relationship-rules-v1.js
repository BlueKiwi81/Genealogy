// A family centre includes any recorded spouse or partner unless the
// relationship is explicitly a divorce. Life status does not affect inclusion.

export function isDivorcedRelationship(relationship) {
  return relationship?.relationship_type === 'former_spouse'
    || relationship?.relationship_status === 'divorced';
}

function familyPartnerPriority(relationship) {
  if (relationship?.relationship_status === 'current') return 5;
  if (relationship?.relationship_status === 'ended_by_death') return 4;
  if (relationship?.relationship_status === 'historical') return 3;
  if (relationship?.relationship_status === 'ended') return 2;
  return 1;
}

export function preferredFamilyPartnerEntry(entries = []) {
  return entries
    .filter((entry) => ['spouse', 'partner'].includes(entry?.relationship?.relationship_type)
      && !isDivorcedRelationship(entry.relationship))
    .sort((a, b) => familyPartnerPriority(b.relationship) - familyPartnerPriority(a.relationship))[0]
    || null;
}
