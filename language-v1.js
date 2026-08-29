import { supabase } from './supabase-client-v1.js';

const LANGUAGE_KEY = 'genealogyLanguage';
const SUPPORTED = new Set(['en', 'af']);
const textState = new WeakMap();
const attributeState = new WeakMap();
const aiMemory = new Map();
const aiInFlight = new Map();
let currentLanguage = SUPPORTED.has(localStorage.getItem(LANGUAGE_KEY)) ? localStorage.getItem(LANGUAGE_KEY) : 'en';
let applying = false;
let aiScanTimer = null;

const AF = new Map(Object.entries({
  'Our Family History': 'Ons Familiegeskiedenis',
  'Shared family history': 'Gedeelde familiegeskiedenis',
  'Our Family Tree': 'Ons Familieboom',
  'Make me the centre': 'Plaas my in die middel',
  'Sign out': 'Meld af',
  'Family access': 'Familietoegang',
  'Welcome to the family archive': 'Welkom by die familieargief',
  'New relatives register once and verify their email with a code. Returning family members sign in with a code sent to their email address. Nobody needs to create or remember a password.': 'Nuwe familielede registreer eenmalig en bevestig hul e-pos met n kode. Terugkerende familielede meld aan met n kode wat na hul e-posadres gestuur word. Niemand hoef n wagwoord te skep of te onthou nie.',
  'Already registered?': 'Reeds geregistreer?',
  'Use the email address you registered with.': 'Gebruik die e-posadres waarmee jy geregistreer het.',
  'Email address': 'E-posadres',
  'Send sign-in code': 'Stuur aanmeldkode',
  'Register for family access': 'Registreer vir familietoegang',
  'Your details help the family editor identify the correct person before access is approved.': 'Jou besonderhede help die familieredakteur om die regte persoon te identifiseer voordat toegang goedgekeur word.',
  'First name': 'Voornaam',
  'Middle name(s)': 'Middelnaam(name)',
  'Last name': 'Van',
  'Date of birth': 'Geboortedatum',
  'Email me when there are family-tree updates relevant to me. This is optional.': 'E-pos my wanneer daar opdaterings aan die familieboom is wat vir my relevant is. Dit is opsioneel.',
  'Your date of birth helps us match you to the right family record, but it does not automatically grant access. The family editor still approves every registration.': 'Jou geboortedatum help ons om jou met die regte familierekord te verbind, maar dit gee nie outomaties toegang nie. Die familieredakteur keur steeds elke registrasie goed.',
  'Register and send code': 'Registreer en stuur kode',
  'Email verification': 'E-posbevestiging',
  'Enter your verification code': 'Voer jou bevestigingskode in',
  'We sent a code to': 'Ons het n kode gestuur na',
  'Use the code from the newest email you received.': 'Gebruik die kode uit die nuutste e-pos wat jy ontvang het.',
  'Verification code': 'Bevestigingskode',
  'Verify code': 'Bevestig kode',
  'Use a different email': 'Gebruik n ander e-posadres',
  'Complete registration': 'Voltooi registrasie',
  'Tell us who you are': 'Vertel ons wie jy is',
  'Your email is verified. These details allow the family editor to link your login to the correct person in the family tree.': 'Jou e-pos is bevestig. Hierdie besonderhede help die familieredakteur om jou aanmelding aan die regte persoon in die familieboom te koppel.',
  'Verified email': 'Bevestigde e-pos',
  'Submit access request': 'Dien toegangsversoek in',
  'Awaiting approval': 'Wag op goedkeuring',
  'Family member': 'Familielid',
  'Current view': 'Huidige aansig',
  'Family network': 'Familienetwerk',
  'Choose a person to place them at the centre of the tree.': 'Kies n persoon om hom of haar in die middel van die boom te plaas.',
  'Contribution model': 'Bydraemodel',
  'Family members can build their working tree directly. Proposed edits stay reversible until reviewed; approved information becomes part of the shared canonical tree.': 'Familielede kan direk aan hul werkende boom bou. Voorgestelde wysigings bly omkeerbaar totdat dit nagegaan is; goedgekeurde inligting word deel van die gedeelde kanonieke boom.',
  'Interactive tree': 'Interaktiewe boom',
  'Family fan': 'Familiewaaier',
  'Centre person': 'Middelpersoon',
  'Selected person': 'Geselekteerde persoon',
  'Choose a person': 'Kies n persoon',
  'Help build the archive': 'Help bou aan die argief',
  'Suggest information': 'Stel inligting voor',
  'What are you adding?': 'Wat voeg jy by?',
  'Story or recollection': 'Storie of herinnering',
  'Nickname / known as': 'Bynaam / bekend as',
  'Correction': 'Regstelling',
  'Date': 'Datum',
  'Place': 'Plek',
  'Relationship': 'Verwantskap',
  'New person': 'Nuwe persoon',
  'Source or record': 'Bron of rekord',
  'Other': 'Ander',
  'Language': 'Taal',
  'Information': 'Inligting',
  'Write in whichever language is most natural to you.': 'Skryf in die taal wat vir jou die natuurlikste is.',
  'Submit for review': 'Dien in vir hersiening',
  'Family editor': 'Familieredakteur',
  'Review and approval desk': 'Hersiening en goedkeuring',
  'Approve family access, live tree changes and submitted stories while preserving the original evidence.': 'Keur familietoegang, lewende boomwysigings en ingediende verhale goed terwyl die oorspronklike bewysmateriaal behoue bly.',
  'Refresh queues': 'Verfris rye',
  'New relatives': 'Nuwe familielede',
  'Access requests': 'Toegangsversoeke',
  'Family submissions': 'Familiebydraes',
  'Contribution queue': 'Bydraery',
  'View': 'Aansig',
  'Family view': 'Familie-aansig',
  'Person ancestry': 'Persoon se voorgeslag',
  'Map view': 'Kaartaansig',
  'Generations': 'Generasies',
  'Auto': 'Outo',
  'Hide controls': 'Versteek kontroles',
  'Show controls': 'Wys kontroles',
  'Building the family view': 'Bou die familie-aansig',
  'Loading people, relationships and research notes...': 'Laai persone, verwantskappe en navorsingsnotas...',
  'Unknown': 'Onbekend',
  'Known as': 'Bekend as',
  'Life': 'Lewensdatums',
  'Birthplace': 'Geboorteplek',
  'Death place': 'Sterfplek',
  'Occupation': 'Beroep',
  'Former spouse': 'Voormalige eggenoot',
  'Partner': 'Lewensmaat',
  'Spouse': 'Eggenoot',
  'Source status': 'Bronstatus',
  'Family note': 'Familienota',
  'Children': 'Kinders',
  'Siblings': 'Broers en susters',
  'Research lead': 'Navorsingsleidraad',
  'FRONTIER': 'NAVORSINGSFRONT',
  'alternate': 'alternatief',
  'Documented': 'Gedokumenteer',
  'documented': 'gedokumenteer',
  'Strong': 'Sterk',
  'strong': 'sterk',
  'Family supplied': 'Deur familie verskaf',
  'family supplied': 'deur familie verskaf',
  'Probable': 'Waarskynlik',
  'probable': 'waarskynlik',
  'Hypothesis': 'Hipotese',
  'hypothesis': 'hipotese',
  'Unresolved': 'Onopgelos',
  'unresolved': 'onopgelos',
  'Established': 'Vasgestel',
  'Candidate': 'Kandidaat',
  'Loading historical places only for this map view...': 'Laai slegs historiese plekke vir hierdie kaartaansig...',
  'Documented places are shown by dynamically calculated family branch. Routes appear only when movement has been separately evidenced.': 'Gedokumenteerde plekke word volgens die dinamies berekende familietak gewys. Roetes verskyn slegs waar beweging afsonderlik bewys is.',
  'Loading reviewed historical event locations...': 'Laai nagegane historiese gebeurtenisplekke...',
  'Map view could not load.': 'Die kaartaansig kon nie laai nie.',
  'The ordinary family tree is still available.': 'Die gewone familieboom is steeds beskikbaar.',
  'Map view is unavailable. Family and ancestry views are unaffected.': 'Die kaartaansig is nie beskikbaar nie. Die familie- en voorgeslagaansigte word nie geraak nie.',
  'The family data could not be loaded. This is usually temporary.': 'Die familiedata kon nie gelaai word nie. Dit is gewoonlik tydelik.',
  'Try loading again': 'Probeer weer laai',
  'Loading family archive...': 'Laai familieargief...',
  'Submitting your family access request...': 'Dien jou familietoegangsversoek in...',
  'Your family access must be approved before you can submit information.': 'Jou familietoegang moet goedgekeur wees voordat jy inligting kan indien.',
  'Thank you. Your information has been saved for review.': 'Dankie. Jou inligting is vir hersiening gestoor.',
  'Refreshing family archive...': 'Verfris familieargief...',
  'Your email is verified. Complete these details so the family editor can identify you.': 'Jou e-pos is bevestig. Voltooi hierdie besonderhede sodat die familieredakteur jou kan identifiseer.',
  'Registration received. You will be able to enter the archive once approved.': 'Registrasie ontvang. Jy sal die argief kan binnegaan sodra dit goedgekeur is.',
  'Family tools': 'Familiehulpmiddels',
  'Birthday calendar': 'Verjaarsdagkalender',
  'Subscribe once and your calendar will stay in step with the family tree. Living birthdays use recorded dates only; memorial birthdays follow the relationship and milestone rules.': 'Teken een keer in en jou kalender bly met die familieboom gesinchroniseer. Verjaarsdae van lewende persone gebruik slegs aangetekende datums; herdenkingsverjaarsdae volg die verwantskap- en mylpaalreels.',
  'Who should I see?': 'Wie moet ek sien?',
  'Close family - recommended': 'Nabye familie - aanbeveel',
  'Extended family': 'Uitgebreide familie',
  'All living family': 'Alle lewende familie',
  'Custom only': 'Slegs eie keuses',
  'Close family follows your place in the tree. Custom choices below can always add or remove a particular relative.': 'Nabye familie volg jou plek in die boom. Eie keuses hieronder kan altyd n bepaalde familielid byvoeg of verwyder.',
  'Show the age the person will turn.': 'Wys die ouderdom wat die persoon sal word.',
  'Include significant "would have been" birthdays for close or significant deceased relatives.': 'Sluit betekenisvolle "sou geword het"-verjaarsdae vir nabye of belangrike oorlede familielede in.',
  'Include five-year birthday milestones for children who died young, for their closest family.': 'Sluit vyfjaarlikse verjaarsdagmylpale vir kinders wat jonk gesterf het vir hul naaste familie in.',
  'Create calendar subscription': 'Skep kalenderintekening',
  'Reactivate calendar': 'Heraktiveer kalender',
  'Save calendar choices': 'Stoor kalenderkeuses',
  'Subscribe on this device': 'Teken op hierdie toestel in',
  'Copy subscription link': 'Kopieer intekeningskakel',
  'Reset private link': 'Stel private skakel terug',
  'Pause subscription': 'Onderbreek intekening',
  'Selected relative': 'Geselekteerde familielid',
  'Birthday calendar preference': 'Verjaarsdagkalendervoorkeur',
  'Use relationship rules': 'Gebruik verwantskapreels',
  'Always include': 'Sluit altyd in',
  'Do not include': 'Moenie insluit nie',
  'For a living relative, "Always include" adds their annual birthday regardless of scope. For a deceased relative, it allows the memorial milestone rules to apply.': 'Vir n lewende familielid voeg "Sluit altyd in" sy of haar jaarlikse verjaarsdag by ongeag die omvang. Vir n oorlede familielid laat dit die herdenkingsmylpaalreels geld.',
  'No calendar subscription yet.': 'Nog geen kalenderintekening nie.',
  'Your calendar subscription is active and will refresh from the family database.': 'Jou kalenderintekening is aktief en sal uit die familiedatabasis verfris.',
  'Your calendar subscription is paused.': 'Jou kalenderintekening is onderbreek.',
  'Creating your private calendar link...': 'Skep jou private kalenderskakel...',
  'Calendar subscription ready. Use "Subscribe on this device" or copy the link for another calendar app.': 'Kalenderintekening gereed. Gebruik "Teken op hierdie toestel in" of kopieer die skakel vir n ander kalenderprogram.',
  'Saving calendar choices...': 'Stoor kalenderkeuses...',
  'Calendar choices saved.': 'Kalenderkeuses gestoor.',
  'Subscription link copied. In Google Calendar or Outlook, add it as a calendar from URL.': 'Intekeningskakel gekopieer. Voeg dit in Google Calendar of Outlook as n kalender vanaf n URL by.',
  'Copy this private calendar subscription link:': 'Kopieer hierdie private kalenderintekeningskakel:',
  'Reset the private calendar link? The old subscription URL will stop working immediately.': 'Stel die private kalenderskakel terug? Die ou intekenings-URL sal onmiddellik ophou werk.',
  'Resetting the private link...': 'Stel die private skakel terug...',
  'Private link reset. Re-subscribe any calendar that used the old link.': 'Private skakel teruggestel. Teken weer in op enige kalender wat die ou skakel gebruik het.',
  'Pausing the calendar subscription...': 'Onderbreek die kalenderintekening...',
  'Calendar subscription paused. Existing calendar apps will no longer receive this feed.': 'Kalenderintekening onderbreek. Bestaande kalenderprogramme sal nie meer hierdie voer ontvang nie.',
  'Saving this relative preference...': 'Stoor hierdie familielidvoorkeur...',
  'Relative preference saved.': 'Familielidvoorkeur gestoor.',
  'Please sign in again to change your calendar.': 'Meld asseblief weer aan om jou kalender te verander.',
  'The birthday calendar could not be updated.': 'Die verjaarsdagkalender kon nie opgedateer word nie.',
  'Unable to create the calendar.': 'Die kalender kon nie geskep word nie.',
  'Unable to save the calendar choices.': 'Die kalenderkeuses kon nie gestoor word nie.',
  'Unable to reset the private link.': 'Die private skakel kon nie teruggestel word nie.',
  'Unable to pause the calendar.': 'Die kalender kon nie onderbreek word nie.',
  'Unable to save this relative preference.': 'Hierdie familielidvoorkeur kon nie gestoor word nie.',
  'Research candidate': 'Navorsingskandidaat',
  'Status': 'Status',
  'Research frontier - lower confidence than a normal hypothesis': 'Navorsingsfront - laer sekerheid as n gewone hipotese',
  'Displayed position': 'Vertoonde posisie',
  'Date / period': 'Datum / tydperk',
  'Why this lead matters': 'Waarom hierdie leidraad saak maak',
  'Evidence note': 'Bewysnota',
  'Interpretation': 'Interpretasie',
  'This grey position is a research visualisation only. It does not create or assert a canonical parent-child relationship.': 'Hierdie grys posisie is slegs n navorsingsvisualisering. Dit skep of beweer nie n kanonieke ouer-kind-verhouding nie.',
  'Other live candidates in this slot': 'Ander aktiewe kandidate in hierdie posisie',
  'mother': 'moeder',
  'father': 'vader',
  'parent': 'ouer',
  'the linked ancestor': 'die gekoppelde voorouer',
  'South African War / Anglo-Boer War': 'Suid-Afrikaanse Oorlog / Anglo-Boereoorlog',
  'First World War': 'Eerste Wereldoorlog',
  'Second World War': 'Tweede Wereldoorlog',
  'No information currently known': 'Geen inligting tans bekend nie',
  'Family information recorded; details not yet supplied': 'Familie-inligting is aangeteken; besonderhede is nog nie verskaf nie',
  'Lived': 'Het gewoon',
  'Final resting place': 'Laaste rusplek',
  'Military / other service': 'Militere / ander diens',
  'More about this person': 'Meer oor hierdie persoon',
  'Print this view': 'Druk hierdie aansig',
  'Family tree': 'Familieboom',
}));

