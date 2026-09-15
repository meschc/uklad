import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Палитра приезжает из редактора (`npm run tokens`), оформление витрины — своё.
import "./tokens.css";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
