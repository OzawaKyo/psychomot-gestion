// Rendu et lecture des champs configurables (partagé admin / patient / fiche)

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

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function champInput(c, v) {
  if (c.type === 'section') return `<h3 class="section-titre">${escHtml(c.label)}</h3>`;
  const name = `champ_${c.id}`;
  const req = c.requis ? 'required' : '';
  const val = escHtml(v ?? '');
  let input;
  switch (c.type) {
    case 'texte_long':
      input = `<textarea name="${name}" ${req}>${val}</textarea>`; break;
    case 'nombre':
      input = `<input type="number" step="any" name="${name}" value="${val}" ${req}>`; break;
    case 'date':
      input = `<input type="date" name="${name}" value="${val}" ${req}>`; break;
    case 'liste':
      input = `<select name="${name}" ${req}><option value="">—</option>${c.options.map((o) =>
        `<option ${o === v ? 'selected' : ''}>${escHtml(o)}</option>`).join('')}</select>`; break;
    case 'oui_non':
      input = `<div class="choix">${['Oui', 'Non'].map((o) =>
        `<label><input type="radio" name="${name}" value="${o}" ${o === v ? 'checked' : ''} ${req}> ${o}</label>`).join('')}</div>`; break;
    case 'choix_multiples': {
      const coches = Array.isArray(v) ? v : [];
      input = `<div class="choix">${c.options.map((o) =>
        `<label><input type="checkbox" name="${name}" value="${escHtml(o)}" ${coches.includes(o) ? 'checked' : ''}> ${escHtml(o)}</label>`).join('')}</div>`; break;
    }
    default:
      input = `<input name="${name}" value="${val}" ${req}>`;
  }
  return `<div class="field"><label>${escHtml(c.label)}${c.requis ? ' *' : ''}</label>${input}</div>`;
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

// Les cases à cocher n'ont pas de "required" natif : vérification manuelle
function champsManquants(champs, valeurs) {
  return champs.filter((c) => c.requis && c.type === 'choix_multiples' && !valeurs[c.id]?.length).map((c) => c.label);
}

function valeurAffichee(c, v) {
  if (Array.isArray(v)) v = v.join(', ');
  if (!v) return '<span class="muted">—</span>';
  if (c.type === 'date') return new Date(v).toLocaleDateString('fr-FR');
  return `<span style="white-space:pre-wrap">${escHtml(v)}</span>`;
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
