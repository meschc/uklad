import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { embedView, isEmbed, parseDeepLink } from "./lib/appViews";
import { useEditor } from "./lib/store";
import { describeError, journal } from "./lib/support/journal";
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

// Встроенный в витрину кабинет (см. `isEmbed`): без подсказок и тостов,
// колесо уходит странице витрины, экран переключает витрина сообщением.
if (isEmbed(window.location.search)) {
  const quiet = () => {
    const s = useEditor.getState();
    if (s.activeHint) s.dismissHint();
    if (s.toast) useEditor.setState({ toast: null });
  };
  quiet();
  useEditor.subscribe(quiet);
  // Перехват на окне до React: план не панорамируется колесом, а фрейм без
  // своей прокрутки отдаёт её странице снаружи.
  window.addEventListener("wheel", (e) => e.stopPropagation(), { capture: true, passive: true });
  // Живой снимок, а не второй кабинет (Кирилл 31 окт): наведение подсвечивает
  // как в продукте, но нажать, протащить, ввести или открыть меню нельзя.
  const block = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  for (const type of [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "auxclick",
    "contextmenu",
    "keydown",
    "dragstart",
  ]) {
    window.addEventListener(type, block, { capture: true, passive: false });
  }
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    const view = embedView(e.data);
    if (view) useEditor.getState().goToView(view);
  });
}

// Журнал для «Сообщить о проблеме»: какие экраны открывались и что упало.
// Пишется только номер экрана и текст ошибки, без данных склада.
journal.record("view", useEditor.getState().appView);
useEditor.subscribe((s, prev) => {
  if (s.appView !== prev.appView) journal.record("view", s.appView);
});
window.addEventListener("error", (e) =>
  journal.record("error", "window", describeError(e.error ?? e.message)),
);
window.addEventListener("unhandledrejection", (e) =>
  journal.record("error", "promise", describeError(e.reason)),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
