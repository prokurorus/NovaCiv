// src/lib/firebase.ts

import { initializeApp } from "firebase/app";
import { getAnalytics, Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCmTNXdBF7ilzeZVB2VaIt1USIMdXA2src",
  authDomain: "novaciv-web.firebaseapp.com",
  databaseURL:
    "https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "novaciv-web",
  storageBucket: "novaciv-web.firebasestorage.app",
  messagingSenderId: "884571454196",
  appId: "1:884571454196:web:e88a75431190a9e299bca1",
  measurementId: "G-FG254WGYF1",
};

let analytics: Analytics | undefined;

if (typeof window !== "undefined") {
  const app = initializeApp(firebaseConfig);
  analytics = getAnalytics(app);
}

export { analytics };
