import React from "react";
import ReactDOM from "react-dom/client";
import { SiteApp } from "./SiteApp";
import { SiteErrorBoundary } from "./components/SiteErrorBoundary";
import { FontTuner } from "./components/dev/FontTuner";
import { normalizeUrl } from "./lib/route";
// Сначала база приложения (токены темы, Tailwind), потом правки витрины —
// иначе `site.css` перебивается тем, что идёт после него.
import "../index.css";
import "./site.css";

// Старые ссылки (`#/market`, `?lang=en`) приводим к нынешнему виду до первой
// отрисовки: иначе страница успеет мигнуть содержимым другого адреса.
normalizeUrl();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SiteErrorBoundary>
      <SiteApp />
      {/* Панель подбора шрифта. Только в dev: в сборке условие ложно, и
          Vite вырезает и вызов, и сам модуль. Предрендер её не видит —
          он идёт через entry-server.tsx, а не через этот файл. */}
      {import.meta.env.DEV && <FontTuner />}
    </SiteErrorBoundary>
  </React.StrictMode>,
);
