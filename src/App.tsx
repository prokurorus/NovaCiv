import React from "react";

export default function App() {
  return (
    <div className="wrap">
      <h1>Новая цивилизация</h1>

      <div className="grid">
        <div className="card">
          <h2>Манифест</h2>
          <p><a href="/Manifesto-ru">Manifesto (RU)</a></p>
          <p><a href="/Manifesto-en">Manifesto (EN)</a></p>
          <p><a href="/Manifesto-de">Manifesto (DE)</a></p>
          <p><a href="/Manifesto-es">Manifesto (ES)</a></p>
          <p><a href="/Manifesto-fr">Manifesto (FR)</a></p>
        </div>
        <div className="card">
          <h2>Устав</h2>
          <p><a href="/Charter-ru">Charter (RU)</a></p>
          <p><a href="/Charter-en">Charter (EN)</a></p>
          <p><a href="/Charter-de">Charter (DE)</a></p>
          <p><a href="/Charter-es">Charter (ES)</a></p>
          <p><a href="/Charter-fr">Charter (FR)</a></p>
        </div>
      </div>

      <h2>Присоединиться</h2>
      <p><a href="/join">Открыть страницу</a></p>
    </div>
  );
}
