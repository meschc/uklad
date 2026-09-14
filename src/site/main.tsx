import React from "react";
import ReactDOM from "react-dom/client";
import { SiteApp } from "./SiteApp";
import { SiteErrorBoundary } from "./components/SiteErrorBoundary";
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
    </SiteErrorBoundary>
  </React.StrictMode>,
);
