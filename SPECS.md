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

### 👥 Profils marins


| Name           | Height (cm) | Weight (kg) | FavoriteGear                                                                                                                                                                                                                 | PreferredConditions                                             |
| -------------- | ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Matthieu**   | 178         | 78          | Dufour 310 *Cirrus*, JP Magic Ride 110, RRD Evolution 360 XS, Gaastra Matrix 6.0, Duotone Super Star 5.0, Duotone Warp 7.2, GONG HIPE 5'5, GONG Allvator XL, GONG Wing 5.0, Slingshot SlingWing V2 4.4, Norbert Blanc Sports | 14–25 nds, houle < 2 m, marée > 3 m, O–SO, soleil               |
| **Christophe** | 182         | 82          | Dufour 310 *Cirrus*, JP Magic Ride 110, RRD Evolution 360 XS, Duotone Warp 7.2, GONG HIPE 5'5, GONG Allvator XL, GONG Wing 5.0, Gaastra Matrix 6.0                                                                           | 12–22 nds, houle < 1.5 m, marée > 3 m, Ouest stable             |
| **Constance**  | 168         | 62          | Bic Beach 185, RRD Evolution 360 XS, Cabrinha Mantis 6.2, GONG HIPE 5'5, GONG Allvator XL, Slingshot SlingWing V2 4.4, Bombard AX 240, Norbert Blanc Sports                                                                  | 8–18 nds, houle < 1 m, marée > 2 m, soleil calme                |
| **Théo**       | 170         | 62          | Bic Beach 185, RRD Evolution 360 XS, Cabrinha Mantis 6.2, GONG HIPE 5'5, GONG Allvator XL, GONG Wing 5.0, Norbert Blanc Sports                                                                                               | 10–25 nds, houle < 1 m, marée 3–4 m, O–SO                       |
| **Anna**       | 150         | 58          | JP Magic Ride 110, Bic Beach 185, RRD Evolution 360 XS, GONG HIPE 5'5, GONG Allvator XL, Slingshot SlingWing V2 4.4, Bombard AX 240, Duotone Super Star 5.0, NeilPryde Wizard 3.6, Norbert Blanc Sports                      | 8–25 nds, mer plate ou houle < 1.5 m, marée > 2 m, météo stable |



### 🏖️ Activités

| Nom                    | Type                        | Conditions idéales                                                                                                                   | Durée min | Matériel suggéré                                     |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------------------------------------- |
| **Cirrus**             | Bateau (voilier)            | marée > 1 m • vent 5–20 nds • houle < 3 m • pas d’orage/pluie • visibilité > 3 km • température > 10 °C                              | 2 h       | Dufour 310 GL, gilets, GPS, VHF                      |
| **Windsurf**           | Windsurf                    | marée > 3 m • vent 15–25 nds • direction SO/O/NO *(idéal : O)* • houle < 2 m • soleil levé • week-end ou après 18 h pour matthieu / théo / constance, Tous les jours avant 18H pour christophe               | 1h30–2h   | JP 110 L / Bic 185 L / RRD 158 L + voiles 3.6–7.2 m² |
| **Wingfoil**           | Wingfoil                    | marée > 4 m • vent 10–20 nds • direction SO/O/NO *(idéal : O)* • houle < 1 m • pas d’orage • soleil levé • week-end ou après 18 h pour matthieu / théo / constance, Tous les jours avant 18H pour christophe  | 1h30–2h   | GONG HIPE 5'5 + Foil XL + wings 4.4/5.0/6.2          |
| **Speedsail**          | Speedsail (terre/sable dur) | marée < 3.5 m *(plage dégagée)* • vent > 15 nds • direction SO/O *(idéal : O)* • sable sec • soleil levé • week-end | 1h        | Norbert Blanc Sports + voile 5.0–6.0 m²              |
| **Balade Paddle**      | SUP / détente               | marée > 4 m • vent < 10 nds • houle < 0.8 m • météo stable • marée montante si possible • week-end ou après 18 h pour matthieu / théo / constance, Tous les jours avant 18H pour christophe                          | 1h        | GONG HIPE 5'5 sans foil, pagaie                      |



### ⛵️ **Matériel nautique – Inventaire**

| Type                | Marque / Modèle                   | Volume (L) | Poids (kg) | Wind Range (nœuds) | Marin                    | Utilisateurs             |
| ------------------- | --------------------------------- | ---------- | ---------- | ------------------ | ------------------------ | ------------------------ |
| **Bateau**          | Dufour 310 Grand Large (Cirrus)   | –          | ~4 700     | 0–35               | Skipper confirmé         | **Matthieu** , Tous |
| **Windsurf Board**  | JP Magic Ride 110                 | 110        | 7.5        | 14–25              | Intermédiaire / Confirmé | **Matthieu**, Anna |
| **Windsurf Board**  | Bic Beach 185                     | 185        | 10.5       | 8–18               | Débutant                 | Théo, Constance, Anna, **Christophe**    |
| **Windsurf Board**  | RRD Evolution 360 XS              | 158        | 8.8        | 10–20              | Débutant / Intermédiaire | **Anna**, Christophe, Constance       |
| **Windsurf Sail**   | Gaastra Matrix 6.0                | –          | ~4.3       | 14–22              | Intermédiaire            | **Matthieu**, Christophe, Constance |
| **Windsurf Sail**   | Duotone Super Star 5.0            | –          | ~3.5       | 18–28              | Confirmé                 | **Anna**, Matthieu |
| **Windsurf Sail**   | NeilPryde Wizard 3.6              | –          | ~2.9       | 25–40              | Expert                   | **Anna**             |
| **Windsurf Sail**   | Duotone Warp 7.2                  | –          | ~5.0       | 12–20              | Confirmé (slalom)        | **Matthieu**             |
| **Wing Board**      | GONG HIPE 5'5 (Inflatable)        | 110        | 7.5        | 12–25              | Débutant / Intermédiaire | **Tous** |
| **Foil**            | GONG Allvator V2 X-Over Alu – XL  | –          | ~6.0       | 10–22              | Intermédiaire            | **Tous**             |
| **Wing**            | Cabrinha Mantis 6.2 (2021)        | –          | ~3.2       | 10–18              | Débutant / Lightwind     | **Tous**         |
| **Wing**            | GONG Wing 5.0                     | –          | ~2.8       | 14–25              | Intermédiaire            | **Théo**, Constance |
| **Wing**            | Slingshot SlingWing V2 4.4 (2021) | –          | ~2.6       | 16–30              | Confirmé                 | **Matthieu**, Anna             |
| **Speedsail**       | Norbert Blanc Sports              | –          | ~12        | 10–25              | Intermédiaire / Confirmé | **Matthieu**, Théo, Constance, Anna      |



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

