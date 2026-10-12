"""Construit data/joueurs.csv : 128 meilleurs joueurs de l'ère ATP Tour (1990+) et leurs notes par surface.

Usage :
    python scripts/collecte_donnees.py

Sources :
  1. Ultimate Tennis Statistics (UTS) — 2 requêtes seulement :
       - classement GOAT (sélection des joueurs, nationalité, date de naissance) ;
       - catalogue des tournois 1968-2024 (catégorie 250/500/M1000/GC et indoor/outdoor de chaque édition).
  2. Archive Jeff Sackmann (miroir Hugging Face, licence CC BY-NC-SA 4.0) :
       - tous les matchs ATP de 1980 à 2026 (mise à jour la plus récente disponible).

Les fichiers téléchargés sont mis en cache dans data/cache/ : relancer le script ne refait
aucune requête (supprimer le dossier pour tout rafraîchir).

Produit :
    data/stats_brutes.csv  -> victoires/défaites et titres par surface
    data/joueurs.csv       -> nationalité + notes par surface (fichier utilisé par le simulateur)
"""

import csv
import io
import json
import math
import re
import time
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------- paramètres

NB_JOUEURS = 128
ANNEE_NAISSANCE_MIN = 1966  # carrière principalement après 1990 (création de l'ATP Tour)
ANNEES_MATCHS = range(1980, 2027)

URL_UTS = "https://www.ultimatetennisstatistics.com"
REQ_GOAT = "/goatListTable?current=1&rowCount=300&searchPhrase=&oldLegends=false&extrapolate=false"
REQ_TOURNOIS = ("/tournamentEventsTable?current=1&rowCount=-1&searchPhrase=&season=&level=&surface="
                "&indoor=&speed=&tournamentId=&fromDate=&toDate=")
URL_SACKMANN = "https://huggingface.co/datasets/Aneeshers/tennis-sackmann-archive/resolve/main/atp/{}"

PAUSE_ENTRE_REQUETES = 1.0  # secondes, pour ne pas surcharger les sites
TENTATIVES_MAX = 6          # en cas d'erreur 429 (trop de requêtes) ou 5xx

DOSSIER_DATA = Path(__file__).resolve().parent.parent / "data"
DOSSIER_CACHE = DOSSIER_DATA / "cache"

SURFACES = ["terre", "herbe", "dur_indoor", "dur_outdoor"]

# Points de palmarès par catégorie de tournoi (barème ATP du vainqueur)
POINTS_TITRE = {
    "G": 2000,  # Grand Chelem
    "F": 1300,  # Masters de fin d'année
    "M": 1000,  # Masters 1000
    "O": 750,   # Jeux Olympiques
    "A": 500,   # ATP 500 (ex-Championship Series)
    "B": 250,   # ATP 250 (ex-World Series)
}

# Tournois absents du catalogue UTS (qui s'arrête en 2024) ou ayant changé de catégorie depuis.
# Clé : identifiant ATP du tournoi (2e partie du tourney_id Sackmann) -> (à partir de la saison, catégorie, indoor).
CORRECTIONS_TOURNOIS = {
    "451": (2025, "A", False),   # Doha : ATP 500 depuis 2025
    "308": (2025, "A", False),   # Munich : ATP 500 depuis 2025
    "424": (2026, "A", True),    # Dallas : ATP 500 indoor depuis 2026
    "9410": (2025, "B", True),   # Almaty (indoor)
    "7485": (2025, "B", True),   # Bruxelles (indoor)
    "5100": (2025, "B", True),   # Athènes (indoor)
}
EXCLUS = re.compile(r"Davis Cup|United Cup|ATP Cup|Laver Cup|World Team Cup|Next Gen", re.I)

