const $ = (s) => document.querySelector(s);
const esc = escHtml;
const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR');
const fmtTaille = (o) => (o > 1048576 ? (o / 1048576).toFixed(1) + ' Mo' : Math.ceil(o / 1024) + ' Ko');

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Erreur ' + res.status);
    throw new Error(err.error);
  }
  return res.status === 204 ? null : res.json();
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

let patients = [];
let champs = [];
let selectedId = null;
let editingId = null;
let docsCourants = [];
let modeDetails = false;

// ---------- Navigation ----------
function afficherVue() {
  const vue = location.hash === '#formulaire' ? 'formulaire' : 'patients';
  $('#vuePatients').hidden = vue !== 'patients';
  $('#vueFormulaire').hidden = vue !== 'formulaire';
  document.querySelectorAll('[data-vue]').forEach((a) => a.classList.toggle('active', a.dataset.vue === vue));
  if (vue === 'formulaire') ouvrirConfigChamps();
}
window.addEventListener('hashchange', afficherVue);

// ---------- Liste patients ----------
async function chargerPatients() {
  patients = await api('/api/patients');
  afficherListe();
}

function afficherListe() {
  const q = $('#recherche').value.toLowerCase();
  const liste = patients
    .filter((p) => `${p.prenom} ${p.nom}`.toLowerCase().includes(q))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  $('#listePatients').innerHTML = liste.length
    ? liste.map((p) => `
      <li class="${p.id === selectedId ? 'active' : ''}" data-id="${p.id}">
        <span>${esc(p.nom.toUpperCase())} ${esc(p.prenom)}</span>
        <span class="badge">${p.nbDocuments} doc</span>
      </li>`).join('')
    : '<li class="muted">Aucun patient</li>';
}

$('#recherche').addEventListener('input', afficherListe);
$('#listePatients').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (li) { modeDetails = false; selectionner(li.dataset.id); }
});

// ---------- Détail patient ----------
async function selectionner(id) {
  selectedId = id;
  afficherListe();
  const p = patients.find((x) => x.id === id);
  if (!p) { $('#detail').innerHTML = '<div class="card empty">Sélectionnez ou créez un patient.</div>'; return; }

  const [docs, demandes] = await Promise.all([
    api(`/api/patients/${id}/documents`),
    api(`/api/patients/${id}/demandes`),
  ]);
  docsCourants = docs;

  $('#detail').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
        <div>
          <h2>${esc(p.prenom)} ${esc(p.nom)}</h2>
          <div class="muted">
            ${p.dateNaissance ? 'Né(e) le ' + fmtDate(p.dateNaissance) + ' · ' : ''}
            ${esc(p.email) || '—'} · ${esc(p.telephone) || '—'}
          </div>
          ${p.notes ? `<p style="white-space:pre-wrap">${esc(p.notes)}</p>` : ''}
        </div>
        <div class="actions">
          <a class="btn small" href="/fiche.html?id=${p.id}" target="_blank">Voir la fiche complète</a>
          <button class="secondary small" onclick="ouvrirPatient('${p.id}')">Modifier</button>
          <button class="danger small" onclick="supprimerPatient('${p.id}')">Supprimer</button>
        </div>
      </div>
    </div>

    <div class="card" id="carteDetails">${rendreDetails(p)}</div>

    <div class="card">
      <h3>Documents (${docs.length})</h3>
      <div class="dropzone" id="dropzone">Glissez des fichiers ici ou <u>cliquez pour ajouter</u>
        <input type="file" id="inputFichiers" multiple hidden>
      </div>
      ${docs.length ? `
      <table style="margin-top:12px">
        <tr><th>Nom</th><th>Ajouté le</th><th>Taille</th><th></th></tr>
        ${docs.map((d) => `
          <tr>
            <td>
              <a href="/api/documents/${d.id}/fichier" target="_blank">${esc(d.nom)}</a>
              ${d.source === 'patient' ? `<span class="badge patient">déposé par le patient${d.libelle ? ' · ' + esc(d.libelle) : ''}</span>` : ''}
            </td>
            <td>${fmtDate(d.createdAt)}</td>
            <td>${fmtTaille(d.taille)}</td>
            <td class="right">
              <a class="btn secondary small" href="/api/documents/${d.id}/fichier?dl=1">Télécharger</a>
              <button class="secondary small" onclick="renommerDoc('${d.id}')">Renommer</button>
              <button class="danger small" onclick="supprimerDoc('${d.id}')">Supprimer</button>
            </td>
          </tr>`).join('')}
      </table>` : '<p class="muted">Aucun document pour le moment.</p>'}
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">Demandes envoyées au patient</h3>
        <button class="small" onclick="ouvrirDemande()">+ Nouvelle demande</button>
      </div>
      ${demandes.length ? demandes.map((dem) => rendreDemande(dem, p)).join('') : '<p class="muted">Aucune demande envoyée.</p>'}
    </div>`;

  // upload cabinet
  const dz = $('#dropzone'), input = $('#inputFichiers');
  dz.onclick = () => input.click();
  input.onchange = () => envoyerFichiers(input.files);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); envoyerFichiers(e.dataTransfer.files); };
}

function rendreDetails(p) {
  const details = p.details || {};
  if (modeDetails) {
    return `
      <form id="formDetails">
        <h3>Détails du patient</h3>
        ${champs.map((c) => champInput(c, details[c.id])).join('')}
        <div class="actions" style="justify-content:flex-end">
          <button type="button" class="secondary" onclick="basculerDetails(false)">Annuler</button>
          <button type="submit">Enregistrer les détails</button>
        </div>
      </form>`;
  }
  const groupes = grouperParSection(champs);
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3 style="margin:0">Détails du patient</h3>
      <button class="secondary small" onclick="basculerDetails(true)">Modifier les détails</button>
    </div>
    ${groupes.length ? groupes.map((g) => `
      ${g.titre ? `<h4 class="section-titre">${esc(g.titre)}</h4>` : ''}
      <dl class="details">
        ${g.champs.map((c) => `
          <dt>${esc(c.label)}${c.patient ? '' : ' <span class="badge">interne</span>'}</dt>
          <dd>${valeurAffichee(c, details[c.id])}</dd>`).join('')}
      </dl>`).join('')
    : '<p class="muted">Aucun champ configuré. <a href="#formulaire">Configurer les champs</a></p>'}`;
}

