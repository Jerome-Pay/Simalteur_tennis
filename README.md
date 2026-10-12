# 🎾 Simulateur de saison ATP

Simulateur web d'une saison de tennis ATP (Grands Chelems, Masters 1000, ATP 500, ATP 250 et ATP Finals) qui réunit dans une même saison fictive **les 128 meilleurs joueurs de l'ère ATP Tour (1990 → 2026)**.

Chaque joueur a une note par surface (terre battue, herbe, dur indoor, dur outdoor), calculée à partir de ses vraies statistiques : pourcentage de victoires et palmarès.

---

## 🚀 Lancer le simulateur

Prérequis : **Python 3.10 ou plus récent**. Aucune autre installation : pas de `pip install`, pas de Node.js.

```bash
python lancer.py
```

Le navigateur s'ouvre sur `http://127.0.0.1:8000/web/`. Pour arrêter : `Ctrl+C` dans le terminal.

> Ouvrir `web/index.html` en double-cliquant ne fonctionne pas : les navigateurs interdisent à une page locale de lire un fichier CSV. Il faut passer par le petit serveur de `lancer.py`.

### Utilisation

| Bouton / onglet | Rôle |
|---|---|
| **Tournoi suivant** | Simule la semaine suivante (1 ou 2 tournois) |
| **Simuler la saison** | Simule tous les tournois restants d'un coup |
| **Nouvelle saison** | Repart de zéro. Si vous changez la **graine**, vous obtenez une autre saison ; garder la même graine redonne exactement la même saison |
| Calendrier | Les 40 tournois, leurs vainqueurs ; cliquez sur un tournoi pour voir son tableau |
| Classement | Race (points de la saison) et classement ATP |
| Palmarès | Vainqueurs des GC / Masters 1000 / Finals et titres par joueur |
| Joueurs | Les 128 joueurs et leurs notes, triables et filtrables |

---

## 📁 Structure du projet

```
.
├── README.md
├── lancer.py                    # Serveur web local + ouverture du navigateur
├── data/
│   ├── joueurs.csv              # 128 joueurs : nationalité + notes par surface (lu par le simulateur)
│   ├── stats_brutes.csv         # Toutes les statistiques ayant servi au calcul des notes
│   └── cache/                   # Fichiers téléchargés (ignoré par git, recréé par le script)
├── scripts/
│   └── collecte_donnees.py      # Télécharge les données et calcule les notes
└── web/
    ├── index.html               # Page de l'application
    ├── style.css                # Styles (thème clair / sombre automatique)
    └── js/
        ├── app.js               # Interface : onglets, tableaux, classements
        ├── saison.js            # Déroulement de la saison, inscriptions, classements
        ├── tournoi.js           # Tableaux, têtes de série, byes, ATP Finals, barème de points
        ├── match.js             # Simulation d'un match point par point
        ├── calendrier.js        # Calendrier allégé (40 tournois)
        ├── donnees.js           # Lecture de data/joueurs.csv
        └── rng.js               # Générateur aléatoire à graine (saisons reproductibles)
```

Les CSV utilisent le séparateur `;` et l'encodage UTF-8 avec BOM : ils s'ouvrent directement dans Excel.

---

## 📊 Les données

### Sources

