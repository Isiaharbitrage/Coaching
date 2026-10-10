# Espace coaching — mode d'emploi

Site séparé de ton site d'arbitrage, pour les arbitres que tu coaches : debriefs, play de la semaine, QCM.
Hébergement gratuit sur GitHub Pages + base Firebase (gratuite) **dédiée** (nouveau projet).

## 1. Créer le projet Firebase
1. console.firebase.google.com → **Ajouter un projet** (ex. `coaching-arbitrage`). Analytics : non.
2. **Authentication** → Commencer → **E-mail/Mot de passe** → Activer.
3. **Firestore Database** → Créer une base (mode production, région `eur3`).
4. Onglet **Règles** : colle le contenu de `firestore.rules` **après avoir remplacé `ton-email@exemple.com` par ton e-mail (en minuscules)** → Publier.
5. ⚙ Paramètres du projet → Vos applications → **</> Web** → copie la config.

## 2. Remplir `js/firebase-config.js`
Colle la config Firebase et mets ton e-mail dans `COACH_EMAIL` (identique aux règles).

## 3. GitHub Pages
Nouveau dépôt **public** (ex. `coaching`) → envoie tous les fichiers de ce dossier → Settings → Pages → branche `main`, dossier `/ (root)`.
Ajoute le domaine `TON-PSEUDO.github.io` dans Firebase → Authentication → Paramètres → **Domaines autorisés**.

## 4. Premier lancement
1. Ouvre le site, clique **Créer mon compte** avec TON e-mail de coach → onglet « Espace coach » visible.
2. Dans « Arbitres autorisés », ajoute l'e-mail de chaque arbitre. Il crée son compte, l'accès s'ouvre.

## 5. Publier un debrief
Sur ton site d'arbitrage : remplis `firebase-config.js` (`coachingConfig` + `COACH_EMAIL`), puis dans une analyse play-by-play clique **📤 Publier au coaching** (lien Drive + ton mot de passe coach). Seul le tableau est publié.

## 6. Play de la semaine
Espace coach → **+ Nouveau play** : lien YouTube / Drive (partagé « avec le lien ») / Vimeo + commentaire.

## 7. QCM
L'onglet affiche la moyenne et l'historique. Le chargement automatique du QCM de la semaine sera branché à partir des fichiers de ton site QCM.
