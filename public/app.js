const $ = (s, el = document) => el.querySelector(s);
const esc = escHtml;
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const estVide = (v) => (Array.isArray(v) ? !v.length : !v);
const initiales = (p) => ((p.prenom[0] || '') + (p.nom[0] || '')).toUpperCase();

async function api(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    toast('Connexion au serveur impossible', 'erreur');
    throw new Error('réseau');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    toast(err.error || `Erreur ${res.status}`, 'erreur');
    throw new Error(err.error);
  }
  return res.status === 204 ? null : res.json();
}

// Désactive un bouton pendant une action asynchrone
async function pendant(btn, action) {
  if (btn) btn.disabled = true;
  try { return await action(); } finally { if (btn) btn.disabled = false; }
}

let patients = [];
let champs = [];
let typesDocs = [];
let courant = null; // { p, docs, demandes }
let ongletActif = 'fiche';
let editionDetails = false;
let editingId = null;

function initIcones() {
  $('[data-vue=patients]').innerHTML = icone('users') + 'Patients';
  $('[data-vue=parametres]').innerHTML = icone('settings') + 'Paramètres';
  $('#btnNouveau').innerHTML = icone('plus') + 'Nouveau patient';
  $('#icRecherche').outerHTML = icone('search', 16);
  $('#btnAjoutChamp').innerHTML = icone('plus') + 'Champ';
  $('#btnAjoutSection').innerHTML = icone('plus') + 'Section';
  $('#btnAjoutTypeDoc').innerHTML = icone('plus') + 'Document';
  $('#btnDocLibre').innerHTML = icone('plus', 16) + 'Autre document';
  $('#icSucces').innerHTML = icone('check', 26);
  $('#btnCopierCree').innerHTML = icone('copy') + 'Copier';
  $('#btnEmailCree').innerHTML = icone('mail') + 'Envoyer par email';
}

// Fermeture des dialogues : boutons [data-fermer] et clic sur le fond
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.querySelectorAll('[data-fermer]').forEach((b) => (b.onclick = () => d.close()));
});

// ================= Navigation (#patients/<id>, #parametres/<onglet>) =================
let hashPrecedent = location.hash;
let ignorerHash = false;
let paramModifie = false;

function lireRoute() {
  const [vue, sous = ''] = location.hash.slice(1).split('/');
  return { vue: vue === 'parametres' ? 'parametres' : 'patients', sous };
}

window.addEventListener('hashchange', async () => {
  if (ignorerHash) { ignorerHash = false; return; }
  if (paramModifie && hashPrecedent.startsWith('#parametres') && lireRoute().vue !== 'parametres') {
    const quitter = await confirmer({
      titre: 'Quitter sans enregistrer ?',
      message: 'Vos modifications des paramètres seront perdues.',
      bouton: 'Quitter sans enregistrer',
      danger: true,
    });
    if (!quitter) { ignorerHash = true; location.hash = hashPrecedent; return; }
    paramModifie = false;
  }
  hashPrecedent = location.hash;
  afficherVue();
});

window.addEventListener('beforeunload', (e) => { if (paramModifie) e.preventDefault(); });

function afficherVue() {
  const { vue, sous } = lireRoute();
  $('#vuePatients').hidden = vue !== 'patients';
  $('#vueParametres').hidden = vue !== 'parametres';
  document.querySelectorAll('[data-vue]').forEach((a) => a.classList.toggle('active', a.dataset.vue === vue));
  if (vue === 'parametres') afficherParametres(sous === 'documents' ? 'documents' : 'fiche');
  else afficherPatient(sous || null);
}

// ================= Liste des patients =================
const estEnAttente = (dem) => (dem.avecFormulaire && !dem.formulaireRempliAt) || dem.items.some((i) => !i.documentId);

