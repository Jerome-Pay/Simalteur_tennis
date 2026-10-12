"""Lance le simulateur dans le navigateur.

Usage :
    python lancer.py

Démarre un petit serveur web local (bibliothèque standard Python), accessible
uniquement depuis cette machine (127.0.0.1), puis ouvre http://127.0.0.1:8000/web/
Arrêt : Ctrl+C dans le terminal.
"""

import functools
import http.server
import threading
import webbrowser
from pathlib import Path

PORT = 8000
RACINE = Path(__file__).resolve().parent


class Gestionnaire(http.server.SimpleHTTPRequestHandler):
    # Types MIME forcés : sous Windows, le registre peut associer .js à text/plain,
    # ce qui empêche le navigateur de charger les modules JavaScript.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".csv": "text/csv; charset=utf-8",
        ".html": "text/html; charset=utf-8",
    }


def main() -> None:
    gestionnaire = functools.partial(Gestionnaire, directory=str(RACINE))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), gestionnaire) as serveur:
        url = f"http://127.0.0.1:{PORT}/web/"
        print(f"Simulateur disponible sur {url}  (Ctrl+C pour arrêter)")
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
        try:
            serveur.serve_forever()
        except KeyboardInterrupt:
            print("\nServeur arrêté.")


if __name__ == "__main__":
    main()