function basculerDetails(edition) {
  modeDetails = edition;
  const p = patients.find((x) => x.id === selectedId);
  $('#carteDetails').innerHTML = rendreDetails(p);
  const form = $('#formDetails');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const details = lireChamps(form, champs);
    const manquants = champsManquants(champs, details);
    if (manquants.length) return alert('Champs obligatoires : ' + manquants.join(', '));
    await api(`/api/patients/${selectedId}`, json('PUT', { details }));
    modeDetails = false;
    await rafraichir();
  };
}

function rendreDemande(dem, p) {
  const lien = `${location.origin}/d/${dem.token}`;
  const recus = dem.items.filter((i) => i.documentId).length;
  const etapes = [];
  if (dem.avecFormulaire) {
    etapes.push(dem.formulaireRempliAt
      ? `<span class="badge ok">Formulaire rempli le ${fmtDate(dem.formulaireRempliAt)}</span>`
      : '<span class="badge">Formulaire à remplir</span>');
  }
  if (dem.items.length) {
    etapes.push(`<span class="badge ${recus === dem.items.length ? 'ok' : ''}">${recus}/${dem.items.length} documents reçus</span>`);
  }
  return `
    <div style="border-top:1px solid var(--border);padding:12px 0">
      <div style="display:flex;justify-content:space-between;gap:10px">
        <div>
          <strong>${fmtDate(dem.createdAt)}</strong> ${etapes.join(' ')}
          ${dem.items.length ? `<div class="muted">${dem.items.map((i) => (i.documentId ? '✓ ' : '○ ') + esc(i.libelle)).join(' · ')}</div>` : ''}
        </div>
        <button class="danger small" onclick="supprimerDemande('${dem.id}')">Révoquer</button>
      </div>
      <div class="link-box">
        <input readonly value="${lien}" onclick="this.select()">
        <button class="secondary small" onclick="copier('${lien}', this)">Copier</button>
        ${p.email ? `<a class="btn secondary small" href="mailto:${esc(p.email)}?subject=${encodeURIComponent('Votre dossier – cabinet de psychomotricité')}&body=${encodeURIComponent('Bonjour,\n\nMerci de compléter votre dossier via ce lien :\n' + lien + '\n\nBien cordialement')}">Email</a>` : ''}
      </div>
    </div>`;
}

