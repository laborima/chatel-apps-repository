# 🌊 Chatel Meteo Planner

Application web réactive pour planifier vos sessions de sports nautiques à Châtelaillon-Plage en fonction des conditions météo et marées.

## 🎯 Fonctionnalités

- **📊 Tableau de bord temps réel** : Affichage des conditions météo et marées actuelles
- **🏄 Recommandations d'activités** : Suggestions personnalisées selon les profils marins
- **📅 Planificateur 5 jours** : Prévisions météo et opportunités à venir
- **👥 Profils marins** : 5 profils pré-configurés avec matériel et préférences
- **🔔 Notifications** : Alertes pour les conditions idéales
- **⌚ Vue montre** : Aperçu simulé pour smartwatch
- **🎨 Interface responsive** : Design mobile-first avec mode sombre

## 🚀 Installation

### Prérequis

- Node.js 18+ 
- npm ou yarn

### Configuration

1. **Cloner le projet**
```bash
cd chatel-meteo-planner
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Lancer le serveur de développement**

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

> ✅ **Aucune clé API requise !** L'application utilise l'API gratuite Open-Meteo (données Météo France).

## 📦 Architecture

```
chatel-meteo-planner/
├── app/
│   ├── components/          # Composants React
│   │   ├── Dashboard.jsx    # Composant principal
│   │   ├── WeatherCard.jsx  # Carte météo
│   │   ├── TideWidget.jsx   # Widget marée
│   │   ├── ActivityCard.jsx # Carte activité
│   │   ├── ProfileSelector.jsx
│   │   ├── WindGauge.jsx
│   │   ├── DirectionCompass.jsx
│   │   ├── ForecastCard.jsx
│   │   ├── WebcamWidget.jsx
│   │   ├── NotificationCenter.jsx
│   │   └── WatchPreview.jsx
│   ├── services/            # Services métier
│   │   ├── meteoService.js  # Scraping Meteo La Rochelle
│   │   ├── tideService.js   # Calculs de marée
│   │   ├── forecastWeatherService.js # API Open-Meteo (prévisions)
│   │   ├── activitiesService.js  # Filtrage activités
│   │   └── plannerService.js     # Coordination globale
│   ├── locales/             # Traductions
│   │   └── fr.json          # Textes français
│   ├── lib/                 # Utilitaires
│   │   └── i18n.js          # Gestion i18n
│   ├── api/                 # Routes API
│   │   ├── planner/route.js
│   │   └── recommendations/route.js
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── public/
│   ├── activities/          # Données activités
│   │   └── activities.json
│   └── tides/               # Données marées
│       └── larochelle/
├── package.json
└── README.md
```

## 🏄 Activités supportées

### 1. Cirrus (Voile)
- Marée > 2m
- Vent 5-20 nœuds
- Houle < 3m
- Pas de pluie

### 2. Windsurf (Planche à voile)
- Marée > 3m
- Vent 15-25 nœuds
- Direction SO/O/NO
- Week-end ou après 18h

### 3. Wing (Wing foil)
- Marée > 4m
- Vent 10-18 nœuds
- Direction SO/O/NO
- Houle < 1m

### 4. Speedsail
- Marée < 4m
- Vent > 15 nœuds
- Direction SO/O
- Week-end ou après 18h

## 👥 Profils marins

- **Christophe** : 182cm, 82kg - Windsurf
- **Constance** : 170cm, 62kg - Windsurf & Wing
- **Matthieu** : 178cm, 78kg - Windsurf, Wing & Speedsail
- **Théo** : 185cm, 90kg - Windsurf, Wing & Speedsail
- **Anna** : 168cm, 58kg - Windsurf & Wing

## 🌐 Sources de données

- **Temps réel** : [Open-Meteo API (Météo France)](https://open-meteo.com/en/docs/meteofrance-api)
  - *Note* : La page [Météo La Rochelle - Châtelaillon](https://www.meteolarochelle.fr/wdlchatel/comparaison_chatelkts.htm) utilise AJAX/JavaScript pour charger les données dynamiquement, rendant le scraping traditionnel impossible. L'API Open-Meteo fournit des données temps réel équivalentes directement depuis Météo France.
- **Prévisions** : [Open-Meteo API (Météo France)](https://open-meteo.com/en/docs/meteofrance-api)
- **Marées** : Données locales (Météo France)
- **Webcam** : [Viewsurf - Port de Châtelaillon](https://pv.viewsurf.com/2080/Chatelaillon-Port)

## 🛠️ Stack technique

- **Framework** : Next.js 16 (React 19)
- **Styling** : Tailwind CSS 4
- **APIs** : Open-Meteo (gratuit, sans clé requise)
- **Langage** : JavaScript/TypeScript
- **Déploiement** : GitHub Pages (statique)

## 📱 Features UI

### Desktop
- Dashboard complet avec toutes les informations
- Graphiques et jauges interactives
- Planificateur 5 jours avec timeline
- Centre de notifications

### Mobile
- Layout responsive mobile-first
- Cards empilables
- Navigation tactile optimisée
- Swipe horizontal pour les prévisions

### Watch
- Vue simplifiée avec données essentielles
- Interface simulée de smartwatch
- Haptic feedback indicators

## 🔔 Notifications

L'application utilise l'API Web Notifications pour alerter l'utilisateur :

- Conditions idéales détectées
- Activités favorites disponibles
- Créneaux horaires optimaux

> **Note** : Les notifications nécessitent l'autorisation du navigateur.

## 🚢 Déploiement

### Build de production

```bash
npm run build
```

### Export statique (GitHub Pages)

```bash
npm run build
# Les fichiers statiques sont dans le dossier 'out/'
```

### Variables d'environnement production

## 📄 Licence

Projet personnel - Châtelaillon-Plage 2024

## ⚠️ Disclaimer

Les données météo sont fournies à titre indicatif. Vérifiez toujours les conditions réelles avant de partir en mer. La sécurité en mer est votre responsabilité.

## 🤝 Contribution

Pour toute suggestion ou amélioration, n'hésitez pas à ouvrir une issue sur GitHub.

---

**Made with ❤️ for Châtelaillon-Plage sailors** 🌊