function afficherListe() {
  const q = norm($('#recherche').value.trim());
  const sel = lireRoute().sous;
  const liste = patients
    .filter((p) => norm(`${p.prenom} ${p.nom}`).includes(q))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));

  let html;
  if (!patients.length) html = '<li class="liste-vide">Aucun patient pour l\'instant.</li>';
  else if (!liste.length) html = `<li class="liste-vide">Aucun résultat pour « ${esc($('#recherche').value)} »</li>`;
  else {
    html = liste.map((p) => {
      const a = age(p.dateNaissance);
      const meta = [a !== null ? `${a} ans` : null, `${p.nbDocuments} doc.`].filter(Boolean).join(' · ');
      const actif = p.id === sel;
      return `
        <li><button class="patient-item ${actif ? 'active' : ''}" data-id="${p.id}" ${actif ? 'aria-current="true"' : ''}>
          <span class="avatar">${esc(initiales(p))}</span>
          <span class="pi-texte">
            <span class="pi-nom"><strong>${esc(p.nom.toUpperCase())}</strong> ${esc(p.prenom)}</span>
            <span class="pi-meta">${meta}</span>
          </span>
          ${p.demandesEnAttente ? '<span class="chip attente">En attente</span>' : ''}
        </button></li>`;
    }).join('');
  }
  $('#listePatients').innerHTML = html;
}

$('#recherche').addEventListener('input', afficherListe);
$('#listePatients').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) location.hash = `#patients/${b.dataset.id}`;
});
$('#btnNouveau').onclick = () => ouvrirPatient(null);

// ================= Détail patient =================
async function afficherPatient(id) {
  $('#vuePatients').classList.toggle('avec-patient', !!id);
  afficherListe();
  if (!id) {
    courant = null;
    document.title = 'Cabinet – Patients';
    rendreDetailVide();
    return;
  }
  const p = patients.find((x) => x.id === id);
  if (!p) { location.hash = '#patients'; return; }
  if (courant?.p.id !== id) editionDetails = false;
  const [docs, demandes] = await Promise.all([
    api(`/api/patients/${id}/documents`),
    api(`/api/patients/${id}/demandes`),
  ]);
  courant = { p, docs, demandes };
  document.title = `${p.prenom} ${p.nom} – Cabinet`;
  rendreDetail();
}

async function recharger() {
  patients = await api('/api/patients');
  await afficherPatient(lireRoute().sous || null);
}

function rendreDetailVide() {
  $('#detail').innerHTML = patients.length
    ? `<div class="detail-vide">${icone('users', 40)}<div><strong>Sélectionnez un patient</strong><br>pour voir sa fiche, ses documents et ses demandes.</div></div>`
    : `<div class="detail-vide">${icone('users', 40)}<div><strong>Aucun patient</strong><br>Commencez par créer votre premier patient.</div>
        <button class="btn primary" onclick="ouvrirPatient(null)">${icone('plus')}Nouveau patient</button></div>`;
}

function rendreDetail() {
  const { p, docs, demandes } = courant;
  const a = age(p.dateNaissance);
  const enAttente = demandes.filter(estEnAttente).length;
  const meta = [
    p.dateNaissance ? `${a} ans · né(e) le ${fmtDate(p.dateNaissance)}` : null,
    p.email ? esc(p.email) : null,
    p.telephone ? esc(p.telephone) : null,
  ].filter(Boolean);

  const onglet = (id, label, n, attente) => `
    <button class="tab" role="tab" id="tab-${id}" aria-controls="panneau" aria-selected="${ongletActif === id}" data-onglet="${id}">
      ${label}${n !== undefined ? `<span class="compte">${n}</span>` : ''}
      ${attente ? `<span class="chip attente">${attente} en attente</span>` : ''}
    </button>`;

  $('#detail').innerHTML = `
    <div class="patient-head">
      <a href="#patients" class="btn ghost sm retour">${icone('left', 16)}Patients</a>
      <div class="identite">
        <span class="avatar lg">${esc(initiales(p))}</span>
        <div>
          <h2>${esc(p.prenom)} ${esc(p.nom)}</h2>
          <div class="meta">${meta.length ? meta.map((m) => `<span>${m}</span>`).join('') : '<span>Aucune coordonnée renseignée</span>'}</div>
        </div>
      </div>
      <div class="head-actions">
        <button class="btn primary" data-action="demande">${icone('send', 16)}Envoyer une demande</button>
        <a class="btn" href="/fiche.html?id=${p.id}" target="_blank" rel="noopener">${icone('eye', 16)}Fiche complète</a>
        <button class="btn" data-action="modifier">${icone('pencil', 16)}Modifier</button>
      </div>
      <div class="tabs" role="tablist" aria-label="Sections du patient">
        ${onglet('fiche', 'Fiche')}
        ${onglet('documents', 'Documents', docs.length)}
        ${onglet('demandes', 'Demandes', demandes.length, enAttente)}
      </div>
    </div>
    <div class="card-pad" role="tabpanel" id="panneau" aria-labelledby="tab-${ongletActif}">
      ${ongletActif === 'documents' ? ongletDocuments() : ongletActif === 'demandes' ? ongletDemandes() : ongletFiche()}
    </div>`;
  brancherOnglet();
}

