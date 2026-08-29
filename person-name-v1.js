const clean = (value) => String(value ?? '').trim();

function sameSurname(a, b) {
  return clean(a).localeCompare(clean(b), undefined, { sensitivity: 'base' }) === 0;
}

export function birthSurname(person) {
  return clean(person?.birth_surname) || clean(person?.surname) || clean(person?.current_surname);
}

export function currentSurname(person) {
  return clean(person?.current_surname) || clean(person?.birth_surname) || clean(person?.surname);
}

function givenNames(person, shortGiven = false) {
  const value = clean(person?.given_names);
  if (!shortGiven) return value;
  return value.split(/\s+/)[0] || '';
}

// Tree and ancestry views always identify people by their birth surname.
export function ancestryName(person, { shortGiven = false, unknown = 'Unknown' } = {}) {
  if (!person) return unknown;
  return [givenNames(person, shortGiven), birthSurname(person)].filter(Boolean).join(' ') || unknown;
}

// Record views lead with the later/current surname and retain the birth surname.
export function recordName(person, { shortGiven = false, unknown = 'Unknown' } = {}) {
  if (!person) return unknown;
  const given = givenNames(person, shortGiven);
  const birth = birthSurname(person);
  const current = currentSurname(person);
  const main = [given, current || birth].filter(Boolean).join(' ') || unknown;
  return birth && current && !sameSurname(birth, current) ? `${main} (born ${birth})` : main;
}

export function surnameSearchText(person) {
  return [person?.surname, person?.birth_surname, person?.current_surname]
    .map(clean)
    .filter(Boolean)
    .join(' ');
}
