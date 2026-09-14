import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { parseDeepLink } from "./lib/appViews";
import { useEditor } from "./lib/store";
import "./index.css";
// Печать плана и наклеек — только в бандле приложения: правило прячет всё,
// кроме `.print-root`, и на витрине оставляло бы пустые листы. Порядок важен:
// после базы, не до неё.
import "./print.css";

// Прямая ссылка на экран: `?role=&view=` — см. lib/appViews.ts. Применяем до
// первой отрисовки, а не эффектом внутри App: иначе человек успевает увидеть
// тот экран, на котором остановился в прошлый раз, и только потом его
// подменяет ссылка. Роль идёт первой — она сама уводит на «свой» стартовый
// экран, и порядок наоборот затёр бы то, что просили открыть.
const link = parseDeepLink(window.location.search);
if (link.role) useEditor.getState().setRole(link.role);
if (link.view) useEditor.getState().goToView(link.view);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
