// src/lib/firebase.ts

import { initializeApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";

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

// Инициализируем приложение
export const app = initializeApp(firebaseConfig);

// Экспорт базы данных для useStats / чата / ников
export const db = getDatabase(app);

// (опционально) аналитика — только в браузере
let analytics: Analytics | undefined;

if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

export { analytics };
