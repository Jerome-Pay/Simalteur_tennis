// Interface : contrôles, onglets et rendu des vues.
// Sécurité : tout le contenu est inséré via textContent (aucun innerHTML), donc pas d'injection HTML possible.

import { chargeJoueurs, SURFACES } from "./donnees.js";
import { Saison } from "./saison.js";
import { LIBELLES_CATEGORIE, LIBELLES_SURFACE } from "./calendrier.js";

const etat = {
  joueurs: [],
  saison: null,
  onglet: "calendrier",
  tournoiOuvert: null,
  tourDepart: null,
  triJoueurs: { cle: "rangGoat", sens: 1 },
  recherche: "",
};

// ---------- Utilitaires DOM ----------

function el(tag, props = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(props)) {
    if (valeur === undefined || valeur === null || valeur === false) continue;
    if (cle === "class") e.className = valeur;
    else if (cle.startsWith("on")) e.addEventListener(cle.slice(2), valeur);
    else e.setAttribute(cle, valeur);
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    e.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return e;
}

const badgeSurface = (s) => el("span", { class: `badge surface-${s}` }, LIBELLES_SURFACE[s]);
const badgeCategorie = (c) => el("span", { class: `badge cat-${c}` }, LIBELLES_CATEGORIE[c]);
const nomJoueur = (j) => (j ? [j.nom, el("span", { class: "pays" }, j.pays)] : el("span", { class: "doux" }, "—"));

function celluleNote(valeur) {
  const td = el("td", { class: "note" }, valeur);
  const intensite = Math.max(0, Math.min(1, (valeur - 60) / 35));
  td.style.setProperty("background-color", `rgb(var(--note) / ${(intensite * 0.55).toFixed(2)})`);
  return td;
}

// ---------- Contrôles ----------

const graineAleatoire = () => Math.floor(Math.random() * 1e9);

function nouvelleSaison(graine) {
  etat.saison = new Saison(etat.joueurs, graine);
  etat.tournoiOuvert = null;
  document.getElementById("graine").value = graine;
  rendu();
}

function majStatut() {
  const s = etat.saison;
  const statut = document.getElementById("statut");
  const boutons = ["suivant", "tout"].map((id) => document.getElementById(id));
  boutons.forEach((b) => (b.disabled = s.terminee));
  if (s.terminee) {
    const n1 = s.classementRace()[0];
    statut.textContent = `Saison terminée — vainqueur de la Race : ${n1.nom} (${s.points.get(n1.id)} pts)`;
  } else {
    const noms = s.prochainCreneau.tournois.map((t) => t.nom).join(" + ");
    statut.textContent = `Semaine ${s.index + 1} / ${s.creneaux.length} — prochain : ${noms}`;
  }
}

// ---------- Vues ----------

function vueCalendrier() {
  const lignes = [];
  for (const c of etat.saison.creneaux) {
    for (const t of c.tournois) {
      const r = t.resultat;
      lignes.push(el("tr", {
        class: r ? "cliquable" : null,
        onclick: r ? () => ouvreTournoi(t) : null,
      },
        el("td", { class: "num doux" }, c.semaine),
        el("td", { class: "gras" }, t.nom),
        el("td", {}, badgeCategorie(t.categorie)),
        el("td", {}, badgeSurface(t.surface)),
        el("td", { class: "num doux" }, t.entrants),
        el("td", { class: r ? "champion" : "" }, r ? nomJoueur(r.champion) : el("span", { class: "doux" }, "à jouer")),
        el("td", {}, r ? nomJoueur(r.finaliste) : ""),
        el("td", { class: "doux" }, r ? r.scoreFinale : ""),
      ));
    }
  }
  return el("div", { class: "carte defile" },
    el("table", {},
      el("thead", {}, el("tr", {},
        el("th", { class: "num" }, "Sem."), el("th", {}, "Tournoi"), el("th", {}, "Catégorie"), el("th", {}, "Surface"),
        el("th", { class: "num" }, "Joueurs"), el("th", {}, "Vainqueur"), el("th", {}, "Finaliste"), el("th", {}, "Score finale"))),
      el("tbody", {}, lignes)));
}

