# Châtel Météo Watch ⌚

Application **Wear OS** native pour Pixel Watch 4 (et toute montre Wear OS 3+),
compagnon de [chatel-meteo-planner](../chatel-meteo-planner/).

Les données proviennent du serveur SignalK hébergé sur
**https://signalk.example.org** (marée via signalk-tides, météo via
chatel-signalk-weatherprovider, profils/activités via `activities.json` du
meteo-planner). Aucun déploiement serveur supplémentaire n'est nécessaire.

## Fonctionnalités

### Application (4 vues, navigation par balayage horizontal)

1. **🌊 Marée** — hauteur actuelle, sens (montante/descendante), prochaines
   pleine mer (PM) et basse mer (BM) avec heures locales et hauteurs.
   Toucher l'écran pour actualiser.
2. **🏄 Activités** — activités recommandées *maintenant* pour le profil
   sélectionné, avec score et raison si indisponible (même moteur de règles
   que le site : vent en nœuds, marée min/max, jour/nuit, pluie, température,
   visibilité, direction du vent).
3. **📷 Webcam** — instantané du port de Châtelaillon (Viewsurf), toucher
   pour rafraîchir.
4. **⚙ Profil** — choix du profil (Matthieu, Christophe, Constance, Théo,
   Anna), chargé dynamiquement depuis `activities.json` et mémorisé sur la
   montre (DataStore).

### Complications de cadran (appui long sur le cadran → Personnaliser → emplacement)

- **Marée Châtelaillon** — hauteur, sens, heure de la prochaine PM/BM, coefficient
- **Vent Châtelaillon (kt)** — vent temps réel en nœuds, direction, rafales

Chacune est proposée en trois formats selon l'emplacement du cadran :
texte court (`4.2 m`), texte long (`4.2 m ↑ PM 19:23`) et jauge
(arc entre BM et PM pour la marée, 0–40 nœuds pour le vent).
Toucher la complication ouvre l'application.

### Tuiles Wear OS (appui long sur le cadran → ajouter une tuile)

- **Marée Châtel** — hauteur, sens, PM/BM (fraîcheur 30 min)
- **Activités Châtel** — meilleure activité pour le profil choisi (30 min)
- **Webcam du port** — image redimensionnée pour la montre (15 min)

Toucher une tuile ouvre l'application.

### Consommation batterie

- **Aucun service en arrière-plan, aucun WorkManager, aucun polling.**
- Les tuiles et les complications sont rendues par le système **uniquement quand
  elles sont affichées** ; l'intervalle de fraîcheur ne déclenche un
  rafraîchissement que si l'élément est visible (rien ne tourne écran éteint).
- **La marée est calculée hors ligne.** Une seule requête récupère les extrêmes
  de la semaine ; la hauteur est ensuite recalculée localement (interpolation
  harmonique, quelques microsecondes). La complication marée se rafraîchit donc
  toutes les 5 min **sans réseau**, et n'interroge le serveur qu'environ deux
  fois par jour.
- **Cache partagé à un seul appel en vol** (`DataCache`) : quatre complications
  sur le même cadran déclenchent **une** requête, pas quatre.
- Le vent temps réel est limité à un appel toutes les 8 min, quel que soit le
  nombre de complications et de tuiles qui le demandent.
- Toute requête réseau est plafonnée à 8 s : une complication ne fait jamais
  attendre le cadran, elle affiche la dernière valeur connue.
- Persistance sur disque : après un redémarrage, la valeur s'affiche
  immédiatement au lieu d'attendre le réseau.
- L'application ne fait des requêtes réseau que lorsqu'elle est ouverte.
- App "standalone" : fonctionne en Wi-Fi/LTE sans téléphone appairé.

## Build

### Prérequis

- [Android Studio](https://developer.android.com/studio) (Ladybug ou plus
  récent) — ou JDK 17 + SDK Android 35 en ligne de commande.

### Avec Android Studio (recommandé)

