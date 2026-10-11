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
L'onglet lit les QCM publiés sur ton site QCM (projet Firebase `qcmbasket`, en lecture seule). Le plus récent est « QCM de la semaine ». Chaque arbitre le passe une seule fois ; son score est enregistré ici et sa moyenne s'affiche en haut. Rien à faire de plus : publie tes QCM comme d'habitude sur ton site QCM.

## 8. Forum
Les arbitres publient du texte, une image (réduite automatiquement) et/ou un lien vidéo (YouTube, Drive, Vimeo), et commentent sous chaque publication. Les vidéos ne sont pas envoyées sur le site : on colle un lien. Republie `firestore.rules` dans Firebase après chaque mise à jour de ce fichier.

## 9. Coaching individuel
Chaque arbitre voit uniquement sa propre fiche (onglet « Coaching individuel »). Toi : Espace coach → « Fiche individuelle » à côté d'un arbitre → « + Nouvelle séance » (compte rendu, devoirs, points de concentration, avec liens en pièces jointes). Republie `firestore.rules` : l'isolation entre arbitres vient de ces règles.