# Paramètres de la formule de note
NOTE_MIN, NOTE_MAX = 60, 95
POIDS_VICTOIRES = 0.55
POIDS_PALMARES = 0.45
PRIOR_MATCHS = 30       # lissage bayésien du % de victoires
PRIOR_POURCENTAGE = 0.55
POURC_BAS, POURC_HAUT = 0.50, 0.90  # bornes de normalisation du % de victoires
DUREE_PIC = 5           # nombre de saisons consécutives de la « meilleure période »
POIDS_CARRIERE = 0.5    # note finale = 50 % carrière complète + 50 % meilleure période


# ---------------------------------------------------------------- téléchargement

def telecharge(url: str, nom_cache: str) -> str:
    cache = DOSSIER_CACHE / nom_cache
    if cache.exists():
        return cache.read_text(encoding="utf-8")

    req = urllib.request.Request(url, headers={"User-Agent": "tennis-simulator-data/1.0"})
    for tentative in range(TENTATIVES_MAX):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                contenu = resp.read().decode("utf-8")
            break
        except urllib.error.HTTPError as e:
            if (e.code != 429 and e.code < 500) or tentative == TENTATIVES_MAX - 1:
                raise
            attente = 30 * 2 ** tentative
            print(f"   HTTP {e.code}, nouvelle tentative dans {attente} s")
            time.sleep(attente)
    time.sleep(PAUSE_ENTRE_REQUETES)

    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(contenu, encoding="utf-8")
    return contenu


def lit_csv(texte: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(texte)))


# ---------------------------------------------------------------- sélection des joueurs

def normalise(nom: str) -> list[str]:
    nom = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode().lower()
    return re.findall(r"[a-z]+", nom)


def selection_joueurs() -> list[dict]:
    goat = json.loads(telecharge(URL_UTS + REQ_GOAT, "uts_goat.json"))["rows"]
    joueurs = [r for r in goat if int(r["dob"][:4]) >= ANNEE_NAISSANCE_MIN][:NB_JOUEURS]

    # Correspondance UTS -> Sackmann : même date de naissance + nom de famille commun
    par_naissance = defaultdict(list)
    for p in lit_csv(telecharge(URL_SACKMANN.format("atp_players.csv"), "sackmann/atp_players.csv")):
        par_naissance[p["dob"]].append(p)
    for j in joueurs:
        mots_uts = set(normalise(j["name"]))
        candidats = [p for p in par_naissance[j["dob"].replace("-", "")]
                     if set(normalise(p["name_last"])) & mots_uts]
        if len(candidats) != 1:
            raise RuntimeError(f"Correspondance introuvable pour {j['name']} ({len(candidats)} candidats)")
        j["sackmann_id"] = candidats[0]["player_id"]
        j["nom"] = f"{candidats[0]['name_first']} {candidats[0]['name_last']}"
    return joueurs


# ---------------------------------------------------------------- classification des tournois

def catalogue_tournois() -> tuple[dict, dict]:
    """(saison, id ATP) -> (catégorie, indoor) d'après UTS, et id ATP -> dernière classification connue."""
    par_edition, par_tournoi = {}, {}
    for e in sorted(json.loads(telecharge(URL_UTS + REQ_TOURNOIS, "uts_tournois.json"))["rows"],
                    key=lambda e: e["season"]):
        cle = e["tournamentExtId"].lstrip("0")
        par_edition[(e["season"], cle)] = (e["level"], e["indoor"])
        par_tournoi[cle] = (e["level"], e["indoor"])
    return par_edition, par_tournoi