| Source | Ce qu'on y prend | Volume |
|---|---|---|
| [Ultimate Tennis Statistics](https://www.ultimatetennisstatistics.com/) (UTS) | Classement GOAT (sélection des joueurs, nationalité, date de naissance) et catalogue des tournois 1968-2024 (catégorie et indoor/outdoor de chaque édition) | 2 requêtes |
| [Archive Jeff Sackmann](https://huggingface.co/datasets/Aneeshers/tennis-sackmann-archive) (miroir Hugging Face) | Tous les matchs ATP de 1980 à **mai 2026** (Roland-Garros 2026 inclus) | 48 fichiers CSV, ~31 Mo |

Pourquoi deux sources ? Les statistiques d'UTS s'arrêtent fin 2024 (les saisons 2025-2026 de Sinner et Alcaraz manquaient) et le site limite le nombre de requêtes. L'archive Sackmann est à jour et se télécharge en une fois ; UTS reste la référence pour classer chaque tournoi (250/500/Masters, indoor/outdoor).

### Processus de collecte (`scripts/collecte_donnees.py`)

1. **Sélection** : classement GOAT d'UTS → on garde les joueurs **nés en 1966 ou après** (carrière principalement après 1990, création de l'ATP Tour) → les **128 premiers**.
2. **Correspondance des joueurs** entre UTS et Sackmann par date de naissance + nom de famille (le script s'arrête en erreur si un joueur est ambigu).
3. **Classement de chaque match** : la surface vient de Sackmann, la catégorie du tournoi et l'indoor/outdoor viennent du catalogue UTS. Pour 2025-2026, la dernière classification connue du tournoi est reprise, avec quelques corrections manuelles (Doha et Munich passés ATP 500 en 2025, Dallas en 2026, nouveaux tournois indoor). Elles sont listées dans `CORRECTIONS_TOURNOIS`.
4. **Exclusions** : Coupe Davis et compétitions par équipes (United Cup, ATP Cup, Laver Cup…), Next Gen Finals, forfaits (W/O).
5. **Calcul des notes** (voir ci-dessous) et export des deux CSV.

Tous les téléchargements sont mis en cache dans `data/cache/` : relancer le script ne refait aucune requête. Pour rafraîchir les données, supprimez ce dossier.

**Vérification** : sur les 64 premiers joueurs, les victoires et défaites recalculées jusqu'à fin 2024 sont à moins de 4 % des chiffres officiels d'UTS. L'écart vient de la Coupe Davis, qu'UTS compte et que nous excluons.

### Les 4 surfaces

| Surface du simulateur | Matchs pris en compte |
|---|---|
| Terre battue | Terre (indoor et outdoor) |
| Herbe | Gazon |
| Dur indoor | Dur indoor **+ moquette** (la surface indoor des années 90) |
| Dur outdoor | Dur outdoor |

### Fichiers produits

`data/joueurs.csv` : `rang` (ordre GOAT), `nom`, `pays` (code à 3 lettres), `note_terre`, `note_herbe`, `note_dur_indoor`, `note_dur_outdoor`.

`data/stats_brutes.csv` contient en plus, pour chaque surface : la note carrière et la note au pic, les victoires et défaites, le % de victoires, les titres, les Grands Chelems, les Masters 1000 et les points de palmarès (carrière et meilleure période), ainsi que la date du dernier match.

---

## 🧮 Calcul des notes

Pour une période donnée (la carrière ou la meilleure période, voir plus bas), la note sur une surface vaut :

```
note = 60 + 35 × (0.55 × score_victoires + 0.45 × score_palmarès)
```

La note va de **60** (joueur faible sur la surface) à **95** (meilleur joueur de l'histoire sur la surface).

### Score de victoires (55 %)

- **% de victoires lissé** : pour qu'un joueur ayant gagné 4 de ses 5 matchs n'affiche pas 80 %, on ajoute 30 matchs fictifs à 55 % de victoires :
  `% lissé = (victoires + 0.55 × 30) / (matchs + 30)`
- Normalisation : 50 % donne 0, 90 % donne 1 (borné entre 0 et 1).

### Score de palmarès (45 %)

Chaque titre rapporte les points ATP du vainqueur :

| Tournoi | Points |
|---|---|
| Grand Chelem | 2000 |
| Masters de fin d'année | 1300 |
| Masters 1000 | 1000 |
| Jeux Olympiques | 750 |
| ATP 500 | 500 |
| ATP 250 | 250 |

`score_palmarès = √(points du joueur / points du meilleur joueur sur cette surface)`

La racine carrée évite que les records hors norme (Nadal sur terre, Federer sur herbe, Djokovic sur dur) écrasent tous les autres joueurs.

### Carrière + pic (50/50)

Une note calculée sur la seule carrière pénalise les joueurs encore jeunes, comme Sinner et Alcaraz, face aux carrières de 20 ans. La note finale combine donc deux notes :

- **note carrière** : tous les matchs de la carrière ;
- **note au pic** : les **5 meilleures saisons consécutives** sur la surface (celles au plus gros palmarès).

`note finale = 0.5 × note carrière + 0.5 × note au pic`

Tous ces paramètres (nombre de joueurs, poids, durée du pic, bornes) sont des constantes en haut du script.

---

## 🛠️ Le simulateur

### Simulation d'un match

- Chaque point se joue : **point → jeu → set (tie-break à 6-6) → match**. Les Grands Chelems se jouent en 3 sets gagnants, avec un super tie-break à 10 points dans le 5e set ; les autres tournois en 2 sets gagnants.
- Probabilité de gagner un point sur son service : `0.63 + 0.003 × (note_A − note_B)`, bornée entre 0,35 et 0,90.
- **Forme du jour** : à chaque match, la note de chaque joueur varie au hasard (écart-type de 3 points). C'est la seule part de hasard du modèle : pas de fatigue ni de blessures.
- Calibrage (en 2 sets gagnants) : avec 5 points d'écart, le mieux noté gagne 66 % du temps ; avec 10 points, 77 % ; avec 20 points, 92 %. Sur une saison simulée, le joueur le mieux noté gagne environ 72 % des matchs, proche du circuit réel.

### Tournois et calendrier

Le calendrier est une version allégée de la saison ATP (30 semaines, 40 tournois) :

| Catégorie | Tournois | Tableau |
|---|---|---|
| Grand Chelem (4) | Open d'Australie, Roland-Garros, Wimbledon, US Open | 128 joueurs |
| Masters 1000 (9) | Indian Wells, Miami, Madrid, Rome, Canada, Cincinnati, Shanghai | 96 joueurs (32 têtes de série exemptées du 1er tour) |
| | Monte-Carlo, Paris | 56 joueurs |
| ATP 500 (14) | Rotterdam, Rio, Dubaï, Acapulco, Barcelone, Munich, Hambourg, Halle, Queen's, Washington, Tokyo, Pékin, Bâle, Vienne | 32 joueurs |
| ATP 250 (13) | Brisbane, Adélaïde, Buenos Aires, Marseille, Genève, Stuttgart, 's-Hertogenbosch, Eastbourne, Majorque, Winston-Salem, Stockholm, Anvers, Metz | 28 joueurs (4 exemptés) |
| ATP Finals | Les 8 premiers de la Race : 2 poules de 4, puis demi-finales et finale | 8 joueurs |

- **Têtes de série** : un quart du tableau (32 en Grand Chelem). Les n°1 et 2 sont placés aux extrémités du tableau, puis les 3-4, 5-8, 9-16 et 17-32 sont tirés au sort dans leurs zones, comme sur le circuit.
- **Inscriptions** : tout le monde joue les Grands Chelems ; les Masters 1000 prennent les mieux classés. Pour les ATP 500 et 250, chaque joueur s'inscrit avec une probabilité qui dépend de son classement (les meilleurs jouent rarement les 250), et les tableaux incomplets sont complétés au hasard.
- **Points** : barème ATP officiel selon le tour atteint (2000 pour un Grand Chelem gagné, 1000 pour un Masters 1000, etc.). Un joueur battu sans avoir gagné de match reçoit les points du 1er tour.
- **Classements** :
  - la *Race* compte uniquement les points de la saison et qualifie les 8 premiers pour les Finals ;
  - le *classement ATP* ajoute aux points de la saison des points de départ calculés d'après la note moyenne, qui s'effacent au fil des semaines. Il sert aux inscriptions et aux têtes de série, ce qui évite un tirage incohérent en début de saison.

---

## 🧰 Outils utilisés

| Outil | Usage | Installation |
|---|---|---|
| Python 3 (bibliothèque standard uniquement : `urllib`, `csv`, `json`, `http.server`) | Collecte des données, serveur local | Déjà requis |
| HTML / CSS / JavaScript (modules ES, aucun framework) | Application web | Aucune |
| Google Chrome en mode *headless* | Tests pendant le développement (captures d'écran, saison simulée et vérifiée automatiquement) | Facultatif |

Il n'y a **aucune dépendance externe** : rien à installer avec `pip` ou `npm`, et aucune bibliothèque chargée depuis Internet.

---

## 🔒 Sécurité

- **Serveur local uniquement** : `lancer.py` écoute sur `127.0.0.1`, la page n'est donc pas accessible depuis le réseau.
- **Aucune dépendance tierce** : aucun paquet `pip` ou `npm`, aucun CDN. Cela supprime le risque de paquet malveillant ou compromis (attaque de la chaîne d'approvisionnement).
- **Pas d'injection HTML** : les données (noms, pays) sont insérées dans la page via `textContent`, jamais via `innerHTML`.
- **Content-Security-Policy** stricte dans `index.html` : seuls les scripts et styles du projet peuvent s'exécuter, et la page ne peut contacter aucun autre site.
- **Collecte respectueuse** : une pause d'une seconde entre les requêtes, une reprise automatique avec attente si le site répond « trop de requêtes » (HTTP 429), et un cache pour ne jamais retélécharger. Les sites protégés contre les robots (Cloudflare, par exemple tennisstats.com) ne sont pas contournés.
- Les fichiers téléchargés sont traités comme des **données** (lecture CSV/JSON), jamais exécutés.

---

## 📤 Publier sur GitHub

```bash
git init
git add .
git commit -m "Simulateur de saison ATP"
git branch -M main
git remote add origin https://github.com/<utilisateur>/<depot>.git
git push -u origin main
```

`data/cache/` est exclu par `.gitignore` : les 31 Mo de fichiers bruts ne sont pas publiés, mais `joueurs.csv` et `stats_brutes.csv` le sont.

Le simulateur fonctionne aussi avec **GitHub Pages** (Settings → Pages → branche `main`, dossier `/ (root)`). Il sera alors accessible à l'adresse `https://<utilisateur>.github.io/<depot>/web/`.

---

## ⚠️ Limites connues

- Les matchs vont jusqu'à **Roland-Garros 2026** (dernière mise à jour de l'archive) : la fin de saison 2026 (Wimbledon, US Open…) n'est pas encore prise en compte.
- La sélection des 128 joueurs vient du classement GOAT d'UTS, figé fin 2024. Les joueurs révélés en 2025-2026 peuvent manquer.
- Le palmarès ne compte que les titres en simple sur le circuit principal ; les 500 et 250 d'avant 2009 sont classés selon UTS (Championship Series = 500, World Series = 250).

---

## ⚖️ Crédits et licences

- Données de matchs : **Jeff Sackmann / Tennis Abstract**, licence [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Elles sont utilisables à condition de citer la source, sans usage commercial, et les fichiers dérivés (`data/*.csv`) sont soumis à la même licence.
- Catégories des tournois et classement GOAT : [Ultimate Tennis Statistics](https://www.ultimatetennisstatistics.com/) (Mileta Cekovic).