async function envoyerFichiers(files) {
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('fichiers', f);
  await api(`/api/patients/${selectedId}/documents`, { method: 'POST', body: fd });
  await rafraichir();
}

async function rafraichir() {
  await chargerPatients();
  await selectionner(selectedId);
}

// ---------- Actions patient ----------
const dlgPatient = $('#dlgPatient');
$('#btnNouveau').onclick = () => ouvrirPatient(null);

function ouvrirPatient(id) {
  editingId = id;
  const form = $('#formPatient');
  form.reset();
  $('#dlgTitre').textContent = id ? 'Modifier les informations' : 'Nouveau patient';
  if (id) {
    const p = patients.find((x) => x.id === id);
    for (const k of ['prenom', 'nom', 'dateNaissance', 'email', 'telephone', 'notes']) form.elements[k].value = p[k] || '';
  }
  dlgPatient.showModal();
}

$('#formPatient').onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const p = editingId
    ? await api(`/api/patients/${editingId}`, json('PUT', data))
    : await api('/api/patients', json('POST', data));
  dlgPatient.close();
  selectedId = p.id;
  modeDetails = false;
  location.hash = '#patients';
  await rafraichir();
};

async function supprimerPatient(id) {
  const p = patients.find((x) => x.id === id);
  if (!confirm(`Supprimer ${p.prenom} ${p.nom} et tous ses documents ?`)) return;
  await api(`/api/patients/${id}`, { method: 'DELETE' });
  selectedId = null;
  await rafraichir();
}

// ---------- Actions documents ----------
async function supprimerDoc(id) {
  if (!confirm('Supprimer ce document ?')) return;
  await api(`/api/documents/${id}`, { method: 'DELETE' });
  await rafraichir();
}

async function renommerDoc(id) {
  const nom = docsCourants.find((d) => d.id === id)?.nom;
  const nouveau = prompt('Nouveau nom :', nom);
  if (!nouveau || nouveau === nom) return;
  await api(`/api/documents/${id}`, json('PUT', { nom: nouveau }));
  await rafraichir();
}

// ---------- Demandes ----------
const dlgDemande = $('#dlgDemande');

function majLibelles() {
  const n = Math.min(20, Math.max(0, +$('#nbDocs').value || 0));
  const box = $('#libelles');
  const actuels = [...box.querySelectorAll('input')].map((i) => i.value);
  box.innerHTML = Array.from({ length: n }, (_, i) => `
    <div class="field"><label>Document ${i + 1}</label>
      <input class="libelle" value="${esc(actuels[i] ?? '')}" placeholder="ex : Ordonnance, bilan orthophonique…" required>
    </div>`).join('');
}
$('#nbDocs').addEventListener('input', majLibelles);

function ouvrirDemande() {
  $('#formDemande').reset();
  $('#libelles').innerHTML = '';
  majLibelles();
  dlgDemande.showModal();
}

$('#formDemande').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  const libelles = [...document.querySelectorAll('.libelle')].map((i) => i.value);
  await api(`/api/patients/${selectedId}/demandes`, json('POST', {
    libelles,
    avecFormulaire: form.elements.avecFormulaire.checked,
    message: form.elements.message.value,
  }));
  dlgDemande.close();
  await selectionner(selectedId);
};

async function supprimerDemande(id) {
  if (!confirm('Révoquer ce lien ? Le patient ne pourra plus y accéder (les informations et documents déjà reçus sont conservés).')) return;
  await api(`/api/demandes/${id}`, { method: 'DELETE' });
  await selectionner(selectedId);
}

function copier(texte, btn) {
  navigator.clipboard.writeText(texte);
  btn.textContent = 'Copié ✓';
  setTimeout(() => (btn.textContent = 'Copier'), 1500);
}

// ---------- Configuration des champs ----------
let champsEdition = [];

