// Générateur pseudo-aléatoire à graine (mulberry32) : une même graine redonne la même saison.

export function creeRng(graine) {
  let etat = graine >>> 0;

  function random() {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Loi normale centrée réduite (Box-Muller)
  function gauss() {
    const u = 1 - random();
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function melange(tableau) {
    const copie = tableau.slice();
    for (let i = copie.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  }

  return { random, gauss, melange };
}