// --- Onglet Fiche ---
function ongletFiche() {
  const { p } = courant;
  const details = p.details || {};
  const utiles = champs.filter((c) => c.type !== 'section');

  if (editionDetails) {
    return `
      <form id="formDetails">
        ${champs.map((c) => champInput(c, details[c.id])).join('')}
        <div class="form-actions">
          <button type="button" class="btn" data-action="annuler-details">Annuler</button>
          <button type="submit" class="btn primary">Enregistrer</button>
        </div>
      </form>`;
  }

  if (!utiles.length) {
    return `<div class="vide-onglet">Aucun champ n'est configuré pour la fiche.
      <a class="btn" href="#parametres/fiche">${icone('settings', 16)}Configurer la fiche</a></div>`;
  }

  const remplis = utiles.filter((c) => !estVide(details[c.id])).length;
  return `
    <div class="card-head">
      <span class="muted">${remplis} / ${utiles.length} champs renseignés</span>
      <button class="btn sm" data-action="editer-details">${icone('pencil', 14)}Compléter la fiche</button>
    </div>
    ${p.notes ? `<h3 class="section-titre">Notes</h3><p class="pre">${esc(p.notes)}</p>` : ''}
    ${grouperParSection(champs).map((g) => `
      ${g.titre ? `<h3 class="section-titre">${esc(g.titre)}</h3>` : ''}
      <dl class="details">
        ${g.champs.map((c) => `
          <dt>${esc(c.label)}${c.patient ? '' : ' <span class="chip" title="Non visible par le patient">Interne</span>'}</dt>
          <dd>${valeurAffichee(c, details[c.id])}</dd>`).join('')}
      </dl>`).join('')}`;
}

// --- Onglet Documents ---
function ongletDocuments() {
  const docs = [...courant.docs].reverse(); // plus récents en premier
  return `
    <div class="dropzone" id="dropzone">
      ${icone('upload')}
      <span id="dropzoneTexte">Glissez des fichiers ici ou</span>
      <button type="button" class="btn sm" data-action="parcourir">Parcourir</button>
      <input type="file" id="inputFichiers" multiple hidden>
    </div>
    ${docs.length ? `<ul class="liste">${docs.map(rendreDoc).join('')}</ul>`
      : '<p class="vide-onglet">Aucun document pour le moment.</p>'}`;
}

function rendreDoc(d) {
  return `
    <li data-doc="${d.id}">
      <span class="doc-icone">${icone('file')}</span>
      <div class="doc-texte">
        <a class="doc-nom" href="/api/documents/${d.id}/fichier" target="_blank" rel="noopener">${esc(d.nom)}</a>
        <div class="doc-meta">
          <span>${fmtDate(d.createdAt)}</span><span>${fmtTaille(d.taille)}</span>
          ${d.source === 'patient' ? `<span class="chip ok">Envoyé par le patient${d.libelle ? ' · ' + esc(d.libelle) : ''}</span>` : ''}
        </div>
      </div>
      <div class="doc-actions">
        <a class="btn ghost sm icon" href="/api/documents/${d.id}/fichier?dl=1" title="Télécharger" aria-label="Télécharger ${esc(d.nom)}">${icone('download', 16)}</a>
        <button class="btn ghost sm icon" data-action="renommer" title="Renommer" aria-label="Renommer ${esc(d.nom)}">${icone('pencil', 16)}</button>
        <button class="btn ghost sm icon danger-text" data-action="supprimer-doc" title="Supprimer" aria-label="Supprimer ${esc(d.nom)}">${icone('trash', 16)}</button>
      </div>
    </li>`;
}

