const RESOURCE_COPY = {
  'FamilySearch - South Africa': {
    en:['A strong first place to search South African civil, church, probate and historical collections. Some images can be viewed only under FamilySearch access restrictions.','Search spelling variants, maiden names, spouses and approximate dates. An index is a lead; inspect the underlying image when possible.'],
    af:['’n Sterk eerste plek om Suid-Afrikaanse siviele, kerk-, boedel- en historiese versamelings te deursoek. Sommige beelde kan slegs binne FamilySearch se toegangsbeperkings bekyk word.','Soek spelvariante, nooiensvanne, eggenote en benaderde datums. ’n Indeks is ’n leidraad; ondersoek die onderliggende beeld waar moontlik.'],
  },
  'GenDatabase': {
    en:['South African genealogy indexes, National Archives references and a document-ordering service. We have used this service successfully for archive retrieval and record-location help.','Particularly useful once you have a National Archives reference, or when you need help identifying which archive file is worth ordering.'],
    af:['Suid-Afrikaanse genealogie-indekse, Nasionale Argief-verwysings en ’n dokumentbesteldiens. Ons het hierdie diens suksesvol gebruik vir argiefherwinning en hulp om rekords op te spoor.','Veral nuttig wanneer jy reeds ’n Nasionale Argief-verwysing het, of hulp nodig het om te bepaal watter argieflêer die moeite werd is om te bestel.'],
  },
  'eGGSA Documents': {
    en:['Digitised and photographed South African genealogy material, with archive-document ordering routes for records that are not online.','Record the archive reference carefully before ordering where possible.'],
    af:['Gedigitaliseerde en gefotografeerde Suid-Afrikaanse genealogiemateriaal, met roetes om argiefdokumente te bestel vir rekords wat nie aanlyn beskikbaar is nie.','Teken waar moontlik die argiefverwysing noukeurig aan voordat jy bestel.'],
  },
  'eGGSA Graves': {
    en:['A large South African grave-photograph collection organised by cemetery and province.','Grave photographs are useful evidence for names and dates, but compare them with civil, church or estate records when those are available.'],
    af:['’n Groot Suid-Afrikaanse versameling graf-foto’s wat volgens begraafplaas en provinsie georganiseer is.','Graf-foto’s is nuttige bewysmateriaal vir name en datums, maar vergelyk dit met siviele, kerk- of boedelrekords wanneer dié beskikbaar is.'],
  },
  'National Archives of South Africa': {
    en:['The national archival catalogue and repository network for deceased estates, insolvencies, court files and many other historical records.','Catalogue references are often the key to commissioning a researcher or archive photographer. Keep the full repository and file reference.'],
    af:['Die nasionale argiefkatalogus en netwerk van bewaarplekke vir bestorwe boedels, insolvensies, hoflêers en baie ander historiese rekords.','Katalogusverwysings is dikwels die sleutel om ’n navorser of argieffotograaf opdrag te gee. Hou die volle bewaarplek- en lêerverwysing.'],
  },
  'IdentityNumber.org': {
    en:['Useful for locating South African deceased-person identifiers and record leads from public-source material.','Treat results as research leads rather than official certificates. Obtain the underlying civil or estate record where possible.'],
    af:['Nuttig om Suid-Afrikaanse identifiseerders van oorlede persone en rekordleidrade uit openbare bronmateriaal op te spoor.','Behandel resultate as navorsingsleidrade eerder as amptelike sertifikate. Verkry waar moontlik die onderliggende siviele of boedelrekord.'],
  },
  'Free State Archives': {
    en:['Repository contact used successfully for Free State archival holdings and file-access enquiries.','Send the full VAB reference, names, approximate dates and exactly what you hope the file will establish.'],
    af:['Bewaarplek-kontak wat suksesvol gebruik is vir Vrystaatse argiefversamelings en navrae oor toegang tot lêers.','Stuur die volle VAB-verwysing, name, benaderde datums en presies wat jy hoop die lêer sal vasstel.'],
  },
  'Dutch Reformed Church Archive - Stellenbosch': {
    en:['Church archive route used for Dutch Reformed congregational and register enquiries.','Give congregation, date range, names and the exact record type you are seeking.'],
    af:['Kerkargiefroete wat gebruik word vir navrae oor Nederduitse Gereformeerde gemeentes en registers.','Gee die gemeente, datumreeks, name en die presiese rekordtipe waarna jy soek.'],
  },
  'Free State Dutch Reformed Church archive': {
    en:['Useful route for Free State congregation, baptism, marriage and membership-register enquiries.','Narrow requests by congregation and date range wherever possible.'],
    af:['Nuttige roete vir navrae oor Vrystaatse gemeentes, doop-, huweliks- en lidmaatregisters.','Beperk versoeke waar moontlik volgens gemeente en datumreeks.'],
  },
  'Alexia Chamberlin': {
    en:['Pretoria National Archives file photography. We have personally used this service successfully for complete archive-file photography.','Best when you already know the Pretoria archive reference and need the physical file photographed rather than a broad family-tree research project.'],
    af:['Fotografering van lêers by die Pretoria Nasionale Argief. Ons het hierdie diens persoonlik en suksesvol gebruik vir volledige argieflêerfotografering.','Die beste wanneer jy reeds die Pretoria-argiefverwysing ken en die fisiese lêer gefotografeer moet word, eerder as vir ’n breë familieboom-navorsingsprojek.'],
  },
  'Anne Lehmkuhl': {
    en:['Broader South African family-history research. Recommended to us by Alexia Chamberlin.','Professionally referred, but we have not yet completed a commissioned research project with her.'],
    af:['Breër Suid-Afrikaanse familiegeskiedenisnavorsing. Sy is deur Alexia Chamberlin by ons aanbeveel.','Professioneel verwys, maar ons het nog nie ’n voltooide betaalde navorsingsopdrag saam met haar afgehandel nie.'],
  },
  'Lorna Olivier': {
    en:['Independent genealogy and church-register research. Referred to us by a Dutch Reformed Church archive for targeted Germiston research.','Professionally referred, but we have not yet completed a commissioned research project with her.'],
    af:['Onafhanklike genealogie- en kerkregisternavorsing. Sy is deur ’n Nederduitse Gereformeerde Kerkargief na ons verwys vir geteikende Germiston-navorsing.','Professioneel verwys, maar ons het nog nie ’n voltooide betaalde navorsingsopdrag saam met haar afgehandel nie.'],
  },
};

