[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![SignalK](https://img.shields.io/badge/SignalK-webapp-blue.svg)](https://signalk.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC.svg)](https://tailwindcss.com/)

🌍 *[English](README.md)*

# Chatel Meteo Planner

Webapp SignalK pour planifier les sessions de sports nautiques a Chatelaillon-Plage en fonction de la meteo et des marees.

Deploye sur GitHub Pages : <https://laborima.github.io/chatel-apps-repository>

## Fonctionnalites

- **Tableau de bord temps reel** — vent, marees, temperature, webcam
- **Recommandations d'activites** — suggestions personnalisees par profil marin
- **Planificateur 5 jours** — previsions meteo et creneaux favorables
- **Profils marins** — 5 profils pre-configures avec materiel et preferences
- **Notifications** — alertes pour les conditions ideales
- **PWA** — installable sur mobile

## Installation

```bash
npm install
npm run dev
```

Aucune cle API requise. L'application utilise l'API gratuite [Open-Meteo](https://open-meteo.com/) (donnees Meteo France).

## Sources de donnees

**Avec SignalK (recommande)** — lorsque deployee comme webapp SignalK :

- **Temps reel** : plugin `signalk-meteolarochelle-provider`
- **Marees** : plugin `signalk-tides`

**Mode autonome (fallback)** — sans SignalK :

- **Meteo** : [Open-Meteo API](https://open-meteo.com/en/docs/meteofrance-api) (Meteo France)
- **Marees** : donnees locales JSON
- **Webcam** : [Viewsurf - Port de Chatelaillon](https://pv.viewsurf.com/2080/Chatelaillon-Port)

## Activites

| Activite | Conditions | Maree |
|----------|-----------|-------|
| Cirrus (voilier) | Vent 5-20 nds, houle < 3m | > 1m |
| Windsurf | Vent 15-25 nds, direction SO/O/NO | > 3m |
| Wingfoil | Vent 10-20 nds, houle < 1m | > 4m |
| Speedsail | Vent > 15 nds, direction SO/O | < 3.5m |
| Balade Paddle | Vent < 10 nds, houle < 0.8m | > 4m |

## Deploiement

### SignalK (recommande)

```bash
cd ../chatel-signalk-weatherprovider
./deploy-signalk.sh --planner
```

### GitHub Pages

```bash
npm run build
# Fichiers statiques dans out/
```

### Configuration

Fichier `.env.local` optionnel :

```bash
# URL du serveur SignalK (vide = utilise l'origine de la page)
NEXT_PUBLIC_SIGNALK_URL=http://192.168.x.x:3000
```

## Stack

- **Next.js 16** (React 19) — export statique
- **Tailwind CSS 4**
- **Open-Meteo API** (gratuit, sans cle)

## Licence

Apache-2.0