// --- Onglet Demandes ---
function ongletDemandes() {
  const { demandes } = courant;
  if (!demandes.length) {
    return `<div class="vide-onglet">${icone('send', 32)}
      <div>Aucune demande envoyée.<br>Envoyez un lien au patient pour qu'il complète sa fiche et dépose ses documents.</div>
      <button class="btn primary" data-action="demande">${icone('send', 16)}Envoyer une demande</button></div>`;
  }
  return [...demandes].reverse().map(rendreDemande).join('');
}

function lienEmail(p, lien) {
  const sujet = 'Votre dossier – cabinet de psychomotricité';
  const corps = `Bonjour,\n\nMerci de compléter votre dossier en suivant ce lien :\n${lien}\n\nBien cordialement`;
  return `mailto:${esc(p.email)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}

function rendreDemande(dem) {
  const { p } = courant;
  const lien = `${location.origin}/d/${dem.token}`;
  const complete = !estEnAttente(dem);
  const ligne = (fait, texte) => `<li class="${fait ? 'fait' : 'attente'}">${icone(fait ? 'check' : 'clock', 16)}<span>${texte}</span></li>`;
  return `
    <div class="demande" data-demande="${dem.id}">
      <div class="demande-head">
        <div>
          <strong>Envoyée le ${fmtDate(dem.createdAt)}</strong>
          <div class="demande-etat">${complete
            ? `<span class="chip ok">${icone('check', 12)}Complète</span>`
            : `<span class="chip attente">${icone('clock', 12)}En attente du patient</span>`}</div>
        </div>
        <button class="btn ghost sm danger-text" data-action="revoquer">Révoquer</button>
      </div>
      <ul class="demande-docs">
        ${dem.avecFormulaire ? ligne(!!dem.formulaireRempliAt, `Formulaire${dem.formulaireRempliAt ? ` <span class="muted">· rempli le ${fmtDate(dem.formulaireRempliAt)}</span>` : ''}`) : ''}
        ${dem.items.map((i) => ligne(!!i.documentId, esc(i.libelle))).join('')}
      </ul>
      ${complete ? '' : `
        <div class="lien-box">
          <input readonly value="${lien}" aria-label="Lien patient" onfocus="this.select()">
          <button class="btn sm" data-action="copier" data-lien="${lien}">${icone('copy', 14)}Copier</button>
          ${p.email ? `<a class="btn sm" href="${lienEmail(p, lien)}">${icone('mail', 14)}Email</a>` : ''}
        </div>`}
    </div>`;
}

// --- Interactions du détail ---
$('#detail').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-onglet], [data-action]');
  if (!t) return;
  if (t.dataset.onglet) {
    ongletActif = t.dataset.onglet;
    rendreDetail();
    $(`#tab-${ongletActif}`).focus();
    return;
  }
  const docId = t.closest('[data-doc]')?.dataset.doc;
  switch (t.dataset.action) {
    case 'demande': ouvrirDemande(); break;
    case 'modifier': ouvrirPatient(courant.p.id); break;
    case 'editer-details':
      editionDetails = true;
      rendreDetail();
      $('#formDetails').querySelector('input, textarea, select')?.focus();
      break;
    case 'annuler-details': editionDetails = false; rendreDetail(); break;
    case 'parcourir': $('#inputFichiers').click(); break;
    case 'renommer': renommerDoc(t.closest('[data-doc]')); break;
    case 'supprimer-doc': supprimerDoc(docId); break;
    case 'revoquer': revoquer(t.closest('[data-demande]').dataset.demande); break;
    case 'copier': copier(t.dataset.lien, t); break;
  }
});

