// Simulation d'un match point par point : point -> jeu -> set (tie-break) -> match.

export const PARAMS_MATCH = {
  probaServiceBase: 0.63, // probabilité de gagner un point sur son service à notes égales
  coefNote: 0.003,        // +0,3 % de points gagnés au service par point de note d'écart
  ecartForme: 3,          // forme du jour : bruit gaussien (écart-type en points de note)
  probaMin: 0.35,
  probaMax: 0.9,
};

const borne = (x) => Math.min(Math.max(x, PARAMS_MATCH.probaMin), PARAMS_MATCH.probaMax);

// Jeu de service : renvoie true si le serveur gagne le jeu.
function jeu(probaServeur, rng) {
  let s = 0;
  let r = 0;
  for (;;) {
    if (rng.random() < probaServeur) s++;
    else r++;
    if (s >= 4 && s - r >= 2) return true;
    if (r >= 4 && r - s >= 2) return false;
  }
}

function tieBreak(pA, pB, aServeEnPremier, cible, rng) {
  let a = 0;
  let b = 0;
  for (let n = 0; ; n++) {
    // Le premier serveur sert 1 point, puis alternance tous les 2 points
    const aServe = (Math.floor((n + 1) / 2) % 2 === 0) === aServeEnPremier;
    const gagneA = aServe ? rng.random() < pA : rng.random() >= pB;
    if (gagneA) a++;
    else b++;
    if (a >= cible && a - b >= 2) return { gagneA: true, a, b };
    if (b >= cible && b - a >= 2) return { gagneA: false, a, b };
  }
}

function set(pA, pB, aServe, cibleTieBreak, rng) {
  let a = 0;
  let b = 0;
  for (;;) {
    if (a === 6 && b === 6) {
      const tb = tieBreak(pA, pB, aServe, cibleTieBreak, rng);
      return tb.gagneA
        ? { a: 7, b: 6, tb: tb.b, gagneA: true, aServe: !aServe }
        : { a: 6, b: 7, tb: tb.a, gagneA: false, aServe: !aServe };
    }
    const gagneA = aServe ? jeu(pA, rng) : !jeu(pB, rng);
    if (gagneA) a++;
    else b++;
    aServe = !aServe;
    if ((a >= 6 || b >= 6) && Math.abs(a - b) >= 2) return { a, b, tb: null, gagneA: a > b, aServe };
  }
}

/**
 * Simule un match entre deux joueurs sur une surface.
 * Renvoie { vainqueur, perdant, sets } où sets = [[jeuxVainqueur, jeuxPerdant, pointsTieBreakPerdant|null], ...]
 */
export function simuleMatch(joueurA, joueurB, surface, meilleurDe, rng) {
  const { probaServiceBase, coefNote, ecartForme } = PARAMS_MATCH;
  const formeA = joueurA.notes[surface] + rng.gauss() * ecartForme;
  const formeB = joueurB.notes[surface] + rng.gauss() * ecartForme;
  const delta = (formeA - formeB) * coefNote;
  const pA = borne(probaServiceBase + delta);
  const pB = borne(probaServiceBase - delta);

  const setsGagnants = Math.ceil(meilleurDe / 2);
  let setsA = 0;
  let setsB = 0;
  let aServe = rng.random() < 0.5;
  const sets = [];

  while (setsA < setsGagnants && setsB < setsGagnants) {
    const setDecisif = setsA === setsGagnants - 1 && setsB === setsGagnants - 1;
    // Grand Chelem : super tie-break à 10 points à 6-6 dans le 5e set (règle depuis 2022)
    const cible = setDecisif && meilleurDe === 5 ? 10 : 7;
    const s = set(pA, pB, aServe, cible, rng);
    aServe = s.aServe;
    sets.push([s.a, s.b, s.tb]);
    if (s.gagneA) setsA++;
    else setsB++;
  }

  const gagneA = setsA > setsB;
  return {
    vainqueur: gagneA ? joueurA : joueurB,
    perdant: gagneA ? joueurB : joueurA,
    sets: gagneA ? sets : sets.map(([x, y, tb]) => [y, x, tb]),
  };
}

export function formatScore(sets) {
  return sets.map(([x, y, tb]) => (tb === null ? `${x}-${y}` : `${x}-${y}(${tb})`)).join(" ");
}