const STATUS = {
  'Used successfully by this family':'Suksesvol deur hierdie familie gebruik',
  'Recommended':'Aanbeveel',
  'Referred to us - not yet fully tested':'Na ons verwys – nog nie volledig deur ons getoets nie',
  'Useful research route':'Nuttige navorsingsroete',
  'More advanced':'Meer gevorderd',
};

function language(){return (window.GenealogyI18n?.language||document.documentElement.lang||'en')==='af'?'af':'en';}
function af(){return language()==='af';}
function setIfDifferent(node,value){if(node&&node.textContent!==value)node.textContent=value;}

function localizeCore(panel){
  const lang=language();
  if(panel.dataset.staticResearchLang===lang)return;
  panel.dataset.staticResearchLang=lang;
  const intro=panel.querySelector('.research-intro');
  const baseline=panel.querySelector('.research-baseline');
  const steps=panel.querySelector('.research-steps');
  if(intro)intro.innerHTML=af()?`<p class="eyebrow">Navorsingshulp</p><h3>Op soek na bewysmateriaal?</h3><p>Familiekennis maak saak, maar die boom word betroubaarder wanneer ons dit kan verbind aan die rekord wat dit ondersteun. Gebruik die hulpbronne hieronder om siviele, kerk-, boedel-, graf- en familierekords te soek.</p>`:`<p class="eyebrow">Research Help</p><h3>Looking for evidence?</h3><p>Family knowledge matters, but the tree becomes more reliable when we can connect it to the record that supports it. Use the resources below to look for civil, church, estate, grave and family records.</p>`;
  if(baseline)baseline.innerHTML=af()?`<h3>Wat tel hier as bewysmateriaal?</h3><p><strong>Gedokumenteer</strong> beteken dat ’n nagegane rekord die spesifieke bewering direk ondersteun en dat ons tevrede is dat dit by die regte persoon hoort. Dit beteken nie dat elke feit oor daardie persoon bewys is nie.</p><p><strong>Familie-gedokumenteer</strong> dek materiaal soos ’n familiebybel, handgeskrewe notas, ’n benoemde foto, ’n familieboekie, ’n begrafnisblaadjie of ander bewaarde familiedokument. Dit is werklike dokumentêre bronne, maar word steeds as familiemateriaal onderskei van ’n amptelike siviele of kerklike rekord.</p><p><strong>Deur familie verskaf</strong> is inligting of herinneringe wat deur ’n familielid verskaf is waar geen ondersteunende dokument nog aangeheg is nie. Sterk, waarskynlik, hipotese en onopgelos word gebruik waar die bewysmateriaal meer versigtigheid vereis.</p>`:`<h3>What counts as evidence here?</h3><p><strong>Documented</strong> means that a reviewed record directly supports the particular claim and we are satisfied that it belongs to the right person. It does not mean that every fact about that person is proved.</p><p><strong>Family documented</strong> covers material such as a family Bible, handwritten notes, a labelled photograph, a family booklet, a funeral leaflet or other retained family document. These are real documentary sources, while still being identified as family material rather than an official civil or church record.</p><p><strong>Family supplied</strong> is information or recollection supplied by a family member where no supporting document has yet been attached. Strong, probable, hypothesis and unresolved statuses are used where the evidence requires more caution.</p>`;
  if(steps)steps.innerHTML=af()?`<h3>Wanneer jy iets vind</h3><ol><li>Stoor of laai die oorspronklike beeld of dokument af indien die webwerf dit toelaat.</li><li>Hou die volledige bronverwysing: webadres, argiefverwysing, film- of beeldnommer, gemeente, begraafplaas of bewaarplek.</li><li>Hou genoeg konteks om die rekord te identifiseer. Moet waar moontlik nie opskrifte, bladsynommers of aangrensende inligting afsny wat help om dit weer op te spoor nie.</li><li>Keer hierheen terug, kies die betrokke persoon en kies <strong>Laai ’n rekord op</strong>.</li><li>Vertel ons wat jy dink die rekord wys. Die oorspronklike word privaat gestoor en die toepassing sal probeer om dit intelligent te transkribeer en met die bestaande bewysmateriaal te vergelyk. Die KI-lesing bly ’n voorstel totdat ’n redakteur dit aanvaar.</li></ol><p class="small">’n Indeks, familieboominskrywing of soekresultaat kan ’n baie nuttige leidraad wees. Waar ’n onderliggende oorspronklike rekord bestaan, verkies ons om daardie rekord aan te heg en te beoordeel voordat ons die bewering gedokumenteer noem.</p>`:`<h3>When you find something</h3><ol><li>Save or download the original image or document if the website permits it.</li><li>Keep the full source reference: website address, archive reference, film or image number, congregation, cemetery or repository.</li><li>Keep enough context to identify the record. Where possible, do not crop away headings, page numbers or neighbouring information that helps locate it again.</li><li>Return here, select the relevant person and choose <strong>Upload a record</strong>.</li><li>Tell us what you think the record shows. The original is stored privately and the app will attempt an intelligent transcription and evidence comparison. The AI reading remains a proposal until an editor accepts it.</li></ol><p class="small">An index, family-tree entry or search result can be a very useful lead. Where an underlying original record exists, we prefer to attach and assess that record before calling the claim documented.</p>`;
}