function brancherOnglet() {
  const form = $('#formDetails');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const details = lireChamps(form, champs);
      if (!verifierCasesRequises(form, champs, details)) return;
      await pendant(form.querySelector('[type=submit]'), () => api(`/api/patients/${courant.p.id}`, json('PUT', { details })));
      editionDetails = false;
      toast('Fiche enregistrée');
      await recharger();
    };
  }

  const dz = $('#dropzone');
  if (dz) {
    const input = $('#inputFichiers');
    dz.onclick = (e) => { if (e.target === dz || e.target.id === 'dropzoneTexte') input.click(); };
    input.onchange = () => envoyerFichiers(input.files);
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); envoyerFichiers(e.dataTransfer.files); };
  }
}

async function envoyerFichiers(files) {
  if (!files.length) return;
  const n = files.length;
  $('#dropzone').classList.add('envoi');
  $('#dropzoneTexte').textContent = n > 1 ? `Envoi de ${n} fichiers…` : 'Envoi en cours…';
  const fd = new FormData();
  for (const f of files) fd.append('fichiers', f);
  try {
    await api(`/api/patients/${courant.p.id}/documents`, { method: 'POST', body: fd });
    toast(n > 1 ? `${n} documents ajoutés` : 'Document ajouté');
  } finally {
    await recharger();
  }
}

function renommerDoc(li) {
  const doc = courant.docs.find((d) => d.id === li.dataset.doc);
  const zone = $('.doc-texte', li);
  const avant = zone.innerHTML;
  zone.innerHTML = `
    <form class="renommer">
      <input value="${esc(doc.nom)}" aria-label="Nouveau nom du document">
      <button class="btn sm primary icon" type="submit" aria-label="Valider">${icone('check', 16)}</button>
      <button class="btn sm icon" type="button" aria-label="Annuler">${icone('x', 16)}</button>
    </form>`;
  const form = $('form', zone), input = $('input', zone);
  const annuler = () => (zone.innerHTML = avant);
  input.focus();
  const point = doc.nom.lastIndexOf('.');
  input.setSelectionRange(0, point > 0 ? point : doc.nom.length); // sélectionne le nom sans l'extension
  input.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); annuler(); } };
  $('button[type=button]', form).onclick = annuler;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const nom = input.value.trim();
    if (!nom || nom === doc.nom) return annuler();
    await api(`/api/documents/${doc.id}`, json('PUT', { nom }));
    toast('Document renommé');
    await recharger();
  };
}

async function supprimerDoc(id) {
  const doc = courant.docs.find((d) => d.id === id);
  const ok = await confirmer({ titre: 'Supprimer ce document ?', message: doc.nom, bouton: 'Supprimer', danger: true });
  if (!ok) return;
  await api(`/api/documents/${id}`, { method: 'DELETE' });
  toast('Document supprimé');
  await recharger();
}

async function revoquer(id) {
  const ok = await confirmer({
    titre: 'Révoquer ce lien ?',
    message: 'Le patient ne pourra plus l\'utiliser. Les informations et documents déjà reçus sont conservés.',
    bouton: 'Révoquer',
    danger: true,
  });
  if (!ok) return;
  await api(`/api/demandes/${id}`, { method: 'DELETE' });
  toast('Lien révoqué');
  await recharger();
}

