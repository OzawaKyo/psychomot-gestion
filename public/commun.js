// Utilitaires partagés : cabinet, page patient, fiche imprimable

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR');
const fmtTaille = (o) => (o > 1048576 ? (o / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(o / 1024)) + ' Ko');

function age(dateNaissance) {
  if (!dateNaissance) return null;
  const n = new Date(dateNaissance), auj = new Date();
  let a = auj.getFullYear() - n.getFullYear();
  if (auj < new Date(auj.getFullYear(), n.getMonth(), n.getDate())) a--;
  return a;
}

// ---------- Icônes (Lucide, trait 2px) ----------
const ICONES = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
};

function icone(nom, taille = 18) {
  return `<svg class="ic" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom]}</svg>`;
}

// ---------- Notifications ----------
function toast(message, type = 'ok') {
  let zone = document.getElementById('toasts');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'toasts';
    zone.setAttribute('role', 'status');
    zone.setAttribute('aria-live', 'polite');
  }
  // une fenêtre modale passe au-dessus de la page : la zone doit être dedans pour rester visible
  const modales = document.querySelectorAll('dialog[open]');
  const parent = modales[modales.length - 1] || document.body;
  if (zone.parentElement !== parent) parent.append(zone);
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icone(type === 'erreur' ? 'alert' : 'check')}<span>${escHtml(message)}</span>`;
  zone.append(el);
  setTimeout(() => el.classList.add('sortie'), type === 'erreur' ? 5000 : 2800);
  setTimeout(() => el.remove(), type === 'erreur' ? 5400 : 3200);
}

// ---------- Confirmation (remplace window.confirm) ----------
function confirmer({ titre, message = '', bouton = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg-confirm';
    dlg.innerHTML = `
      <h2>${escHtml(titre)}</h2>
      ${message ? `<p>${escHtml(message)}</p>` : ''}
      <div class="dlg-actions">
        <button type="button" class="btn" value="non">Annuler</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" value="oui">${escHtml(bouton)}</button>
      </div>`;
    const fin = (ok) => { dlg.close(); dlg.remove(); resolve(ok); };
    dlg.querySelectorAll('button').forEach((b) => (b.onclick = () => fin(b.value === 'oui')));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); fin(false); });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('button[value=non]').focus();
  });
}

// ---------- Champs configurables ----------
const TYPES_CHAMPS = {
  section: 'Titre de section',
  texte: 'Texte court',
  texte_long: 'Texte long',
  nombre: 'Nombre',
  date: 'Date',
  liste: 'Liste déroulante',
  choix_multiples: 'Cases à cocher',
  oui_non: 'Oui / Non',
};

function champInput(c, v) {
  if (c.type === 'section') return `<h3 class="section-titre">${escHtml(c.label)}</h3>`;
  const name = `champ_${c.id}`;
  const req = c.requis ? 'required' : '';
  const etoile = c.requis ? ' <span class="requis" aria-hidden="true">*</span>' : '';
  const val = escHtml(v ?? '');

  if (c.type === 'oui_non' || c.type === 'choix_multiples') {
    const multiple = c.type === 'choix_multiples';
    const options = multiple ? c.options : ['Oui', 'Non'];
    const coches = multiple ? (Array.isArray(v) ? v : []) : [v];
    return `
      <fieldset class="field" data-champ="${c.id}">
        <legend>${escHtml(c.label)}${etoile}</legend>
        <div class="choix">${options.map((o) => `
          <label class="choix-option">
            <input type="${multiple ? 'checkbox' : 'radio'}" name="${name}" value="${escHtml(o)}" ${coches.includes(o) ? 'checked' : ''} ${!multiple ? req : ''}>
            <span>${escHtml(o)}</span>
          </label>`).join('')}
        </div>
        <p class="erreur-champ" hidden></p>
      </fieldset>`;
  }

  let input;
  switch (c.type) {
    case 'texte_long':
      input = `<textarea id="${name}" name="${name}" rows="3" ${req}>${val}</textarea>`; break;
    case 'nombre':
      input = `<input id="${name}" type="number" step="any" inputmode="decimal" name="${name}" value="${val}" ${req}>`; break;
    case 'date':
      input = `<input id="${name}" type="date" name="${name}" value="${val}" ${req}>`; break;
    case 'liste':
      input = `<select id="${name}" name="${name}" ${req}><option value="">Choisir…</option>${c.options.map((o) =>
        `<option ${o === v ? 'selected' : ''}>${escHtml(o)}</option>`).join('')}</select>`; break;
    default:
      input = `<input id="${name}" name="${name}" value="${val}" ${req}>`;
  }
  return `<div class="field"><label for="${name}">${escHtml(c.label)}${etoile}</label>${input}</div>`;
}

function lireChamps(form, champs) {
  const valeurs = {};
  for (const c of champs) {
    if (c.type === 'section') continue;
    const name = `champ_${c.id}`;
    if (c.type === 'choix_multiples') {
      valeurs[c.id] = [...form.querySelectorAll(`[name="${name}"]:checked`)].map((i) => i.value);
    } else if (c.type === 'oui_non') {
      valeurs[c.id] = form.querySelector(`[name="${name}"]:checked`)?.value || '';
    } else {
      valeurs[c.id] = form.elements[name]?.value ?? '';
    }
  }
  return valeurs;
}

// Les cases à cocher n'ont pas de "required" natif : vérification manuelle, erreur affichée sous le champ
function verifierCasesRequises(form, champs, valeurs) {
  let premier = null;
  for (const c of champs) {
    if (c.type !== 'choix_multiples') continue;
    const bloc = form.querySelector(`[data-champ="${c.id}"]`);
    const err = bloc?.querySelector('.erreur-champ');
    if (!err) continue;
    const manque = c.requis && !valeurs[c.id]?.length;
    err.hidden = !manque;
    err.textContent = manque ? 'Cochez au moins une option.' : '';
    if (manque && !premier) premier = bloc;
  }
  premier?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !premier;
}

function valeurAffichee(c, v) {
  if (Array.isArray(v)) v = v.join(', ');
  if (!v) return '<span class="vide">Non renseigné</span>';
  if (c.type === 'date') return fmtDate(v);
  return `<span class="pre">${escHtml(v)}</span>`;
}

// [{ titre, champs }] : les champs avant la première section sont regroupés sans titre
function grouperParSection(champs) {
  const groupes = [{ titre: null, champs: [] }];
  for (const c of champs) {
    if (c.type === 'section') groupes.push({ titre: c.label, champs: [] });
    else groupes[groupes.length - 1].champs.push(c);
  }
  return groupes.filter((g) => g.champs.length);
}
