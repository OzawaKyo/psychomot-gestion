const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3010;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- Champs configurables de la fiche patient ---
// patient: true = demandé au patient dans le formulaire du lien ; false = usage interne
const TYPES_CHAMPS = ['section', 'texte', 'texte_long', 'nombre', 'date', 'liste', 'choix_multiples', 'oui_non'];
const CHAMPS_DEFAUT = [
  { label: 'Motif de consultation', type: 'section' },
  { label: 'Motif de la demande', type: 'texte_long', requis: true, patient: true },
  { label: 'Adressé par', type: 'texte', patient: true },
  { label: 'Scolarité', type: 'section' },
  { label: 'École', type: 'texte', patient: true },
  { label: 'Classe', type: 'texte', patient: true },
  { label: 'Santé', type: 'section' },
  { label: 'Médecin traitant', type: 'texte', patient: true },
  { label: 'Antécédents médicaux', type: 'texte_long', patient: true },
  { label: 'Suivis en cours', type: 'choix_multiples', options: ['Orthophonie', 'Ergothérapie', 'Psychologue', 'Kinésithérapie', 'Autre'], patient: true },
  { label: 'Notes cliniques', type: 'section' },
  { label: 'Observations', type: 'texte_long', patient: false },
].map((c, i) => ({ id: `defaut-${i}`, options: [], requis: false, patient: false, ...c }));

// --- Catalogue des documents qu'on peut demander au patient ---
// aide : précision affichée au patient sous le nom du document
const TYPES_DOCUMENTS_DEFAUT = [
  { libelle: 'Ordonnance', aide: 'Prescription du médecin pour le bilan ou la rééducation' },
  { libelle: 'Attestation de carte vitale', aide: '' },
  { libelle: 'Attestation de mutuelle', aide: '' },
  { libelle: 'Carnet de santé', aide: 'Pages de suivi du développement et des vaccins' },
  { libelle: 'Bilan orthophonique', aide: 'Si un bilan a déjà été réalisé' },
  { libelle: 'Dernier bulletin scolaire', aide: '' },
].map((d, i) => ({ id: `defaut-${i}`, ...d }));