const MONTHS = new Map([
  ['Jan', 'Jan'], ['January', 'Januarie'], ['Feb', 'Feb'], ['February', 'Februarie'],
  ['Mar', 'Mrt'], ['March', 'Maart'], ['Apr', 'Apr'], ['April', 'April'], ['May', 'Mei'],
  ['Jun', 'Jun'], ['June', 'Junie'], ['Jul', 'Jul'], ['July', 'Julie'], ['Aug', 'Aug'], ['August', 'Augustus'],
  ['Sep', 'Sep'], ['Sept', 'Sep'], ['September', 'September'], ['Oct', 'Okt'], ['October', 'Oktober'],
  ['Nov', 'Nov'], ['November', 'November'], ['Dec', 'Des'], ['December', 'Desember'],
]);

function preserveWhitespace(original, translated) {
  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';
  return `${leading}${translated}${trailing}`;
}

function translateDynamic(core) {
  let match;
  if ((match = core.match(/^Auto \((\d+) of (\d+)\)$/))) return `Outo (${match[1]} van ${match[2]})`;
  if ((match = core.match(/^Auto \((\d+)\)$/))) return `Outo (${match[1]})`;
  if ((match = core.match(/^\+(\d+) alternate$/))) return `+${match[1]} alternatief`;
  if ((match = core.match(/^Possible (mother|father|parent) slot of (.+)$/))) {
    const slot = AF.get(match[1]) || match[1];
    return `Moontlike ${slot}posisie van ${match[2]}`;
  }
  if ((match = core.match(/^Research frontier candidate: (.+)\. Show research notes\.$/))) {
    return `Navorsingsfrontkandidaat: ${match[1]}. Wys navorsingsnotas.`;
  }
  if ((match = core.match(/^Family fan for (.+) and (.+)$/))) return `Familiewaaier vir ${match[1]} en ${match[2]}`;
  if ((match = core.match(/^Ancestor fan centred on (.+)$/))) return `Voorouerwaaier met ${match[1]} in die middel`;
  if ((match = core.match(/^(.+) - map$/))) return `${match[1]} - kaart`;
  if ((match = core.match(/^(\d+) people loaded\. Showing (\d+) of (\d+) research-depth generations\.$/))) {
    return `${match[1]} persone gelaai. Wys ${match[2]} van ${match[3]} generasies volgens navorsingsdiepte.`;
  }
  if ((match = core.match(/^Research reaches (\d+) generations\. For responsiveness this view renders (\d+) at a time; re-centre an older ancestor to explore further\.$/))) {
    return `Navorsing strek oor ${match[1]} generasies. Vir werkverrigting wys hierdie aansig ${match[2]} op n slag; plaas n ouer voorouer in die middel om verder te verken.`;
  }
  if ((match = core.match(/^Generation depth follows the deepest recorded or active research-frontier ancestry \((\d+) generations\)\.$/))) {
    return `Generasiediepte volg die diepste aangetekende of aktiewe voorgeslag aan die navorsingsfront (${match[1]} generasies).`;
  }
  if ((match = core.match(/^(\d+) sibling(?:s)? and (\d+) child(?:ren)? shown for this focus family\.$/))) {
    return `${match[1]} broer/suster en ${match[2]} kind(ers) word vir hierdie fokusfamilie gewys.`;
  }
  if ((match = core.match(/^Family snapshot: parents and grandparents above (.+), siblings at the same generation, with children, partners and grandchildren grouped clearly below\.$/))) {
    return `Familie-oorsig: ouers en grootouers bo ${match[1]}, broers en susters in dieselfde generasie, met kinders, lewensmaats en kleinkinders duidelik onder gegroepeer.`;
  }
  if ((match = core.match(/^Concentration camp: (.+)$/))) return `Konsentrasiekamp: ${match[1]}`;
  if ((match = core.match(/^Historical context - (.+)$/))) return `Historiese konteks - ${translateUiCore(match[1])}`;
  if ((match = core.match(/^b\. (\d{4})$/))) return `geb. ${match[1]}`;
  if ((match = core.match(/^d\. (\d{4})$/))) return `oorl. ${match[1]}`;
  return null;
}