1. `File → Open` → sélectionner le dossier `chatel-watch/`.
2. Laisser la synchronisation Gradle se terminer (téléchargement des
   dépendances à la première ouverture).
3. `Build → Build App Bundle(s)/APK(s) → Build APK(s)`.

### En ligne de commande

```bash
cd chatel-watch
# si le SDK n'est pas détecté : echo "sdk.dir=$HOME/Android/Sdk" > local.properties
./gradlew assembleDebug
# APK généré : app/build/outputs/apk/debug/app-debug.apk
```

## Déploiement sur la Pixel Watch 4

### 1. Activer le mode développeur sur la montre

1. Sur la montre : **Paramètres → Système → À propos → Versions** →
   tapoter 7 fois sur **Numéro de build**.
2. Retour dans **Paramètres → Options pour les développeurs** →
   activer **Débogage ADB** et **Débogage via Wi-Fi**.

### 2. Connecter la montre en ADB sans fil

La montre et l'ordinateur doivent être sur le **même réseau Wi-Fi**.

1. Sur la montre : **Options développeurs → Débogage via Wi-Fi →
   Associer un nouvel appareil**. Un code d'association et une adresse
   `IP:port` s'affichent.
2. Sur l'ordinateur :

```bash
# Association (port d'appairage affiché sur la montre)
adb pair 192.168.1.XX:YYYYY
# saisir le code à 6 chiffres affiché sur la montre

# Connexion (port de connexion affiché sur l'écran "Débogage via Wi-Fi")
adb connect 192.168.1.XX:ZZZZZ
adb devices   # la montre doit apparaître "device"
```

### 3. Installer l'application

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

(Depuis Android Studio : sélectionner la montre dans la liste des
appareils puis ▶ Run.)

### 4. Sur la montre

1. L'app **Châtel Météo** apparaît dans la liste des applications.
2. Ajouter les tuiles : **appui long sur le cadran → Tuiles → +** (ou
   balayer jusqu'au bout des tuiles → **Ajouter**) → choisir
   *Marée Châtel*, *Activités Châtel*, *Webcam du port*.
3. Choisir le profil : ouvrir l'app → balayer jusqu'à la vue **⚙ Profil**.

## Configuration

| Réglage | Valeur par défaut | Où |
|---|---|---|
| Serveur SignalK | `https://signalk.example.org` | `Prefs.DEFAULT_BASE_URL` |
| Webcam | `https://filmspv.viewsurf.com/chatelaillon02_live/media.jpg` | `SignalKApi.WEBCAM_URL` |
| Profil par défaut | `matthieu` | `Prefs.DEFAULT_PROFILE` |

Les profils, activités et la position (lat/lon) sont lus à chaque
lancement depuis
`https://signalk.example.org/chatel-meteo-planner/activities/activities.json` —
modifier le JSON côté serveur suffit pour mettre à jour la montre.

## Architecture

```
app/src/main/java/org/leslaborie/chatel/watch/
├── data/
│   ├── Models.kt        # TideInfo, TideExtreme, CurrentWeather, ActivityDef, …
│   ├── SignalKApi.kt    # client REST SignalK + webcam (OkHttp)
│   ├── TideMath.kt      # interpolation harmonique de la marée (hors ligne)
│   ├── DataCache.kt     # cache partagé, un seul appel en vol, persistance
│   ├── Planner.kt       # moteur de recommandation (port de plannerService.js)
│   └── Prefs.kt         # DataStore : profil + URL serveur
├── ui/
│   ├── MainActivity.kt  # pager 4 vues (Compose for Wear OS)
│   └── Screens.kt       # Marée / Activités / Webcam / Profil
├── tile/
│   ├── TileHelpers.kt
│   ├── TideTileService.kt
│   ├── ActivitiesTileService.kt
│   └── WebcamTileService.kt
└── complication/
    ├── ComplicationHelpers.kt
    ├── TideComplicationService.kt   # marée, calculée hors ligne
    └── WindComplicationService.kt   # vent temps réel en nœuds
```