// --- Stockage JSON (maquette) ---
function load() {
  const db = fs.existsSync(DATA_FILE)
    ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    : { patients: [], documents: [], demandes: [] };
  db.champs ??= CHAMPS_DEFAUT;
  db.typesDocuments ??= TYPES_DOCUMENTS_DEFAUT;
  return db;
}
function save(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
const id = () => crypto.randomUUID();

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, id() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// multer décode les noms en latin1 : on remet en UTF-8 pour les accents
const originalName = (file) => Buffer.from(file.originalname, 'latin1').toString('utf8');

function addDocument(db, patientId, file, source, extra = {}) {
  const doc = {
    id: id(),
    patientId,
    nom: originalName(file),
    fichier: file.filename,
    taille: file.size,
    type: file.mimetype,
    source,
    createdAt: new Date().toISOString(),
    ...extra,
  };
  db.documents.push(doc);
  return doc;
}

function removeFile(doc) {
  fs.rm(path.join(UPLOAD_DIR, doc.fichier), { force: true }, () => {});
}

const app = express();

// --- Protection de l'espace psychomotricienne (mot de passe via ADMIN_PASSWORD) ---
// La page patient (/d/...), son API et la feuille de style restent publiques.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const estPublic = (p) => p === '/style.css' || p.startsWith('/d/') || p.startsWith('/api/public/');
const egal = (a, b) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

app.use((req, res, next) => {
  if (!ADMIN_PASSWORD || estPublic(req.path)) return next();
  const [type, valeur] = (req.headers.authorization || '').split(' ');
  if (type === 'Basic' && valeur) {
    const [user, ...reste] = Buffer.from(valeur, 'base64').toString().split(':');
    if (egal(user, ADMIN_USER) && egal(reste.join(':'), ADMIN_PASSWORD)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Cabinet", charset="UTF-8"').status(401).send('Accès réservé');
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ================= Espace psychomotricienne =================

// Patients
app.get('/api/patients', (req, res) => {
  const db = load();
  res.json(db.patients.map((p) => ({
    ...p,
    nbDocuments: db.documents.filter((d) => d.patientId === p.id).length,
  })));
});

app.post('/api/patients', (req, res) => {
  const { nom, prenom } = req.body;
  if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });
  const db = load();
  const patient = {
    id: id(),
    nom, prenom,
    dateNaissance: req.body.dateNaissance || '',
    email: req.body.email || '',
    telephone: req.body.telephone || '',
    notes: req.body.notes || '',
    createdAt: new Date().toISOString(),
  };
  db.patients.push(patient);
  save(db);
  res.status(201).json(patient);
});

app.put('/api/patients/:id', (req, res) => {
  const db = load();
  const patient = db.patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient introuvable' });
  for (const k of ['nom', 'prenom', 'dateNaissance', 'email', 'telephone', 'notes']) {
    if (req.body[k] !== undefined) patient[k] = req.body[k];
  }
  if (req.body.details && typeof req.body.details === 'object') {
    patient.details = { ...patient.details, ...nettoyerValeurs(db.champs, req.body.details) };
  }
  save(db);
  res.json(patient);
});

// Configuration des champs de la fiche
app.get('/api/champs', (req, res) => res.json(load().champs));

app.put('/api/champs', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Liste attendue' });
  const champs = [];
  for (const c of req.body) {
    const label = String(c.label || '').trim();
    if (!label) return res.status(400).json({ error: 'Chaque champ doit avoir un libellé' });
    if (!TYPES_CHAMPS.includes(c.type)) return res.status(400).json({ error: `Type inconnu : ${c.type}` });
    const options = Array.isArray(c.options) ? c.options.map((o) => String(o).trim()).filter(Boolean) : [];
    if (['liste', 'choix_multiples'].includes(c.type) && !options.length) {
      return res.status(400).json({ error: `« ${label} » : ajoutez au moins une option` });
    }
    champs.push({
      id: c.id || id(), label, type: c.type, options,
      requis: c.type !== 'section' && !!c.requis,
      patient: c.type !== 'section' && !!c.patient,
    });
  }
  const db = load();
  db.champs = champs;
  save(db);
  res.json(champs);
});

// Catalogue des documents
app.get('/api/types-documents', (req, res) => res.json(load().typesDocuments));

app.put('/api/types-documents', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Liste attendue' });
  const types = [];
  for (const t of req.body) {
    const libelle = String(t.libelle || '').trim();
    if (!libelle) return res.status(400).json({ error: 'Chaque document doit avoir un nom' });
    types.push({ id: t.id || id(), libelle, aide: String(t.aide || '').trim() });
  }
  const db = load();
  db.typesDocuments = types;
  save(db);
  res.json(types);
});

// Ne garde que les champs connus, avec une valeur au bon format
function nettoyerValeurs(champs, valeurs) {
  const propres = {};
  for (const c of champs) {
    if (c.type === 'section' || !(c.id in valeurs)) continue;
    const v = valeurs[c.id];
    propres[c.id] = c.type === 'choix_multiples'
      ? (Array.isArray(v) ? v.map(String).filter((o) => c.options.includes(o)) : [])
      : String(v ?? '').trim().slice(0, 5000);
  }
  return propres;
}

const estVide = (v) => (Array.isArray(v) ? !v.length : !v);

// Champs à présenter au patient, avec leurs titres de section (sections vides retirées)
function champsPatient(champs) {
  const out = [];
  let section = null;
  for (const c of champs) {
    if (c.type === 'section') { section = c; continue; }
    if (!c.patient) continue;
    if (section) { out.push(section); section = null; }
    out.push(c);
  }
  return out;
}

app.delete('/api/patients/:id', (req, res) => {
  const db = load();
  const pid = req.params.id;
  db.documents.filter((d) => d.patientId === pid).forEach(removeFile);
  db.patients = db.patients.filter((p) => p.id !== pid);
  db.documents = db.documents.filter((d) => d.patientId !== pid);
  db.demandes = db.demandes.filter((d) => d.patientId !== pid);
  save(db);
  res.status(204).end();
});

// Documents
app.get('/api/patients/:id/documents', (req, res) => {
  const db = load();
  res.json(db.documents.filter((d) => d.patientId === req.params.id));
});

app.post('/api/patients/:id/documents', upload.array('fichiers'), (req, res) => {
  const db = load();
  if (!db.patients.some((p) => p.id === req.params.id)) {
    req.files.forEach((f) => removeFile({ fichier: f.filename }));
    return res.status(404).json({ error: 'Patient introuvable' });
  }
  const docs = req.files.map((f) => addDocument(db, req.params.id, f, 'cabinet'));
  save(db);
  res.status(201).json(docs);
});

app.put('/api/documents/:id', (req, res) => {
  const db = load();
  const doc = db.documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  if (req.body.nom) doc.nom = req.body.nom;
  save(db);
  res.json(doc);
});

app.get('/api/documents/:id/fichier', (req, res) => {
  const doc = load().documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).send('Document introuvable');
  const file = path.join(UPLOAD_DIR, doc.fichier);
  if (req.query.dl) return res.download(file, doc.nom);
  res.type(doc.type).sendFile(file);
});

