// Calendrier allégé d'une saison ATP : 4 GC, 9 Masters 1000, 14 ATP 500, 13 ATP 250 et les ATP Finals.
// Les tournois d'un même créneau se jouent la même semaine : un joueur ne peut en disputer qu'un.

const t = (nom, categorie, surface, entrants, taille) => ({ nom, categorie, surface, entrants, taille });

const gc = (nom, surface) => t(nom, "GC", surface, 128, 128);
const m1000 = (nom, surface, entrants) => t(nom, "M1000", surface, entrants, entrants > 64 ? 128 : 64);
const a500 = (nom, surface) => t(nom, "500", surface, 32, 32);
const a250 = (nom, surface) => t(nom, "250", surface, 28, 32);
const finals = (nom, surface) => t(nom, "FINALS", surface, 8, 8);

export const CALENDRIER = [
  [a250("Brisbane", "dur_outdoor")],
  [a250("Adélaïde", "dur_outdoor")],
  [gc("Open d'Australie", "dur_outdoor")],
  [a500("Rotterdam", "dur_indoor"), a250("Buenos Aires", "terre")],
  [a500("Rio de Janeiro", "terre"), a250("Marseille", "dur_indoor")],
  [a500("Dubaï", "dur_outdoor"), a500("Acapulco", "dur_outdoor")],
  [m1000("Indian Wells", "dur_outdoor", 96)],
  [m1000("Miami", "dur_outdoor", 96)],
  [m1000("Monte-Carlo", "terre", 56)],
  [a500("Barcelone", "terre"), a500("Munich", "terre")],
  [m1000("Madrid", "terre", 96)],
  [m1000("Rome", "terre", 96)],
  [a500("Hambourg", "terre"), a250("Genève", "terre")],
  [gc("Roland-Garros", "terre")],
  [a250("Stuttgart", "herbe"), a250("'s-Hertogenbosch", "herbe")],
  [a500("Halle", "herbe"), a500("Queen's", "herbe")],
  [a250("Eastbourne", "herbe"), a250("Majorque", "herbe")],
  [gc("Wimbledon", "herbe")],
  [a500("Washington", "dur_outdoor")],
  [m1000("Canada", "dur_outdoor", 96)],
  [m1000("Cincinnati", "dur_outdoor", 96)],
  [a250("Winston-Salem", "dur_outdoor")],
  [gc("US Open", "dur_outdoor")],
  [a500("Tokyo", "dur_outdoor"), a500("Pékin", "dur_outdoor")],
  [m1000("Shanghai", "dur_outdoor", 96)],
  [a250("Stockholm", "dur_indoor"), a250("Anvers", "dur_indoor")],
  [a500("Bâle", "dur_indoor"), a500("Vienne", "dur_indoor")],
  [m1000("Paris", "dur_indoor", 56)],
  [a250("Metz", "dur_indoor")],
  [finals("ATP Finals", "dur_indoor")],
];

export const LIBELLES_CATEGORIE = {
  GC: "Grand Chelem",
  M1000: "Masters 1000",
  500: "ATP 500",
  250: "ATP 250",
  FINALS: "ATP Finals",
};

export const LIBELLES_SURFACE = {
  terre: "Terre battue",
  herbe: "Herbe",
  dur_indoor: "Dur indoor",
  dur_outdoor: "Dur outdoor",
};
