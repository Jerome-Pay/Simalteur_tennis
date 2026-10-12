// Tableaux à élimination directe (têtes de série, byes) et ATP Finals (poules + phase finale).

import { simuleMatch, formatScore } from "./match.js";

// Points ATP gagnés selon le tour où le joueur est éliminé (clé = nombre de joueurs dans ce tour).
// « premierMatch » : joueur battu sans avoir gagné de match (ex. tête de série exemptée puis battue).
export const BAREMES = {
  GC: { vainqueur: 2000, 2: 1300, 4: 800, 8: 400, 16: 200, 32: 100, 64: 50, 128: 10, premierMatch: 10 },
  M1000: { vainqueur: 1000, 2: 650, 4: 400, 8: 200, 16: 100, 32: 50, 64: 30, 128: 10, premierMatch: 10 },
  500: { vainqueur: 500, 2: 330, 4: 200, 8: 100, 16: 50, 32: 0, premierMatch: 0 },
  250: { vainqueur: 250, 2: 165, 4: 100, 8: 50, 16: 25, 32: 0, premierMatch: 0 },
};
export const BAREME_FINALS = { victoirePoule: 200, victoireDemi: 400, victoireFinale: 500 };

const MEILLEUR_DE = { GC: 5, M1000: 3, 500: 3, 250: 3, FINALS: 3 };

// Ordre standard des têtes de série dans un tableau : [1, n, n/2+1, n/2, ...] par position.
function ordreTetes(taille) {
  let ordre = [1, 2];
  while (ordre.length < taille) {
    const m = ordre.length * 2;
    ordre = ordre.flatMap((x) => [x, m + 1 - x]);
  }
  return ordre;
}

/**
 * Place les entrants (triés par classement) dans un tableau de `taille` places.
 * Têtes de série : taille/4 (1 et 2 aux extrémités, 3-4 tirées au sort, puis 5-8, 9-16, 17-32).
 * Byes : attribués aux meilleures têtes de série. Renvoie un tableau de joueurs (null = bye).
 */
export function creeTableau(entrants, taille, rng) {
  const nbByes = taille - entrants.length;
  const nbTetes = Math.min(taille / 4, entrants.length);
  const parValeur = new Array(taille + 1).fill(null);

  const bornes = [0, 1, 2, 4, 8, 16, 32].filter((b) => b <= nbTetes);
  for (let g = 0; g < bornes.length - 1; g++) {
    const valeurs = [];
    for (let v = bornes[g] + 1; v <= bornes[g + 1]; v++) valeurs.push(v);
    rng.melange(valeurs).forEach((v, i) => {
      parValeur[v] = entrants[bornes[g] + i];
    });
  }

  const valeursLibres = [];
  for (let v = nbTetes + 1; v <= taille - nbByes; v++) valeursLibres.push(v);
  rng.melange(valeursLibres).forEach((v, i) => {
    parValeur[v] = entrants[nbTetes + i];
  });

  return ordreTetes(taille).map((v) => parValeur[v]);
}

function nomTour(nbJoueurs, taille) {
  if (nbJoueurs === 2) return "Finale";
  if (nbJoueurs === 4) return "Demi-finales";
  if (nbJoueurs === 8) return "Quarts de finale";
  if (nbJoueurs === 16) return "8es de finale";
  const numero = Math.log2(taille / nbJoueurs) + 1;
  return numero === 1 ? "1er tour" : `${numero}e tour`;
}

function joueMatch(a, b, tournoi, rng) {
  const r = simuleMatch(a, b, tournoi.surface, MEILLEUR_DE[tournoi.categorie], rng);
  return { a, b, vainqueur: r.vainqueur, perdant: r.perdant, sets: r.sets, score: formatScore(r.sets) };
}