app.delete('/api/documents/:id', (req, res) => {
  const db = load();
  const doc = db.documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).end();
  removeFile(doc);
  db.documents = db.documents.filter((d) => d.id !== doc.id);
  // libère l'emplacement dans une éventuelle demande
  for (const dem of db.demandes) {
    for (const item of dem.items) if (item.documentId === doc.id) item.documentId = null;
  }
  save(db);
  res.status(204).end();
});

// Demandes de documents (liens patients)
app.get('/api/patients/:id/demandes', (req, res) => {
  res.json(load().demandes.filter((d) => d.patientId === req.params.id));
});

app.post('/api/patients/:id/demandes', (req, res) => {
  const db = load();
  if (!db.patients.some((p) => p.id === req.params.id)) {
    return res.status(404).json({ error: 'Patient introuvable' });
  }
  const documents = (Array.isArray(req.body.documents) ? req.body.documents : [])
    .map((d) => ({ libelle: String(d.libelle || '').trim(), aide: String(d.aide || '').trim() }))
    .filter((d) => d.libelle);
  const avecFormulaire = !!req.body.avecFormulaire;
  if (!documents.length && !avecFormulaire) {
    return res.status(400).json({ error: 'Demandez au moins le formulaire ou un document' });
  }
  const demande = {
    id: id(),
    token: crypto.randomBytes(16).toString('hex'),
    patientId: req.params.id,
    message: req.body.message || '',
    avecFormulaire,
    formulaireRempliAt: null,
    items: documents.map((d) => ({ id: id(), ...d, documentId: null })),
    createdAt: new Date().toISOString(),
  };
  db.demandes.push(demande);
  save(db);
  res.status(201).json(demande);
});

app.delete('/api/demandes/:id', (req, res) => {
  const db = load();
  db.demandes = db.demandes.filter((d) => d.id !== req.params.id);
  save(db);
  res.status(204).end();
});

// ================= Espace patient (via lien) =================

app.get('/d/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'depot.html')));

function findDemande(db, token) {
  return db.demandes.find((d) => d.token === token);
}

app.get('/api/public/demandes/:token', (req, res) => {
  const db = load();
  const dem = findDemande(db, req.params.token);
  if (!dem) return res.status(404).json({ error: 'Lien invalide ou expiré' });
  const patient = db.patients.find((p) => p.id === dem.patientId);
  const champs = dem.avecFormulaire ? champsPatient(db.champs) : [];
  const valeurs = {};
  for (const c of champs) if (patient?.details?.[c.id] !== undefined) valeurs[c.id] = patient.details[c.id];
  res.json({
    prenom: patient?.prenom || '',
    message: dem.message,
    avecFormulaire: !!dem.avecFormulaire,
    formulaireRempli: !!dem.formulaireRempliAt,
    champs,
    valeurs,
    items: dem.items.map((it) => {
      const doc = it.documentId && db.documents.find((d) => d.id === it.documentId);
      return { id: it.id, libelle: it.libelle, aide: it.aide || '', depose: !!doc, nomFichier: doc?.nom || null };
    }),
  });
});

app.post('/api/public/demandes/:token/formulaire', (req, res) => {
  const db = load();
  const dem = findDemande(db, req.params.token);
  const patient = dem && db.patients.find((p) => p.id === dem.patientId);
  if (!patient || !dem.avecFormulaire) return res.status(404).json({ error: 'Lien invalide' });
  // seuls les champs destinés au patient peuvent être modifiés via le lien
  const champs = champsPatient(db.champs);
  const valeurs = nettoyerValeurs(champs, req.body || {});
  const manquants = champs.filter((c) => c.requis && estVide(valeurs[c.id])).map((c) => c.label);
  if (manquants.length) return res.status(400).json({ error: `Champs obligatoires : ${manquants.join(', ')}` });
  patient.details = { ...patient.details, ...valeurs };
  dem.formulaireRempliAt = new Date().toISOString();
  save(db);
  res.json({ ok: true });
});

app.post('/api/public/demandes/:token/items/:itemId', upload.single('fichier'), (req, res) => {
  const db = load();
  const dem = findDemande(db, req.params.token);
  const item = dem?.items.find((i) => i.id === req.params.itemId);
  if (!item || !req.file) {
    if (req.file) removeFile({ fichier: req.file.filename });
    return res.status(404).json({ error: 'Lien invalide' });
  }
  // remplace un dépôt précédent pour ce même emplacement
  const ancien = db.documents.find((d) => d.id === item.documentId);
  if (ancien) {
    removeFile(ancien);
    db.documents = db.documents.filter((d) => d.id !== ancien.id);
  }
  const doc = addDocument(db, dem.patientId, req.file, 'patient', { libelle: item.libelle });
  item.documentId = doc.id;
  save(db);
  res.status(201).json({ ok: true, nomFichier: doc.nom });
});

app.listen(PORT, () => console.log(`Psychomot gestion : http://localhost:${PORT}`));
