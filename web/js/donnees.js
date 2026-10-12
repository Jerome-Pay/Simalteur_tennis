// Chargement du fichier data/joueurs.csv (séparateur « ; », UTF-8 avec BOM).

export const SURFACES = ["terre", "herbe", "dur_indoor", "dur_outdoor"];

export async function chargeJoueurs(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Impossible de charger ${url} (HTTP ${reponse.status})`);
  const texte = (await reponse.text()).replace(/^﻿/, "");
  const [entete, ...lignes] = texte.trim().split(/\r?\n/);
  const colonnes = entete.split(";");

  return lignes.map((ligne) => {
    const valeurs = Object.fromEntries(ligne.split(";").map((v, i) => [colonnes[i], v]));
    const notes = Object.fromEntries(SURFACES.map((s) => [s, Number(valeurs[`note_${s}`])]));
    const moyenne = SURFACES.reduce((somme, s) => somme + notes[s], 0) / SURFACES.length;
    return {
      id: Number(valeurs.rang),
      rangGoat: Number(valeurs.rang),
      nom: valeurs.nom,
      pays: valeurs.pays,
      notes,
      moyenne,
    };
  });
}