function translateMonths(core) {
  let output = core;
  MONTHS.forEach((af, en) => {
    output = output.replace(new RegExp(`\\b${en}\\b`, 'g'), af);
  });
  return output;
}

function translateUiCore(core) {
  if (!core) return core;
  const exact = AF.get(core);
  if (exact) return exact;
  const dynamic = translateDynamic(core);
  if (dynamic) return dynamic;
  const monthAdjusted = translateMonths(core)
    .replace(/\bb\. (?=\d{4}\b)/g, 'geb. ')
    .replace(/\bd\. (?=\d{4}\b)/g, 'oorl. ');
  return monthAdjusted;
}

function translateUiString(value) {
  const original = String(value ?? '');
  if (currentLanguage !== 'af') return original;
  const core = original.trim();
  return preserveWhitespace(original, translateUiCore(core));
}

function applyTextNode(node) {
  if (!(node instanceof Text)) return;
  if (node.parentElement?.closest('[data-i18n-ignore]')) return;
  const current = node.nodeValue || '';
  let state = textState.get(node);
  if (!state || current !== state.rendered) {
    state = { original: current, rendered: current };
    textState.set(node, state);
  }
  const desired = currentLanguage === 'af' ? translateUiString(state.original) : state.original;
  if (node.nodeValue !== desired) {
    state.rendered = desired;
    node.nodeValue = desired;
  } else {
    state.rendered = desired;
  }
}

