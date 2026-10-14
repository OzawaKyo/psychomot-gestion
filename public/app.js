const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
let selectedId = null;
let editingId = null;
let docsCourants = [];

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
  if (li) selectionner(li.dataset.id);
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
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
        <div>
          <h2>${esc(p.prenom)} ${esc(p.nom)}</h2>
          <div class="muted">
            ${p.dateNaissance ? 'Né(e) le ' + fmtDate(p.dateNaissance) + ' · ' : ''}
            ${esc(p.email) || '—'} · ${esc(p.telephone) || '—'}
          </div>
          ${p.notes ? `<p style="white-space:pre-wrap">${esc(p.notes)}</p>` : ''}
        </div>
        <div class="actions">
          <button class="secondary small" onclick="ouvrirPatient('${p.id}')">Modifier</button>
          <button class="danger small" onclick="supprimerPatient('${p.id}')">Supprimer</button>
        </div>
      </div>
    </div>

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
        <h3 style="margin:0">Liens de dépôt envoyés</h3>
        <button class="small" onclick="ouvrirDemande()">+ Demander des documents</button>
      </div>
      ${demandes.length ? demandes.map((dem) => {
        const lien = `${location.origin}/d/${dem.token}`;
        const recus = dem.items.filter((i) => i.documentId).length;
        return `
        <div style="border-top:1px solid var(--border);padding:12px 0">
          <div style="display:flex;justify-content:space-between;gap:10px">
            <div>
              <strong>${fmtDate(dem.createdAt)}</strong>
              <span class="badge ${recus === dem.items.length ? 'ok' : ''}">${recus}/${dem.items.length} reçus</span>
              <div class="muted">${dem.items.map((i) => (i.documentId ? '✓ ' : '○ ') + esc(i.libelle)).join(' · ')}</div>
            </div>
            <button class="danger small" onclick="supprimerDemande('${dem.id}')">Révoquer</button>
          </div>
          <div class="link-box">
            <input readonly value="${lien}" onclick="this.select()">
            <button class="secondary small" onclick="copier('${lien}', this)">Copier</button>
            ${p.email ? `<a class="btn secondary small" href="mailto:${esc(p.email)}?subject=${encodeURIComponent('Documents à déposer')}&body=${encodeURIComponent('Bonjour,\n\nMerci de déposer vos documents via ce lien :\n' + lien + '\n\nBien cordialement')}">Email</a>` : ''}
          </div>
        </div>`;
      }).join('') : '<p class="muted">Aucun lien généré.</p>'}
    </div>`;

  // upload cabinet
  const dz = $('#dropzone'), input = $('#inputFichiers');
  dz.onclick = () => input.click();
  input.onchange = () => envoyerFichiers(input.files);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); envoyerFichiers(e.dataTransfer.files); };
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
  $('#dlgTitre').textContent = id ? 'Modifier le patient' : 'Nouveau patient';
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
  const n = Math.min(20, Math.max(1, +$('#nbDocs').value || 1));
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
  const libelles = [...document.querySelectorAll('.libelle')].map((i) => i.value);
  await api(`/api/patients/${selectedId}/demandes`, json('POST', { libelles, message: e.target.elements.message.value }));
  dlgDemande.close();
  await selectionner(selectedId);
};

async function supprimerDemande(id) {
  if (!confirm('Révoquer ce lien ? Le patient ne pourra plus déposer de documents (les documents déjà reçus sont conservés).')) return;
  await api(`/api/demandes/${id}`, { method: 'DELETE' });
  await selectionner(selectedId);
}

function copier(texte, btn) {
  navigator.clipboard.writeText(texte);
  btn.textContent = 'Copié ✓';
  setTimeout(() => (btn.textContent = 'Copier'), 1500);
}

chargerPatients();
