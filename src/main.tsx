import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import "./lib/firebase";
import { LanguageProvider } from "./context/LanguageContext";
import { initGoogleAnalytics } from "./lib/analytics";

// Initialize Google Analytics
const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
if (gaMeasurementId) {
  initGoogleAnalytics(gaMeasurementId);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