function applyAttribute(element, name) {
  if (!(element instanceof Element) || element.closest('[data-i18n-ignore]')) return;
  const current = element.getAttribute(name);
  if (current == null) return;
  let states = attributeState.get(element);
  if (!states) {
    states = new Map();
    attributeState.set(element, states);
  }
  let state = states.get(name);
  if (!state || current !== state.rendered) {
    state = { original: current, rendered: current };
    states.set(name, state);
  }
  const desired = currentLanguage === 'af' ? translateUiString(state.original) : state.original;
  if (current !== desired) element.setAttribute(name, desired);
  state.rendered = desired;
}

function walk(root = document.body) {
  if (!root) return;
  applying = true;
  try {
    if (root instanceof Text) {
      applyTextNode(root);
      return;
    }
    if (root instanceof Element) {
      ['placeholder', 'title', 'aria-label'].forEach((name) => applyAttribute(root, name));
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node instanceof Text) applyTextNode(node);
      else if (node instanceof Element) ['placeholder', 'title', 'aria-label'].forEach((name) => applyAttribute(node, name));
      node = walker.nextNode();
    }
  } finally {
    applying = false;
  }
}

function aiContextForLine(line) {
  const strong = line.querySelector(':scope > strong');
  if (!strong) return null;
  const state = [...strong.childNodes].find((node) => node instanceof Text && textState.has(node));
  const label = state ? textState.get(state)?.original?.trim() : strong.textContent?.trim();
  if (!label) return null;
  if (label === 'Family note') return 'family_note';
  if (label === 'Occupation') return 'occupation';
  if (label === 'Why this lead matters') return 'research_frontier_detail';
  if (label === 'Evidence note') return 'research_frontier_evidence';
  if (label === 'Interpretation') return 'research_frontier_interpretation';
  if (label === 'Military / other service') return 'military_service';
  if (label.startsWith('Historical context -')) return 'historical_context';
  return null;
}