function carteMatch(m, tetes) {
  const ligne = (j) => {
    if (!j) return el("div", { class: "ligne perdu" }, "bye");
    const tete = tetes.get(j.id);
    return el("div", { class: `ligne ${j === m.vainqueur ? "gagnant" : "perdu"}` },
      el("span", {}, tete ? el("span", { class: "tete" }, `[${tete}]`) : null, j.nom),
      el("span", { class: "pays" }, j.pays));
  };
  return el("div", { class: "match" }, ligne(m.a), ligne(m.b), m.score ? el("div", { class: "score" }, m.score) : null);
}

const colonne = (titre, ...cartes) =>
  el("div", { class: "colonne" }, el("h4", {}, titre), el("div", { class: "cartes" }, cartes));
const colonneVainqueur = (champion) =>
  colonne("Vainqueur", el("div", { class: "match" }, el("div", { class: "ligne champion" }, champion.nom)));

function vueTableau(r) {
  const tours = r.tours;
  // Par défaut, les grands tableaux s'affichent à partir des 8es de finale
  const defaut = Math.max(0, tours.length - 4);
  const depart = etat.tourDepart ?? defaut;
  const choix = el("div", { class: "choix-tours" },
    el("span", { class: "doux" }, "Afficher depuis :"),
    tours.map((t, i) => el("button", {
      type: "button",
      class: i === depart ? "actif" : null,
      onclick: () => { etat.tourDepart = i; rendu(); },
    }, t.nom)));
  const colonnes = tours.slice(depart).map((t) => colonne(t.nom, t.matchs.map((m) => carteMatch(m, r.tetes))));
  colonnes.push(colonneVainqueur(r.champion));
  return [choix, el("div", { class: "tableau" }, colonnes)];
}

function vueFinals(r) {
  const groupes = r.groupes.map((g) => el("div", { class: "carte" },
    el("h3", {}, g.nom),
    el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Joueur"), el("th", { class: "num" }, "V-D"), el("th", { class: "num" }, "Sets"), el("th", { class: "num" }, "Jeux"))),
      el("tbody", {}, g.classement.map((l, i) => el("tr", { class: i === 1 ? "separateur" : null },
        el("td", { class: i < 2 ? "gras" : "" }, nomJoueur(l.joueur)),
        el("td", { class: "num" }, `${l.v}-${l.d}`),
        el("td", { class: "num" }, `${l.setsG}-${l.setsP}`),
        el("td", { class: "num" }, `${l.jeuxG}-${l.jeuxP}`))))),
    el("h3", {}, "Matchs"),
    el("div", { class: "liste-matchs" }, g.matchs.map((m) => carteMatch(m, r.tetes)))));
  const phaseFinale = el("div", { class: "tableau" },
    r.tours.map((t) => colonne(t.nom, t.matchs.map((m) => carteMatch(m, r.tetes)))),
    colonneVainqueur(r.champion));
  return [el("div", { class: "grille" }, groupes), el("h3", {}, "Phase finale"), phaseFinale];
}

function vueTournoi(t) {
  const r = t.resultat;
  return el("div", { class: "carte" },
    el("div", { class: "entete-detail" },
      el("button", { type: "button", class: "bouton secondaire", onclick: () => { etat.tournoiOuvert = null; rendu(); } }, "← Retour"),
      el("h2", {}, t.nom), badgeCategorie(t.categorie), badgeSurface(t.surface),
      el("span", {}, "Vainqueur : ", el("span", { class: "champion" }, r.champion.nom))),
    r.type === "finals" ? vueFinals(r) : vueTableau(r));
}