/** Simule un tournoi à élimination directe. `entrants` est trié par classement. */
export function simuleTableau(tournoi, entrants, rng) {
  const bareme = BAREMES[tournoi.categorie];
  const tetes = new Map(entrants.slice(0, tournoi.taille / 4).map((j, i) => [j.id, i + 1]));
  const points = new Map();
  const aGagneUnMatch = new Set();
  const tours = [];
  const matchs = [];

  let tour = creeTableau(entrants, tournoi.taille, rng);
  while (tour.length > 1) {
    const nbJoueurs = tour.length;
    const matchsDuTour = [];
    const suivant = [];
    for (let i = 0; i < nbJoueurs; i += 2) {
      const a = tour[i];
      const b = tour[i + 1];
      if (!a || !b) {
        matchsDuTour.push({ a, b, vainqueur: a || b, bye: true });
        suivant.push(a || b);
        continue;
      }
      const m = joueMatch(a, b, tournoi, rng);
      matchsDuTour.push(m);
      matchs.push(m);
      suivant.push(m.vainqueur);
      aGagneUnMatch.add(m.vainqueur.id);
      points.set(m.perdant.id, aGagneUnMatch.has(m.perdant.id) ? bareme[nbJoueurs] : bareme.premierMatch);
    }
    tours.push({ nom: nomTour(nbJoueurs, tournoi.taille), matchs: matchsDuTour });
    tour = suivant;
  }

  const champion = tour[0];
  points.set(champion.id, bareme.vainqueur);
  const finale = tours[tours.length - 1].matchs[0];
  return { type: "tableau", tours, tetes, points, matchs, champion, finaliste: finale.perdant, scoreFinale: finale.score };
}

/** ATP Finals : 2 poules de 4 (1 et 2 séparés, puis 3-4, 5-6, 7-8 tirés au sort), demies croisées, finale. */
export function simuleFinals(tournoi, qualifies, rng) {
  const poules = [[qualifies[0]], [qualifies[1]]];
  for (let i = 2; i < 8; i += 2) {
    const [x, y] = rng.melange([qualifies[i], qualifies[i + 1]]);
    poules[0].push(x);
    poules[1].push(y);
  }

  const points = new Map(qualifies.map((j) => [j.id, 0]));
  const ajoute = (j, pts) => points.set(j.id, points.get(j.id) + pts);
  const matchs = [];

  const groupes = poules.map((joueurs, g) => {
    const lignes = new Map(joueurs.map((j) => [j.id, { joueur: j, v: 0, d: 0, setsG: 0, setsP: 0, jeuxG: 0, jeuxP: 0 }]));
    const matchsPoule = [];
    for (const [i, k] of [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]]) {
      const m = joueMatch(joueurs[i], joueurs[k], tournoi, rng);
      matchsPoule.push(m);
      matchs.push(m);
      ajoute(m.vainqueur, BAREME_FINALS.victoirePoule);
      const lv = lignes.get(m.vainqueur.id);
      const lp = lignes.get(m.perdant.id);
      lv.v++;
      lp.d++;
      for (const [x, y] of m.sets) {
        if (x > y) { lv.setsG++; lp.setsP++; } else { lp.setsG++; lv.setsP++; }
        lv.jeuxG += x; lv.jeuxP += y;
        lp.jeuxG += y; lp.jeuxP += x;
      }
    }
    const ratio = (g, p) => g / Math.max(g + p, 1);
    const classement = [...lignes.values()].sort(
      (x, y) => y.v - x.v || ratio(y.setsG, y.setsP) - ratio(x.setsG, x.setsP) || ratio(y.jeuxG, y.jeuxP) - ratio(x.jeuxG, x.jeuxP),
    );
    return { nom: g === 0 ? "Groupe A" : "Groupe B", classement, matchs: matchsPoule };
  });

  const [a, b] = groupes.map((g) => g.classement);
  const demis = [joueMatch(a[0].joueur, b[1].joueur, tournoi, rng), joueMatch(b[0].joueur, a[1].joueur, tournoi, rng)];
  demis.forEach((m) => ajoute(m.vainqueur, BAREME_FINALS.victoireDemi));
  const finale = joueMatch(demis[0].vainqueur, demis[1].vainqueur, tournoi, rng);
  ajoute(finale.vainqueur, BAREME_FINALS.victoireFinale);
  matchs.push(...demis, finale);

  return {
    type: "finals",
    groupes,
    tours: [{ nom: "Demi-finales", matchs: demis }, { nom: "Finale", matchs: [finale] }],
    tetes: new Map(qualifies.map((j, i) => [j.id, i + 1])),
    points,
    matchs,
    champion: finale.vainqueur,
    finaliste: finale.perdant,
    scoreFinale: finale.score,
  };
}