def classe_match(m: dict, par_edition: dict, par_tournoi: dict) -> tuple[str, str] | None:
    """Renvoie (surface du simulateur, catégorie) ou None si le match est ignoré."""
    if m["tourney_level"] == "D" or EXCLUS.search(m["tourney_name"]) or "W/O" in m["score"] or not m["score"]:
        return None
    saison_txt, _, id_atp = m["tourney_id"].partition("-")
    id_atp = id_atp.lstrip("0")
    saison = int(saison_txt)
    correction = CORRECTIONS_TOURNOIS.get(id_atp)
    if correction and saison >= correction[0]:
        categorie, indoor = correction[1:]
    elif saison <= 2024 and (saison, id_atp) in par_edition:
        categorie, indoor = par_edition[(saison, id_atp)]
    elif id_atp in par_tournoi:
        categorie, indoor = par_tournoi[id_atp]
    else:  # tournoi inconnu : niveau Sackmann (G, M, F, O fiables ; A = 250 par défaut)
        categorie = m["tourney_level"] if m["tourney_level"] in "GMFO" else "B"
        indoor = m["surface"] == "Carpet"

    surface = {"Clay": "terre", "Grass": "herbe"}.get(m["surface"])
    if surface is None:
        surface = "dur_indoor" if indoor or m["surface"] == "Carpet" else "dur_outdoor"
    return surface, categorie


# ---------------------------------------------------------------- statistiques

def nouvelle_saison() -> dict:
    return {"v": 0, "d": 0, "titres": defaultdict(int)}


def collecte_stats(joueurs: list[dict], saison_max: int | None = None) -> None:
    """Remplit j["saisons"][surface][saison] = {v, d, titres par catégorie} pour chaque joueur."""
    par_edition, par_tournoi = catalogue_tournois()
    ids = {j["sackmann_id"]: j for j in joueurs}
    for j in joueurs:
        j["saisons"] = {s: defaultdict(nouvelle_saison) for s in SURFACES}
        j["dernier_match"] = ""

    for annee in ANNEES_MATCHS:
        if saison_max and annee > saison_max:
            break
        fichier = f"atp_matches_{annee}.csv"
        for m in lit_csv(telecharge(URL_SACKMANN.format(fichier), f"sackmann/{fichier}")):
            gagnant, perdant = ids.get(m["winner_id"]), ids.get(m["loser_id"])
            if not gagnant and not perdant:
                continue
            classe = classe_match(m, par_edition, par_tournoi)
            if classe is None:
                continue
            surface, categorie = classe
            saison = int(m["tourney_id"][:4])
            if gagnant:
                stats = gagnant["saisons"][surface][saison]
                stats["v"] += 1
                if m["round"] == "F":
                    stats["titres"][categorie] += 1
                gagnant["dernier_match"] = max(gagnant["dernier_match"], m["tourney_date"])
            if perdant:
                perdant["saisons"][surface][saison]["d"] += 1
                perdant["dernier_match"] = max(perdant["dernier_match"], m["tourney_date"])


def cumule(saisons: list[dict]) -> dict:
    total = {"v": 0, "d": 0, "titres": defaultdict(int)}
    for st in saisons:
        total["v"] += st["v"]
        total["d"] += st["d"]
        for c, n in st["titres"].items():
            total["titres"][c] += n
    total["points"] = sum(POINTS_TITRE.get(c, 0) * n for c, n in total["titres"].items())
    return total


def score_victoires(v: int, d: int) -> float:
    pourc_lisse = (v + PRIOR_POURCENTAGE * PRIOR_MATCHS) / (v + d + PRIOR_MATCHS)
    return min(max((pourc_lisse - POURC_BAS) / (POURC_HAUT - POURC_BAS), 0), 1)


def meilleure_periode(saisons: dict) -> dict:
    """Les DUREE_PIC saisons consécutives au plus gros palmarès (puis meilleur % de victoires)."""
    if not saisons:
        return cumule([])
    periodes = [cumule([saisons[a] for a in range(debut, debut + DUREE_PIC) if a in saisons])
                for debut in range(min(saisons), max(saisons) + 1)]
    return max(periodes, key=lambda p: (p["points"], score_victoires(p["v"], p["d"])))


def note(stats: dict, max_palmares: int) -> float:
    score = (POIDS_VICTOIRES * score_victoires(stats["v"], stats["d"])
             + POIDS_PALMARES * math.sqrt(stats["points"] / (max_palmares or 1)))
    return NOTE_MIN + (NOTE_MAX - NOTE_MIN) * score


