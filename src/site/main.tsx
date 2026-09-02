import React from "react";
import ReactDOM from "react-dom/client";
import { SiteApp } from "./SiteApp";
import { SiteErrorBoundary } from "./components/SiteErrorBoundary";
// Сначала база приложения (токены темы, Tailwind), потом правки витрины —
// иначе `site.css` перебивается тем, что идёт после него.
import "../index.css";
import "./site.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SiteErrorBoundary>
      <SiteApp />
    </SiteErrorBoundary>
  </React.StrictMode>,
);