function valueTextNode(line) {
  const strong = line.querySelector(':scope > strong');
  if (!strong) return null;
  return [...line.childNodes].find((node) => node instanceof Text && node !== strong && (node.nodeValue || '').trim()) || null;
}

async function requestAiTranslation(text, context) {
  const clean = String(text || '').trim();
  if (!clean || currentLanguage !== 'af') return clean;
  const key = `en|af|${context}|${clean}`;
  if (aiMemory.has(key)) return aiMemory.get(key);
  if (aiInFlight.has(key)) return aiInFlight.get(key);
  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('genealogy-translate', {
        body: { text: clean, source_language: 'en', target_language: 'af', context },
      });
      if (error || !data?.translation) return clean;
      aiMemory.set(key, data.translation);
      return data.translation;
    } catch {
      return clean;
    } finally {
      aiInFlight.delete(key);
    }
  })();
  aiInFlight.set(key, promise);
  return promise;
}

async function translateAiLine(line) {
  if (currentLanguage !== 'af') return;
  const context = aiContextForLine(line);
  if (!context) return;
  const node = valueTextNode(line);
  if (!node) return;
  let state = textState.get(node);
  const current = node.nodeValue || '';
  if (!state || current !== state.rendered) {
    state = { original: current, rendered: current };
    textState.set(node, state);
  }
  const source = state.original.trim();
  if (!source || source.length < 4) return;
  const translated = await requestAiTranslation(source, context);
  if (currentLanguage !== 'af' || !node.isConnected || !translated || translated === source) return;
  const leading = state.original.match(/^\s*/)?.[0] || '';
  const trailing = state.original.match(/\s*$/)?.[0] || '';
  const desired = `${leading}${translated}${trailing}`;
  state.rendered = desired;
  if (node.nodeValue !== desired) node.nodeValue = desired;
}

