// Déroulement d'une saison : inscriptions, simulation créneau par créneau, classement « Race ».

import { creeRng } from "./rng.js";
import { CALENDRIER } from "./calendrier.js";
import { simuleTableau, simuleFinals } from "./tournoi.js";

// Points de classement de départ : le classement initial suit la note moyenne (n°1 = 10 000 pts),
// puis ces points s'effacent progressivement au fil de la saison.
const pointsInitiaux = (rang) => Math.round(10000 / Math.pow(rang + 1, 0.85));

// Probabilité qu'un joueur s'inscrive à un ATP 500 / 250, selon son classement (0 = n°1).
function envieDeJouer(categorie, rang) {
  if (categorie === "500") return rang < 10 ? 0.5 : 0.65;
  return rang < 10 ? 0.15 : rang < 30 ? 0.45 : 0.7;
}

export class Saison {
  constructor(joueurs, graine) {
    this.graine = graine;
    this.rng = creeRng(graine);
    this.joueurs = joueurs;
    this.points = new Map(joueurs.map((j) => [j.id, 0]));
    this.pointsDepart = new Map(
      [...joueurs].sort((a, b) => b.moyenne - a.moyenne).map((j, rang) => [j.id, pointsInitiaux(rang)]),
    );
    this.bilans = new Map(joueurs.map((j) => [j.id, { v: 0, d: 0, titres: [] }]));
    this.creneaux = CALENDRIER.map((tournois, i) => ({
      semaine: i + 1,
      tournois: tournois.map((t) => ({ ...t, resultat: null })),
    }));
    this.index = 0;
  }

  get terminee() {
    return this.index >= this.creneaux.length;
  }

  get prochainCreneau() {
    return this.creneaux[this.index] ?? null;
  }

  // Points du classement ATP : points de la saison + points de départ qui décroissent jusqu'à 0 en fin de saison.
  pointsClassement(id) {
    const restant = 1 - this.index / this.creneaux.length;
    return this.points.get(id) + Math.round(this.pointsDepart.get(id) * restant);
  }

  // Classement ATP : sert aux inscriptions et aux têtes de série.
  classement() {
    return [...this.joueurs].sort((a, b) => this.pointsClassement(b.id) - this.pointsClassement(a.id) || b.moyenne - a.moyenne);
  }

  // Race : uniquement les points gagnés cette saison (qualification aux ATP Finals).
  classementRace() {
    return [...this.joueurs].sort((a, b) => this.points.get(b.id) - this.points.get(a.id) || b.moyenne - a.moyenne);
  }

  // Répartit les joueurs entre les ATP 500/250 d'un même créneau.
  inscriptions(tournois, classement) {
    const inscrits = new Map(tournois.map((t) => [t, []]));
    const pris = new Set();
    const libres = (t) => t.entrants - inscrits.get(t).length;

    for (const categorie of ["500", "250"]) {
      const groupe = tournois.filter((t) => t.categorie === categorie);
      if (groupe.length === 0) continue;
      classement.forEach((joueur, rang) => {
        if (pris.has(joueur.id) || this.rng.random() >= envieDeJouer(categorie, rang)) return;
        const ouverts = groupe.filter((t) => libres(t) > 0);
        if (ouverts.length === 0) return;
        const moinsRempli = Math.max(...ouverts.map(libres));
        const cible = this.rng.melange(ouverts.filter((t) => libres(t) === moinsRempli))[0];
        inscrits.get(cible).push(joueur);
        pris.add(joueur.id);
      });
    }

    // Tableaux incomplets : complétés au hasard par les joueurs restants
    const restants = this.rng.melange(classement.filter((j) => !pris.has(j.id)));
    for (const t of tournois) {
      while (libres(t) > 0 && restants.length > 0) inscrits.get(t).push(restants.pop());
    }

    const ordre = new Map(classement.map((j, i) => [j.id, i]));
    for (const liste of inscrits.values()) liste.sort((a, b) => ordre.get(a.id) - ordre.get(b.id));
    return inscrits;
  }

  simuleCreneauSuivant() {
    if (this.terminee) return null;
    const creneau = this.creneaux[this.index++];
    const classement = this.classement();
    const petitsTournois = creneau.tournois.filter((t) => t.categorie === "500" || t.categorie === "250");
    const inscrits = this.inscriptions(petitsTournois, classement);

    for (const t of creneau.tournois) {
      const entrants = t.categorie === "FINALS"
        ? this.classementRace().slice(0, t.entrants)
        : inscrits.get(t) ?? classement.slice(0, t.entrants);
      t.resultat = t.categorie === "FINALS" ? simuleFinals(t, entrants, this.rng) : simuleTableau(t, entrants, this.rng);

      for (const [id, pts] of t.resultat.points) this.points.set(id, this.points.get(id) + pts);
      for (const m of t.resultat.matchs) {
        this.bilans.get(m.vainqueur.id).v++;
        this.bilans.get(m.perdant.id).d++;
      }
      this.bilans.get(t.resultat.champion.id).titres.push(t);
    }
    return creneau;
  }

  simuleTout() {
    while (!this.terminee) this.simuleCreneauSuivant();
  }
}