function vueClassement() {
  const s = etat.saison;
  const race = s.classementRace();
  const rangAtp = new Map(s.classement().map((j, i) => [j.id, i + 1]));
  const lignes = race.map((j, i) => {
    const b = s.bilans.get(j.id);
    return el("tr", { class: i === 7 ? "separateur" : null },
      el("td", { class: "num" }, i + 1),
      el("td", { class: "gras" }, nomJoueur(j)),
      el("td", { class: "num gras" }, s.points.get(j.id)),
      el("td", { class: "num doux" }, `${rangAtp.get(j.id)} (${s.pointsClassement(j.id)})`),
      el("td", { class: "num" }, b.titres.length),
      el("td", { class: "num doux" }, `${b.v}-${b.d}`),
      el("td", { class: "doux" }, b.titres.map((t) => t.nom).join(", ")));
  });
  return el("div", { class: "carte defile" },
    el("p", { class: "doux" },
      "Race : points gagnés cette saison. Les 8 premiers (au-dessus de la ligne) se qualifient pour les ATP Finals. ",
      "Classement ATP : points de la saison + points de départ (selon la note moyenne) qui s'effacent au fil des semaines ; il sert aux inscriptions et aux têtes de série."),
    el("table", {},
      el("thead", {}, el("tr", {}, el("th", { class: "num" }, "#"), el("th", {}, "Joueur"), el("th", { class: "num" }, "Points Race"),
        el("th", { class: "num" }, "Classement ATP (pts)"), el("th", { class: "num" }, "Titres"), el("th", { class: "num" }, "V-D"),
        el("th", {}, "Tournois gagnés"))),
      el("tbody", {}, lignes)));
}

