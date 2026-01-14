import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import "./lib/firebase";
import { LanguageProvider } from "./context/LanguageContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
