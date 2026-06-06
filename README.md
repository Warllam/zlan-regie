# ZLAN Régie

Outil de régie pour stream/diffusion d'événement gaming (ZLAN 2026). Un serveur Node.js sert un **dashboard** de pilotage et plusieurs **overlays OBS** mis à jour en temps réel via WebSocket. Pilotable au clavier, depuis un Steam Deck, ou via un Stream Deck (boutons HTTP).

## Fonctionnalités

- **Dashboard** de contrôle (jeu en cours, phase, score, vies, timer, POV…)
- **Overlays OBS** : infos de match, cadre caméra, POV joueur, compteur d'heures Steam
- **Synchro temps réel** de tous les overlays via WebSocket
- **Intégration Steam** : récupération automatique des heures de jeu des joueurs (API Steam)
- **Endpoints Stream Deck** (`/sd/...`) pour timer, vies, POV et changement de jeu en un clic
- Profil Stream Deck généré via script PowerShell

## Prérequis

- [Node.js](https://nodejs.org/) (v18+ recommandé, pour `fetch` natif)
- Une clé API Steam : https://steamcommunity.com/dev/apikey

## Installation

```bash
npm install
```

Copie le fichier d'exemple de config et renseigne tes valeurs :

```bash
cp config.example.json config.json
```

```jsonc
{
  "steam": {
    "apiKey": "TA_CLE_API_STEAM",
    "players": {
      "warllam": "STEAM_ID_64",
      "ryroy":   "STEAM_ID_64"
    }
  }
}
```

> `config.json` est ignoré par git (il contient ta clé API). Ne le commit jamais.

## Lancement

```bash
npm start
```

(ou `start.bat` sous Windows)

Le serveur écoute sur le port **3456**. Au démarrage, les URLs sont affichées dans la console :

| Vue | URL |
|-----|-----|
| Dashboard (Steam Deck / réseau) | `http://<ip-locale>:3456/dashboard.html` |
| Dashboard (local) | `http://localhost:3456/dashboard.html` |
| Overlay OBS — infos | `http://localhost:3456/overlay.html` |
| Overlay OBS — cadre caméra | `http://localhost:3456/overlay-cam.html` |
| Overlay OBS — POV joueur | `http://localhost:3456/overlay-pov.html` |
| Overlay OBS — heures Steam | `http://localhost:3456/overlay-hours.html` |

Dans OBS, ajoute chaque overlay comme **source navigateur** avec l'URL correspondante.

## API

### État & données
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/state` | État courant complet |
| GET | `/games` | Liste des jeux (`games.json`) |
| GET | `/phases` | Liste des phases |
| GET | `/steam-hours` | Heures de jeu Steam |
| GET | `/steam/resolve` | Résout un pseudo/URL Steam en SteamID |

### Endpoints Stream Deck (GET)
| Route | Action |
|-------|--------|
| `/sd/timer/start` · `/sd/timer/stop` · `/sd/timer/reset` | Contrôle du timer |
| `/sd/pov/show` · `/sd/pov/hide` · `/sd/pov/toggle` | Affichage du POV |
| `/sd/lives/up` · `/sd/lives/down` | Gestion des vies (0–3) |
| `/sd/game/next` · `/sd/game/prev` · `/sd/game/:id` | Changement de jeu |

Le dashboard utilise aussi des routes POST pour mettre à jour score, vies, timer, etc. (voir `server.js`).

## Stream Deck

Le script `generate-streamdeck-profile.ps1` génère un profil Stream Deck (`.streamDeckProfile`) avec les boutons HTTP pré-configurés vers les endpoints `/sd/...`.

## Structure

```
.
├── server.js            # Serveur Express + WebSocket
├── config.json          # Config Steam (non versionné)
├── config.example.json  # Modèle de config
├── games.json           # Catalogue des jeux
├── start.bat            # Lancement Windows
├── public/             # Dashboard + overlays OBS
│   ├── dashboard.html
│   ├── overlay.html
│   ├── overlay-cam.html
│   ├── overlay-pov.html
│   └── overlay-hours.html
└── generate-streamdeck-profile.ps1
```