function vuePalmares() {
  const s = etat.saison;
  const joues = s.creneaux.flatMap((c) => c.tournois).filter((t) => t.resultat);
  if (joues.length === 0) return el("div", { class: "carte doux" }, "Aucun tournoi joué pour l'instant.");

  const parCategorie = (cat) => joues.filter((t) => t.categorie === cat);
  const listeVainqueurs = (titre, tournois) => tournois.length === 0 ? null : el("div", { class: "carte" },
    el("h3", {}, titre),
    el("table", {}, el("tbody", {}, tournois.map((t) => el("tr", { class: "cliquable", onclick: () => ouvreTournoi(t) },
      el("td", {}, t.nom), el("td", { class: "champion" }, nomJoueur(t.resultat.champion)), el("td", { class: "doux" }, t.resultat.scoreFinale))))));

  const categories = ["GC", "FINALS", "M1000", "500", "250"];
  const compteurs = s.joueurs
    .map((j) => {
      const titres = s.bilans.get(j.id).titres;
      return { j, total: titres.length, ...Object.fromEntries(categories.map((c) => [c, titres.filter((t) => t.categorie === c).length])) };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.GC - a.GC || b.FINALS - a.FINALS || b.M1000 - a.M1000 || b.total - a.total);

  return [
    el("div", { class: "grille" },
      listeVainqueurs("Grands Chelems", parCategorie("GC")),
      listeVainqueurs("Masters 1000", parCategorie("M1000")),
      listeVainqueurs("ATP Finals", parCategorie("FINALS"))),
    el("div", { class: "carte defile" },
      el("h3", {}, "Titres par joueur"),
      el("table", {},
        el("thead", {}, el("tr", {}, el("th", {}, "Joueur"), el("th", { class: "num" }, "Total"),
          categories.map((c) => el("th", { class: "num" }, LIBELLES_CATEGORIE[c])))),
        el("tbody", {}, compteurs.map((x) => el("tr", {},
          el("td", { class: "gras" }, nomJoueur(x.j)), el("td", { class: "num gras" }, x.total),
          categories.map((c) => el("td", { class: "num" }, x[c] || ""))))))),
  ];
}

function vueJoueurs() {
  const { cle, sens } = etat.triJoueurs;
  const valeur = (j) => (SURFACES.includes(cle) ? j.notes[cle] : j[cle]);
  const filtre = etat.recherche.toLowerCase();
  const joueurs = etat.joueurs
    .filter((j) => j.nom.toLowerCase().includes(filtre) || j.pays.toLowerCase().includes(filtre))
    .sort((a, b) => {
      const x = valeur(a);
      const y = valeur(b);
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * sens;
    });

  const entete = (libelle, c, num = true) => el("th", {
    class: `triable ${num ? "num" : ""}`,
    onclick: () => {
      etat.triJoueurs = { cle: c, sens: etat.triJoueurs.cle === c ? -etat.triJoueurs.sens : (num && c !== "rangGoat" ? -1 : 1) };
      rendu();
    },
  }, libelle + (cle === c ? (sens > 0 ? " ▲" : " ▼") : ""));

  const recherche = el("input", { class: "recherche", type: "search", placeholder: "Rechercher un joueur ou un pays…", value: etat.recherche });
  recherche.addEventListener("input", (e) => {
    etat.recherche = e.target.value;
    const tbody = document.getElementById("corps-joueurs");
    tbody.replaceWith(vueJoueurs().querySelector("#corps-joueurs"));
  });

  return el("div", { class: "carte defile" },
    recherche,
    el("table", {},
      el("thead", {}, el("tr", {},
        entete("Rang GOAT", "rangGoat"), entete("Joueur", "nom", false), entete("Pays", "pays", false),
        SURFACES.map((s) => entete(LIBELLES_SURFACE[s], s)), entete("Moyenne", "moyenne"))),
      el("tbody", { id: "corps-joueurs" }, joueurs.map((j) => el("tr", {},
        el("td", { class: "num doux" }, j.rangGoat),
        el("td", { class: "gras" }, j.nom),
        el("td", { class: "doux" }, j.pays),
        SURFACES.map((s) => celluleNote(j.notes[s])),
        el("td", { class: "num" }, j.moyenne.toFixed(1)))))));
}

// ---------- Rendu ----------

function ouvreTournoi(t) {
  etat.tournoiOuvert = t;
  etat.tourDepart = null;
  etat.onglet = "calendrier";
  rendu();
  window.scrollTo({ top: 0 });
}

function rendu() {
  majStatut();
  document.querySelectorAll("#onglets button").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === etat.onglet));
  const vues = { calendrier: vueCalendrier, classement: vueClassement, palmares: vuePalmares, joueurs: vueJoueurs };
  const contenu = etat.onglet === "calendrier" && etat.tournoiOuvert ? vueTournoi(etat.tournoiOuvert) : vues[etat.onglet]();
  document.getElementById("contenu").replaceChildren(...[contenu].flat().filter(Boolean));
}

async function demarre() {
  try {
    etat.joueurs = await chargeJoueurs("../data/joueurs.csv");
  } catch (e) {
    document.getElementById("statut").textContent =
      `Erreur : ${e.message}. Lancez le site via « python lancer.py » (ouvrir index.html directement ne fonctionne pas).`;
    return;
  }

  document.getElementById("nouvelle").addEventListener("click", () => {
    const saisie = Number.parseInt(document.getElementById("graine").value, 10);
    const graine = Number.isFinite(saisie) && saisie !== etat.saison.graine ? saisie : graineAleatoire();
    nouvelleSaison(graine);
  });
  document.getElementById("suivant").addEventListener("click", () => {
    const creneau = etat.saison.simuleCreneauSuivant();
    etat.tournoiOuvert = creneau.tournois.length === 1 ? creneau.tournois[0] : null;
    etat.tourDepart = null;
    etat.onglet = "calendrier";
    rendu();
  });
  document.getElementById("tout").addEventListener("click", () => {
    etat.saison.simuleTout();
    etat.tournoiOuvert = null;
    etat.onglet = "palmares";
    rendu();
  });
  document.querySelectorAll("#onglets button").forEach((b) => b.addEventListener("click", () => {
    etat.onglet = b.dataset.onglet;
    etat.tournoiOuvert = null;
    rendu();
  }));

  nouvelleSaison(graineAleatoire());
}

demarre();