def calcule_notes(joueurs: list[dict]) -> None:
    """Note finale = POIDS_CARRIERE x note carrière + (1 - POIDS_CARRIERE) x note au pic."""
    for j in joueurs:
        j["carriere"] = {s: cumule(j["saisons"][s].values()) for s in SURFACES}
        j["pic"] = {s: meilleure_periode(j["saisons"][s]) for s in SURFACES}

    for s in SURFACES:
        max_carriere = max(j["carriere"][s]["points"] for j in joueurs)
        max_pic = max(j["pic"][s]["points"] for j in joueurs)
        for j in joueurs:
            j[f"note_carriere_{s}"] = note(j["carriere"][s], max_carriere)
            j[f"note_pic_{s}"] = note(j["pic"][s], max_pic)
            j[f"note_{s}"] = round(POIDS_CARRIERE * j[f"note_carriere_{s}"]
                                   + (1 - POIDS_CARRIERE) * j[f"note_pic_{s}"])


# ---------------------------------------------------------------- export

def ecrit_csv(chemin: Path, lignes: list[dict], colonnes: list[str]) -> None:
    with open(chemin, "w", newline="", encoding="utf-8-sig") as f:  # BOM : accents corrects dans Excel
        writer = csv.DictWriter(f, fieldnames=colonnes, extrasaction="ignore", delimiter=";")
        writer.writeheader()
        writer.writerows(lignes)


def lignes_export(joueurs: list[dict]) -> list[dict]:
    lignes = []
    for rang, j in enumerate(joueurs, start=1):
        ligne = {
            "rang": rang, "nom": j["nom"], "pays": j["country"]["id"], "naissance": j["dob"],
            "dernier_match": j["dernier_match"], "uts_id": j["playerId"], "sackmann_id": j["sackmann_id"],
        }
        for s in SURFACES:
            st, pic = j["carriere"][s], j["pic"][s]
            ligne.update({
                f"note_{s}": j[f"note_{s}"],
                f"note_carriere_{s}": round(j[f"note_carriere_{s}"], 1),
                f"note_pic_{s}": round(j[f"note_pic_{s}"], 1),
                f"{s}_victoires": st["v"],
                f"{s}_defaites": st["d"],
                f"{s}_pourcentage": round(100 * st["v"] / (st["v"] + st["d"]), 1) if st["v"] + st["d"] else 0.0,
                f"{s}_titres": sum(n for c, n in st["titres"].items() if c in POINTS_TITRE),
                f"{s}_grands_chelems": st["titres"]["G"],
                f"{s}_masters1000": st["titres"]["M"],
                f"{s}_points_palmares": st["points"],
                f"{s}_pic_victoires": pic["v"],
                f"{s}_pic_defaites": pic["d"],
                f"{s}_pic_points_palmares": pic["points"],
            })
        lignes.append(ligne)
    return lignes


def main() -> None:
    joueurs = selection_joueurs()
    collecte_stats(joueurs)
    calcule_notes(joueurs)
    lignes = lignes_export(joueurs)

    base = ["rang", "nom", "pays", "naissance", "dernier_match", "uts_id", "sackmann_id"]
    notes = [f"note_{s}" for s in SURFACES]
    details = [f"note_{t}_{s}" for s in SURFACES for t in ("carriere", "pic")] + [
        f"{s}_{c}" for s in SURFACES for c in
        ("victoires", "defaites", "pourcentage", "titres", "grands_chelems", "masters1000", "points_palmares",
         "pic_victoires", "pic_defaites", "pic_points_palmares")]
    ecrit_csv(DOSSIER_DATA / "stats_brutes.csv", lignes, base + notes + details)
    ecrit_csv(DOSSIER_DATA / "joueurs.csv", lignes, ["rang", "nom", "pays"] + notes)
    print(f"{len(lignes)} joueurs -> {DOSSIER_DATA}")


if __name__ == "__main__":
    main()