function localizeTabs(){
  document.querySelectorAll('#contributionModeTabs [data-mode]').forEach((button)=>{
    const copy={share:af()?'Deel inligting':'Share information',upload:af()?'Laai ’n rekord op':'Upload a record',research:af()?'Navorsingshulp':'Research Help'};
    setIfDifferent(button,copy[button.dataset.mode]);
  });
  const heading=document.querySelector('#contributionWorkbench .contribution-summary-title')||document.querySelector('#contributionForm')?.closest('.panel')?.querySelector('h2');
  if(heading)setIfDifferent(heading,af()?'Dra by en doen navorsing':'Contribute and research');
}

function localizeResources(panel){
  const groupCopy=af()?[
    ['Begin aanlyn','Dit is nuttige eerste plekke om rekords, indekse en argiefverwysings op te spoor.'],
    ['Argiewe en kerkrekords','Gebruik hierdie wanneer die rekord bestaan maar nie as ’n aflaaibare beeld aanlyn beskikbaar is nie.'],
    ['Navorsers en rekordherwinning','Die notas hieronder onderskei mense wat ons suksesvol gebruik het van mense wat professioneel na ons verwys is maar wat ons nog nie deur ’n voltooide opdrag getoets het nie.'],
  ]:[
    ['Start online','These are useful first stops for locating records, indexes and archive references.'],
    ['Archives and church records','Use these when the record exists but is not available as a downloadable image online.'],
    ['Researchers and record retrieval','The notes below distinguish people we have used successfully from people who were professionally referred to us but whom we have not yet tested through a completed commission.'],
  ];
  [...panel.querySelectorAll('.research-resource-group')].forEach((group,index)=>{
    if(!groupCopy[index])return;
    setIfDifferent(group.querySelector(':scope > h3'),groupCopy[index][0]);
    setIfDifferent(group.querySelector(':scope > p.small'),groupCopy[index][1]);
  });
  panel.querySelectorAll('.research-resource-card').forEach((card)=>{
    const name=card.querySelector('h4')?.textContent?.trim();
    const copy=RESOURCE_COPY[name]?.[language()];
    if(copy){
      const description=[...card.children].find((node)=>node.tagName==='P'&&!node.classList.contains('research-resource-guidance'));
      setIfDifferent(description,copy[0]);
      setIfDifferent(card.querySelector('.research-resource-guidance'),copy[1]);
    }
    const status=card.querySelector('.research-status');
    if(status){
      const english=Object.keys(STATUS).find((key)=>status.textContent.trim()===key||status.textContent.trim()===STATUS[key]);
      if(english)setIfDifferent(status,af()?STATUS[english]:english);
    }
    card.querySelectorAll('.research-link').forEach((link)=>{if(link.getAttribute('href')?.startsWith('https://'))setIfDifferent(link,af()?'Maak webwerf oop':'Open website');});
  });
  const loose=panel.querySelector('#researchResourceDirectory > p');
  if(loose){
    if(/Loading the family research directory|Laai die familienavorsingsgids/.test(loose.textContent))setIfDifferent(loose,af()?'Laai die familienavorsingsgids...':'Loading the family research directory...');
    if(/research directory could not be loaded|navorsingsgids kon nie gelaai/.test(loose.textContent))setIfDifferent(loose,af()?'Die navorsingsgids kon nie gelaai word nie. Maak seker dat jy met goedgekeurde familietoegang aangemeld is.':'The research directory could not be loaded. Please check that you are signed in with approved family access.');
  }
}

function localizeFooter(){
  setIfDifferent(document.getElementById('openFamilyPolicy'),af()?'Navorsing, bronne en privaatheid':'Research, Sources & Privacy');
  setIfDifferent(document.querySelector('#familyPolicyFooter span'),af()?'Private familienavorsingsargief':'Private family research archive');
}

function localize(){
  localizeTabs();
  const panel=document.getElementById('researchHelpPanel');
  if(panel){localizeCore(panel);localizeResources(panel);}
  localizeFooter();
}

function burst(){[0,80,250,700,1500].forEach((delay)=>window.setTimeout(localize,delay));}
document.addEventListener('genealogy:archive-ready',burst);
document.addEventListener('genealogy:language-changed',()=>{const panel=document.getElementById('researchHelpPanel');if(panel)delete panel.dataset.staticResearchLang;burst();});
document.addEventListener('click',(event)=>{if(event.target.closest?.('[data-mode="research"]'))burst();});
window.addEventListener('load',burst);
burst();