async function translateFrontierTitles(root = document) {
  if (currentLanguage !== 'af') return;
  const titles = root.querySelectorAll?.('.research-frontier-node title') || [];
  for (const title of titles) {
    const node = title.firstChild;
    if (!(node instanceof Text)) continue;
    let state = textState.get(node);
    const current = node.nodeValue || '';
    if (!state || current !== state.rendered) {
      state = { original: current, rendered: current };
      textState.set(node, state);
    }
    const source = state.original.trim();
    if (!source || source.length < 20) continue;
    const translated = await requestAiTranslation(source, 'research_frontier_hover');
    if (currentLanguage !== 'af' || !node.isConnected || !translated || translated === source) continue;
    state.rendered = translated;
    node.nodeValue = translated;
  }
}

function scheduleAiScan(root = document) {
  window.clearTimeout(aiScanTimer);
  aiScanTimer = window.setTimeout(() => {
    if (currentLanguage !== 'af') return;
    root.querySelectorAll?.('.detail-line').forEach((line) => void translateAiLine(line));
    void translateFrontierTitles(root);
  }, 80);
}

function updateSwitcher() {
  document.querySelectorAll('[data-language-choice]').forEach((button) => {
    const active = button.getAttribute('data-language-choice') === currentLanguage;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setLanguage(language, { persist = true } = {}) {
  if (!SUPPORTED.has(language)) return;
  currentLanguage = language;
  if (persist) localStorage.setItem(LANGUAGE_KEY, language);
  document.documentElement.lang = language;
  document.title = language === 'af' ? 'Ons Familiegeskiedenis' : 'Our Family History';
  updateSwitcher();
  walk(document.body);
  if (language === 'af') scheduleAiScan(document);
  document.dispatchEvent(new CustomEvent('genealogy:language-changed', { detail: { language } }));
}

function installSwitcher() {
  const host = document.querySelector('.top-actions');
  if (!host || document.getElementById('languageSwitcher')) return;
  const wrap = document.createElement('div');
  wrap.id = 'languageSwitcher';
  wrap.className = 'language-switcher';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Site language');
  wrap.innerHTML = `
    <button type="button" class="language-choice" data-language-choice="en" aria-pressed="false">English</button>
    <button type="button" class="language-choice" data-language-choice="af" aria-pressed="false">Afrikaans</button>`;
  wrap.querySelectorAll('[data-language-choice]').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.getAttribute('data-language-choice')));
  });
  host.insertBefore(wrap, host.firstChild);
  updateSwitcher();
}

const nativeConfirm = window.confirm.bind(window);
window.confirm = (message) => nativeConfirm(currentLanguage === 'af' ? translateUiString(message) : message);
const nativePrompt = window.prompt.bind(window);
window.prompt = (message, value) => nativePrompt(currentLanguage === 'af' ? translateUiString(message) : message, value);

const observer = new MutationObserver((mutations) => {
  if (applying) return;
  const roots = new Set();
  for (const mutation of mutations) {
    if (mutation.type === 'characterData') roots.add(mutation.target);
    if (mutation.type === 'attributes') roots.add(mutation.target);
    mutation.addedNodes?.forEach((node) => roots.add(node));
  }
  roots.forEach((root) => walk(root));
  if (currentLanguage === 'af') scheduleAiScan(document);
});

installSwitcher();
setLanguage(currentLanguage, { persist: false });
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['placeholder', 'title', 'aria-label'],
});

window.GenealogyI18n = {
  get language() { return currentLanguage; },
  setLanguage,
  translateUiString,
  translateNarrative: requestAiTranslation,
};
