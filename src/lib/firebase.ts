import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCmTNXdBF7ilzeZVB2VaIt1USIMdXA2src",
  authDomain: "novaciv-web.firebaseapp.com",
  databaseURL: "https://novaciv-web-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "novaciv-web",
  storageBucket: "novaciv-web.firebasestorage.app",
  messagingSenderId: "884571454196",
  appId: "1:884571454196:web:e88a75431190a9e299bca1",
  measurementId: "G-FG254WGYF1",
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);

