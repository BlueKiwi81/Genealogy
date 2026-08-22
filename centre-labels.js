import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

const SUPABASE_URL = 'https://jkakvpsiiffnidggcqzc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h_0XIxzs33psSZTyKPGr8w_aJoVLw92';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const select = document.getElementById('centreSelect');
let applying = false;
let lastSignature = '';

function fullName(person) {
  return [person.given_names?.trim(), person.surname?.trim()].filter(Boolean).join(' ') || 'Unnamed person';
}

function year(value) {
  return value ? String(value).slice(0, 4) : '';
}

function lifeSuffix(person) {
  const born = year(person.birth_date);
  const died = year(person.death_date);
  if (born && died) return ` (${born}-${died})`;
  if (born) return ` (b. ${born})`;
  if (died) return ` (d. ${died})`;
  return '';
}

async function applyFullLabels() {
  if (!select || applying || !select.options.length) return;
  const ids = [...select.options].map((option) => option.value).filter(Boolean);
  const signature = ids.join('|');
  if (signature === lastSignature && [...select.options].every((option) => option.dataset.fullLabel === '1')) return;

  applying = true;
  try {
    const { data, error } = await supabase
      .from('people')
      .select('id,given_names,surname,birth_date,death_date')
      .in('id', ids);
    if (error || !data) return;

    const byId = new Map(data.map((person) => [person.id, person]));
    const names = new Map();
    data.forEach((person) => {
      const name = fullName(person);
      names.set(name, (names.get(name) || 0) + 1);
    });

    [...select.options].forEach((option) => {
      const person = byId.get(option.value);
      if (!person) return;
      const name = fullName(person);
      // Years are useful context for everyone, and become especially important when names repeat.
      option.textContent = `${name}${lifeSuffix(person)}`;
      option.dataset.fullLabel = '1';
    });
    lastSignature = signature;
  } finally {
    applying = false;
  }
}

if (select) {
  const observer = new MutationObserver(() => {
    window.setTimeout(applyFullLabels, 0);
  });
  observer.observe(select, { childList: true, subtree: true });
  window.addEventListener('load', () => window.setTimeout(applyFullLabels, 300));
}