async function copier(texte, btn) {
  try {
    await navigator.clipboard.writeText(texte);
  } catch {
    const t = Object.assign(document.createElement('textarea'), { value: texte });
    document.body.append(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  toast('Lien copié');
  if (btn) {
    const avant = btn.innerHTML;
    btn.innerHTML = icone('check', 16) + 'Copié';
    setTimeout(() => (btn.innerHTML = avant), 1600);
  }
}

// ================= Dialogue patient =================
const dlgPatient = $('#dlgPatient');

function ouvrirPatient(id) {
  editingId = id;
  const form = $('#formPatient');
  form.reset();
  $('#dlgTitre').textContent = id ? 'Modifier le patient' : 'Nouveau patient';
  $('#btnSupprimerPatient').hidden = !id;
  if (id) {
    const p = patients.find((x) => x.id === id);
    for (const k of ['prenom', 'nom', 'dateNaissance', 'email', 'telephone', 'notes']) form.elements[k].value = p[k] || '';
  }
  dlgPatient.showModal();
  $('#fPrenom').focus();
}

$('#formPatient').onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const p = await pendant($('#btnEnregistrerPatient'), () => (editingId
    ? api(`/api/patients/${editingId}`, json('PUT', data))
    : api('/api/patients', json('POST', data))));
  dlgPatient.close();
  if (editingId) {
    toast('Patient mis à jour');
    await recharger();
  } else {
    toast('Patient créé');
    patients = await api('/api/patients');
    ongletActif = 'fiche';
    location.hash = `#patients/${p.id}`;
  }
};

$('#btnSupprimerPatient').onclick = async () => {
  const p = patients.find((x) => x.id === editingId);
  const ok = await confirmer({
    titre: `Supprimer ${p.prenom} ${p.nom} ?`,
    message: 'Sa fiche, ses documents et ses demandes seront définitivement supprimés.',
    bouton: 'Supprimer définitivement',
    danger: true,
  });
  if (!ok) return;
  await api(`/api/patients/${p.id}`, { method: 'DELETE' });
  dlgPatient.close();
  toast('Patient supprimé');
  patients = await api('/api/patients');
  location.hash = '#patients';
};

// ================= Dialogue demande =================
const dlgDemande = $('#dlgDemande');
const formDemande = $('#formDemande');

function ouvrirDemande() {
  formDemande.reset();
  formDemande.hidden = false;
  $('#demandeSucces').hidden = true;
  $('#catalogueDocs').innerHTML = typesDocs.length
    ? typesDocs.map((t) => `
      <label class="coche-doc">
        <input type="checkbox" class="doc-catalogue" value="${t.id}">
        <span>${esc(t.libelle)}${t.aide ? `<span class="muted">${esc(t.aide)}</span>` : ''}</span>
      </label>`).join('')
    : '<p class="catalogue-vide">Aucun document enregistré. <a href="#parametres/documents" onclick="dlgDemande.close()">Créer la liste</a> ou ajoutez-en un ci-dessous.</p>';
  $('#docsLibres').innerHTML = '';
  majResumeDemande();
  dlgDemande.showModal();
}

function majResumeDemande() {
  const n = formDemande.querySelectorAll('.doc-catalogue:checked').length + formDemande.querySelectorAll('.doc-libre').length;
  const formulaire = formDemande.elements.avecFormulaire.checked;
  const parties = [formulaire ? 'Formulaire' : null, n ? `${n} document${n > 1 ? 's' : ''}` : null].filter(Boolean);
  $('#resumeDemande').textContent = parties.join(' + ');
  $('#btnCreerDemande').disabled = !parties.length;
}
formDemande.addEventListener('change', majResumeDemande);

$('#btnDocLibre').onclick = () => {
  const ligne = document.createElement('div');
  ligne.className = 'doc-libre';
  ligne.innerHTML = `
    <div class="row">
      <input class="libelle" placeholder="Nom du document" aria-label="Nom du document" required>
      <button type="button" class="btn ghost sm icon" aria-label="Retirer ce document">${icone('x', 16)}</button>
    </div>
    <input class="aide" placeholder="Précision pour le patient (optionnel)" aria-label="Précision pour le patient">
    <label class="coche"><input type="checkbox" class="garder" checked> Ajouter à ma liste de documents</label>`;
  $('button', ligne).onclick = () => { ligne.remove(); majResumeDemande(); };
  $('#docsLibres').append(ligne);
  majResumeDemande();
  $('.libelle', ligne).focus();
};

formDemande.onsubmit = async (e) => {
  e.preventDefault();
  const coches = [...formDemande.querySelectorAll('.doc-catalogue:checked')].map((i) => i.value);
  const documents = typesDocs.filter((t) => coches.includes(t.id)).map(({ libelle, aide }) => ({ libelle, aide }));
  const nouveaux = [];
  for (const ligne of formDemande.querySelectorAll('.doc-libre')) {
    const doc = { libelle: $('.libelle', ligne).value.trim(), aide: $('.aide', ligne).value.trim() };
    documents.push(doc);
    if ($('.garder', ligne).checked) nouveaux.push(doc);
  }
  const p = courant.p;
  const dem = await pendant($('#btnCreerDemande'), () => api(`/api/patients/${p.id}/demandes`, json('POST', {
    documents,
    avecFormulaire: formDemande.elements.avecFormulaire.checked,
    message: formDemande.elements.message.value,
  })));
  if (nouveaux.length) typesDocs = await api('/api/types-documents', json('PUT', [...typesDocs, ...nouveaux]));

  // Écran de succès : le lien est prêt à copier
  const lien = `${location.origin}/d/${dem.token}`;
  formDemande.hidden = true;
  $('#demandeSucces').hidden = false;
  $('#lienCree').value = lien;
  $('#btnCopierCree').onclick = (ev) => copier(lien, ev.currentTarget);
  $('#btnEmailCree').hidden = !p.email;
  if (p.email) $('#btnEmailCree').href = lienEmail(p, lien);
  $('#btnCopierCree').focus();
  ongletActif = 'demandes';
  recharger();
};

// ================= Paramètres =================
let champsEdition = [];
let typesDocsEdition = [];

function afficherParametres(onglet) {
  if (!paramModifie) {
    champsEdition = structuredClone(champs);
    typesDocsEdition = structuredClone(typesDocs);
  }
  document.title = 'Cabinet – Paramètres';
  document.querySelectorAll('.subtabs a').forEach((a) => a.classList.toggle('active', a.dataset.onglet === onglet));
  $('#paramFiche').hidden = onglet !== 'fiche';
  $('#paramDocuments').hidden = onglet !== 'documents';
  rendreChamps();
  rendreTypesDocs();
  majBarre();
}

function marquerModifie() { paramModifie = true; majBarre(); }
function majBarre() { $('#barreEnregistrer').hidden = !paramModifie; }

const btnOrdre = (i, n) => `
  <div class="ordre">
    <button class="btn ghost sm icon" data-action="monter" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter" title="Monter">${icone('up', 16)}</button>
    <button class="btn ghost sm icon" data-action="descendre" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre" title="Descendre">${icone('down', 16)}</button>
  </div>`;
const btnSuppr = (i) => `<button class="btn ghost sm icon danger-text" data-action="supprimer" data-i="${i}" aria-label="Supprimer" title="Supprimer">${icone('trash', 16)}</button>`;

function rendreChamps() {
  const n = champsEdition.length;
  $('#listeChamps').innerHTML = n ? champsEdition.map((c, i) => {
    if (c.type === 'section') {
      return `
        <div class="card cfg-ligne section">
          ${btnOrdre(i, n)}
          <div class="cfg-corps"><input data-i="${i}" data-k="label" value="${esc(c.label)}" placeholder="Titre de la section" aria-label="Titre de la section"></div>
          ${btnSuppr(i)}
        </div>`;
    }
    const avecOptions = ['liste', 'choix_multiples'].includes(c.type);
    return `
      <div class="card cfg-ligne">
        ${btnOrdre(i, n)}
        <div class="cfg-corps">
          <div class="row">
            <input data-i="${i}" data-k="label" value="${esc(c.label)}" placeholder="Nom du champ" aria-label="Nom du champ">
            <select data-i="${i}" data-k="type" aria-label="Type de champ">
              ${Object.entries(TYPES_CHAMPS).filter(([t]) => t !== 'section').map(([t, l]) =>
                `<option value="${t}" ${t === c.type ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          ${avecOptions ? `<input data-i="${i}" data-k="options" value="${esc(c.options.join(', '))}" placeholder="Choix possibles, séparés par des virgules" aria-label="Choix possibles">` : ''}
          <div class="cfg-options">
            <label class="coche"><input type="checkbox" data-i="${i}" data-k="patient" ${c.patient ? 'checked' : ''}> Demandé au patient</label>
            <label class="coche"><input type="checkbox" data-i="${i}" data-k="requis" ${c.requis ? 'checked' : ''}> Obligatoire</label>
          </div>
        </div>
        ${btnSuppr(i)}
      </div>`;
  }).join('') : '<div class="card vide-onglet">Aucun champ. Ajoutez une section ou un champ pour commencer.</div>';
}

function rendreTypesDocs() {
  const n = typesDocsEdition.length;
  $('#listeTypesDocs').innerHTML = n ? typesDocsEdition.map((t, i) => `
    <div class="card cfg-ligne">
      ${btnOrdre(i, n)}
      <div class="cfg-corps">
        <input data-i="${i}" data-k="libelle" value="${esc(t.libelle)}" placeholder="Nom du document" aria-label="Nom du document">
        <input data-i="${i}" data-k="aide" value="${esc(t.aide)}" placeholder="Précision pour le patient (optionnel)" aria-label="Précision pour le patient">
      </div>
      ${btnSuppr(i)}
    </div>`).join('') : '<div class="card vide-onglet">Aucun document. Ajoutez-en un pour commencer.</div>';
}

// Édition générique d'une liste de paramètres (champs ou documents)
function brancherListe(conteneur, liste, rendre) {
  conteneur.addEventListener('input', (e) => {
    const { i, k } = e.target.dataset;
    if (k === undefined) return;
    const item = liste()[i];
    if (k === 'options') item.options = e.target.value.split(',').map((o) => o.trim()).filter(Boolean);
    else if (e.target.type === 'checkbox') item[k] = e.target.checked;
    else item[k] = e.target.value;
    marquerModifie();
    if (k === 'type') rendre(); // affiche ou masque les choix possibles
  });
  conteneur.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    const l = liste();
    const i = +b.dataset.i;
    const action = b.dataset.action;
    let focus = null;
    if (action === 'supprimer') {
      l.splice(i, 1);
    } else {
      const j = action === 'monter' ? i - 1 : i + 1;
      [l[i], l[j]] = [l[j], l[i]];
      focus = `[data-action="${action}"][data-i="${j}"]`;
    }
    marquerModifie();
    rendre();
    const cible = focus && $(focus, conteneur);
    if (cible && !cible.disabled) cible.focus();
  });
}
brancherListe($('#listeChamps'), () => champsEdition, rendreChamps);
brancherListe($('#listeTypesDocs'), () => typesDocsEdition, rendreTypesDocs);

function ajouterLigne(liste, item, rendre, conteneur) {
  liste.push(item);
  marquerModifie();
  rendre();
  const lignes = conteneur.querySelectorAll('.cfg-ligne');
  const derniere = lignes[lignes.length - 1];
  derniere.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('input', derniere).focus({ preventScroll: true });
}
$('#btnAjoutChamp').onclick = () => ajouterLigne(champsEdition, { label: '', type: 'texte', options: [], requis: false, patient: true }, rendreChamps, $('#listeChamps'));
$('#btnAjoutSection').onclick = () => ajouterLigne(champsEdition, { label: '', type: 'section', options: [] }, rendreChamps, $('#listeChamps'));
$('#btnAjoutTypeDoc').onclick = () => ajouterLigne(typesDocsEdition, { libelle: '', aide: '' }, rendreTypesDocs, $('#listeTypesDocs'));

$('#btnEnregistrerParam').onclick = (e) => pendant(e.currentTarget, async () => {
  // les lignes laissées sans nom sont ignorées
  champs = await api('/api/champs', json('PUT', champsEdition.filter((c) => c.label.trim())));
  typesDocs = await api('/api/types-documents', json('PUT', typesDocsEdition.filter((t) => t.libelle.trim())));
  paramModifie = false;
  afficherParametres(lireRoute().sous === 'documents' ? 'documents' : 'fiche');
  toast('Paramètres enregistrés');
});

$('#btnAnnulerParam').onclick = () => {
  paramModifie = false;
  afficherParametres(lireRoute().sous === 'documents' ? 'documents' : 'fiche');
};

// ================= Démarrage =================
(async () => {
  initIcones();
  [champs, typesDocs, patients] = await Promise.all([
    api('/api/champs'), api('/api/types-documents'), api('/api/patients'),
  ]);
  afficherVue();
})();
