// Configuration du projet Firebase dédié à l'espace coaching.
// Ces clés ne sont pas secrètes : la protection des données repose sur les règles Firestore.

export const firebaseConfig = {
  apiKey: "AIzaSyBgNgTno_RCh0IBEN4bIYc1dbJeHkHwH6M",
  authDomain: "coaching-arbitrage.firebaseapp.com",
  projectId: "coaching-arbitrage",
  storageBucket: "coaching-arbitrage.firebasestorage.app",
  messagingSenderId: "359461498848",
  appId: "1:359461498848:web:0b27df7c2d42597a648585"
};

// Adresse e-mail du coach (identique à celle des règles Firestore).
export const COACH_EMAIL = "isiah.schmidt@hotmail.fr";

// Projet Firebase du site QCM (lecture seule : les QCM publiés sont lus ici).
export const qcmConfig = {
  apiKey: "AIzaSyBZVKzKKwXgmlj8ikREFdXkH7PQFUD525Y",
  authDomain: "qcmbasket.firebaseapp.com",
  projectId: "qcmbasket",
  storageBucket: "qcmbasket.firebasestorage.app",
  messagingSenderId: "21050951258",
  appId: "1:21050951258:web:3cc90457e7fca8df74ba63"
};
