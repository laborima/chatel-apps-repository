# 🌊 Chatel Meteo Planner — Functional & Technical Specification

## 🎯 Objectif

Implémenter **l’interface utilisateur (UI)** du projet **`chatel-meteo-planner`**, une application web et mobile réactive permettant aux passionnés de sports nautiques de planifier leurs sessions en fonction des conditions météo et marées à **Châtelaillon-Plage**.

L’application est **frontend uniquement**, hébergée sur **GitHub Pages**, et consomme des données stockées dans le dossier `public/`.

---

## 🧱 Architecture Générale

* **Technologie** : React (client-side only, sans backend)
* **Langage** : JavaScript (ES6+)
* **Hébergement** : GitHub Pages (statique)
* **Données** : stockées dans `/public`
* **Internationalisation (i18n)** :

  * Le code est écrit en **anglais**
  * Tous les textes affichés doivent provenir de fichiers de **langue en français**
* **Aucune édition ou modification côté UI** : uniquement de la **consultation (read-only)**
Inspirations UI : maquettes web, mobile et montre fournies dans le dossier :

/UI-mockups/
   ├── web/
   ├── mobile/
   └── watch/

---

## 📦 Services Frontend à implémenter (ou adapter)

Les services sont situés (ou à créer) sous `src/services/` :

| Service           | Description                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `activitiService` | Gestion et filtrage des activités disponibles selon les conditions météo et marées.                  |
| `weatherService`  | Récupération des données météo (scrapping + OpenWeather).                                            |
| `tideService`     | Calculs de marée et tendances (rising/falling, hauteurs, échéances).                                 |
| `plannerService`  | Coordination globale : combine météo, marées et préférences du marin pour recommander les activités. |

---

## 🌦️ Données météo

