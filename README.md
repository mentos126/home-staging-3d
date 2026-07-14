# Maquette 3D — Étage R+1 (visite 3D)

Rendu 3D interactif d'un étage, reconstruit à partir d'un plan d'architecte.
Deux modes : **Survol** (vue d'ensemble en orbite) et **Visite** (première personne,
on se déplace à l'intérieur).

## Lancer le projet

```bash
npm install
npm run dev
```

Puis ouvre l'URL affichée (par défaut http://localhost:5173).

## Modes

### 🔭 Survol
- **Clic gauche** : orbite · **molette** : zoom · **clic droit** : déplace la vue.

### 🚶 Visite (première personne)
- Clique sur l'écran pour entrer (verrouillage de la souris).
- **Z Q S D** / **W A S D** / **flèches** : se déplacer.
- **Souris** : regarder autour · **Maj** : courir · **Échap** : sortir.
- Collisions actives : on ne traverse pas les murs ni les garde-corps.

> Le verrouillage souris nécessite un vrai navigateur (Chrome, Edge, Firefox, Safari) ;
> il peut être bloqué dans certains environnements restreints.

## Ce qui est modélisé (d'après le plan)

- **Chambre 1**, **Salle de bain**, **Chambre 2**, **Chambre 3** (bloc nord, prof. 4,21 m)
- **Dégagement** (palier) + **escalier** descendant
- **Vide sur séjour** (double hauteur) avec garde-corps
- **Terrasse** (sud-est)

## Hypothèses / approximations

Faciles à corriger en haut de [`src/main.js`](src/main.js) (cotes en mètres) :

- Hauteur sous plafond plate à **2,5 m** (pas de rampant modélisé pour l'instant).
- Positions des **portes** et **fenêtres** estimées.
- **Escalier** visuel (descend vers un niveau inférieur non détaillé).
- **Garage existant** non modélisé (niveau inférieur).