function ouvrirConfigChamps() {
  champsEdition = structuredClone(champs);
  $('#etatChamps').textContent = '';
  rendreConfigChamps();
}

function marquerModifie() {
  $('#etatChamps').textContent = 'Modifications non enregistrées';
}

function rendreConfigChamps() {
  const n = champsEdition.length;
  $('#listeChamps').innerHTML = n ? champsEdition.map((c, i) => {
    const fleches = `
      <div class="ordre">
        <button class="secondary small" data-action="monter" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button>
        <button class="secondary small" data-action="descendre" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} title="Descendre">↓</button>
      </div>`;
    const suppr = `<button class="danger small" data-action="supprimer" data-i="${i}" title="Supprimer">✕</button>`;
    if (c.type === 'section') {
      return `
        <div class="champ-ligne section">
          ${fleches}
          <input data-i="${i}" data-k="label" value="${esc(c.label)}" placeholder="Titre de la section">
          ${suppr}
        </div>`;
    }
    const avecOptions = ['liste', 'choix_multiples'].includes(c.type);
    return `
      <div class="champ-ligne">
        ${fleches}
        <div class="champ-config">
          <div class="row">
            <input data-i="${i}" data-k="label" value="${esc(c.label)}" placeholder="Libellé du champ">
            <select data-i="${i}" data-k="type">
              ${Object.entries(TYPES_CHAMPS).filter(([t]) => t !== 'section').map(([t, l]) =>
                `<option value="${t}" ${t === c.type ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          ${avecOptions ? `<input data-i="${i}" data-k="options" value="${esc(c.options.join(', '))}" placeholder="Options séparées par des virgules (ex : Oui, Non, Ne sait pas)">` : ''}
          <div class="actions">
            <label class="coche"><input type="checkbox" data-i="${i}" data-k="requis" ${c.requis ? 'checked' : ''}> Obligatoire</label>
            <label class="coche"><input type="checkbox" data-i="${i}" data-k="patient" ${c.patient ? 'checked' : ''}> Demandé au patient</label>
          </div>
        </div>
        ${suppr}
      </div>`;
  }).join('') : '<div class="card empty">Aucun champ. Ajoutez-en un pour commencer.</div>';
}

$('#listeChamps').addEventListener('input', (e) => {
  const { i, k } = e.target.dataset;
  if (k === undefined) return;
  const c = champsEdition[i];
  if (k === 'options') c.options = e.target.value.split(',').map((o) => o.trim()).filter(Boolean);
  else if (k === 'requis' || k === 'patient') c[k] = e.target.checked;
  else c[k] = e.target.value;
  marquerModifie();
  if (k === 'type') rendreConfigChamps(); // affiche/masque le champ options
});

$('#listeChamps').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const i = +btn.dataset.i;
  const { action } = btn.dataset;
  if (action === 'supprimer') {
    const c = champsEdition[i];
    if (!confirm(`Supprimer « ${c.label || 'sans titre'} » ? Les valeurs déjà saisies pour ce champ ne seront plus affichées.`)) return;
    champsEdition.splice(i, 1);
  } else {
    const j = action === 'monter' ? i - 1 : i + 1;
    [champsEdition[i], champsEdition[j]] = [champsEdition[j], champsEdition[i]];
  }
  marquerModifie();
  rendreConfigChamps();
});

function ajouterChamp(type) {
  champsEdition.push({ label: '', type, options: [], requis: false, patient: type !== 'section' });
  marquerModifie();
  rendreConfigChamps();
  const inputs = $('#listeChamps').querySelectorAll('input[data-k="label"]');
  inputs[inputs.length - 1].focus();
}
$('#btnAjoutChamp').onclick = () => ajouterChamp('texte');
$('#btnAjoutSection').onclick = () => ajouterChamp('section');

$('#btnEnregistrerChamps').onclick = async () => {
  champs = await api('/api/champs', json('PUT', champsEdition));
  champsEdition = structuredClone(champs);
  rendreConfigChamps();
  $('#etatChamps').textContent = 'Enregistré ✓';
};

// ---------- Démarrage ----------
(async () => {
  champs = await api('/api/champs');
  await chargerPatients();
  afficherVue();
})();