Source principale :
[`https://www.meteo-la-rochelle.fr/live-chatelaillon.php`](https://www.meteo-la-rochelle.fr/live-chatelaillon.php)

**Objectif du scraping (`scrapeMeteoLaRochelle()`) :**

* Extraire les informations :

  * Vitesse du vent (en nœuds et Beaufort)
  * Direction du vent
  * Moyenne sur 1 et 10 minutes
  * Images pertinentes (rose des vents, webcam)
* Actualisation temps réel

---

## 🌊 Données marées

* **Source API Météo France** (ou jeu de données local dans `/public/tides`)
* **Fonctions clés :**

  * `fetchTideData()`
  * `calculateTideHeightUsingTwelfths()`
* Informations à afficher :

  * Hauteur actuelle
  * Tendances (montante/descendante)
  * Prochaine marée haute/basse
  * Courbe optionnelle de marée (canvas ou SVG)

---

## 🧭 Données prévisions météo

* **Source secondaire** : OpenWeatherMap (5-day forecast)
* Fonction : `fetchFiveDayForecast()`
* Regroupe par jour :

  * Température min/max
  * Vent max (noeuds)
  * Probabilité de pluie
  * Direction du vent dominante

---

## 🏄‍♂️ Données des activités et marins

### Fichier : `/public/activities/activities.json`

Contient :

1. **5 profils de marins**
2. **4 types d’activités**
3. **Matériels suggérés selon profil et conditions**

### 👥 Profils marins

Chaque profil contient :

* `name` : prénom
* `height` : taille (cm)
* `weight` : poids (kg)
* `favoriteGear` : liste de matériels préférés (boards, sails, wings, boats)
* `preferredConditions` : plages de vent, houle ou marée idéales

Exemples de profils :
`Christophe`, `Constance`, `Matthieu`, `Théo`, `Anna`.

### 🏖️ Activités

| Nom           | Type      | Conditions                                                                                                    | Durée min | Matériel suggéré     |
| ------------- | --------- | ------------------------------------------------------------------------------------------------------------- | --------- | -------------------- |
| **Cirrus**    | bateau    | marée > 2m, vent 5–20 nds, houle < 3m, pas de pluie                                                           | 2h        | bateau, gilet        |
| **Windsurf**  | windsurf  | marée > 3m, vent 15–25 nds, direction SO/O/NO (idéal O), soleil non couché, week-end ou après 18h             | 2h        | 3 planches, 5 voiles |
| **Wing**      | wingfoil  | marée > 4m, vent 10–18 nds, direction SO/O/NO (idéal O), houle < 1m, soleil non couché, week-end ou après 18h | 2h        | 1 planche, 3 wings   |
| **Speedsail** | speedsail | marée < 4m, vent > 15 nds, direction SO/O (idéal O), soleil non couché, week-end ou après 18h                 | 2h        | 1 speedsail, 3 wings |


Bateau :  (Cirrus) Dufour 310 grand large (3 ris dans la grand voile)
Windsurf BOARD: JP Magic ride 110L, Bic techno 293L, RRD 150L
SAIL windsurf: gastra matrix 6.0, duotone idol ltd 5.0, neelpryde wizard 3.6, Duotone wrap 7.2
Wing Board and foil : GONG SUP INFLATABLE HIPE - 5'5  GONG WING FOIL ALLVATOR V2 X-OVER ALU - XL 
Wing : CABRINHA MANTIS 6.2 2021 , Gong wing 5.0, Wing Slingshot Slingwing V2 2021 - Taille : 4.4M- Couleur : ORANGE
Speedsail : norbert blanc sports

---

## 📱 Interface Utilisateur (UI)

### Inspiration

Mockups disponibles dans `UI-mockups/web` et `UI-mockups/mobile`.

### Design Prompt

> “Design a responsive, English-language UI for a GitHub-hosted front-end that helps wind and water sports enthusiasts plan their sessions around real-time marine conditions in Châtelaillon-Plage, France.”

### 🎨 Thème & UX

* **Palette nautique** : bleu profond, turquoise, sable clair
* **Typographie** : sans-serif claire avec accents sportifs
* **Iconographie** : matériel, direction du vent, marée
* **Charts** : sparklines, jauges radiales (vent, marée)
* **Accessibilité** : contraste fort, zones tactiles larges

---

## 🧩 Modules UI Principaux

### 1. Header / Hero

* Logo + nom de l’app : “Chatel Meteo Planner”
* Cartes de statut rapide :

  * Vent (nœuds + Beaufort)
  * Direction
  * Miniature webcam
* Sélecteur de profil marin

### 2. Dashboard Temps Réel

* Jauge de vent
* Boussole directionnelle
* Averages (1 min / 10 min)
* Widget marée (hauteur, tendance, courbe)
* Webcam du port (live ou snapshot)

<iframe src="https://pv.viewsurf.com/2080/Chatelaillon-Port" frameborder="0" scrolling="no" allowfullscreen="allowfullscreen" style="position:absolute;top:0;left:0;bottom:0;right:0;width:100%;height:100%;border:0px;"><br /></iframe>

* Notification opt-in banner

### 3. Planificateur (5 jours)

* Timeline horizontale des jours
* Cartes de prévisions : température, vent, pluie
* Filtres selon le profil sélectionné
* Cartes d’activités :

  * Conditions requises
  * Matériel recommandé (avec correspondance favoris)
  * Bouton “Notifier” ou “Rappel”

### 4. Fiche Marin

* Nom, taille, poids
* Matériel favori
* Graphique des plages de vent recommandées
* Sélecteur de profil actif

### 5. Centre de notifications

* Liste des fenêtres favorables à venir
* Configuration des alertes :
  ex. “Notifier quand Windsurf idéal pour Christophe entre 15–20 nds”

### 6. Vue Montre Connectée

* Données essentielles :

  * Vent + direction
  * Marée
  * Prochaine activité
* Haptics et push indicators

### 7. Footer

* Attribution OpenWeather + Meteo La Rochelle
* Lien GitHub repo
* Disclaimer sur la fiabilité des données

---

## 🔔 Notifications

* Notifications push (web + montre)
* Rappel automatique des créneaux favorables
* Toast de confirmation lors de l’activation

---

## 🧩 Composants à produire

* `WeatherCard`, `TideWidget`, `ActivityCard`, `ProfileSelector`
* `WindGauge`, `DirectionCompass`, `NotificationToast`
* `MobileHeader`, `WatchPreview`, `PlannerTimeline`
* Librairie de composants réutilisables (style Tailwind ou shadcn/ui)

---

## 🧪 Livrables

1. **Code React complet** (client-side)
2. **Dossier `/public`** contenant :

   * `activities/activities.json`
   * Données météo et marées
3. **UI responsive mobile-first**
4. **Internationalisation (français)**
5. **Prévisualisation montre connectée**
6. **Notifications push fonctionnelles**

