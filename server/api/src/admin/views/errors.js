/** Ошибки у пользователей: то, что кабинет сам прислал при падении экрана. */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const b = require("./base");

const { esc, when, hidden } = b;

const STATES = { open: "Открытые", done: "Разобранные" };
/** Откуда пришла ошибка: `screen:<экран>`, `window`, `promise`. */
const SOURCES = { window: "Окно", promise: "Обещание" };

const sourceName = (s) => SOURCES[s] ?? (s.startsWith("screen:") ? "Падение экрана" : esc(s));

function errorsList({ session, errors, state }) {
  const tab = (v, label) =>
    `<a class="${state === v ? "on" : ""}" href="/errors${v ? `?state=${v}` : ""}">${label}</a>`;
  const row = (e) => `<tr>
    <td><details><summary>${esc(e.message.length > 90 ? `${e.message.slice(0, 90)}…` : e.message)}</summary>
      <p class="pre">${esc(e.message)}</p>
      ${e.stack ? `<pre class="pre small">${esc(e.stack)}</pre>` : `<p class="hint">Стека нет.</p>`}
    </details></td>
    <td>${sourceName(e.source)}</td><td>${esc(e.view) || "—"}</td>
    <td class="num r">${e.count}</td>
    <td class="num">${when(e.first_seen)}</td><td class="num">${when(e.last_seen)}</td>
    <td>${
      e.resolved_at
        ? `<span class="badge done">Разобрано</span>`
        : `<span class="badge new">Открыта</span>`
    }</td>
    <td><form method="post" action="/errors/${e.fingerprint}">${hidden(session)}
      <input type="hidden" name="state" value="${esc(state)}">
      <input type="hidden" name="resolved" value="${e.resolved_at ? "0" : "1"}">
      <button class="btn soft sm">${e.resolved_at ? "Вернуть" : "Разобрано"}</button></form></td></tr>`;
  const body = errors.length
    ? `<table><thead><tr><th>Что случилось</th><th>Откуда</th><th>Экран</th><th class="r">Раз</th><th>Первый раз</th><th>Последний раз</th><th>Статус</th><th></th></tr></thead><tbody>${errors
        .map(row)
        .join("")}</tbody></table>`
    : `<p class="empty">Ошибок нет.</p>`;
  return b.layout({
    title: "Ошибки",
    session,
    active: "/errors",
    badges: session.badges,
    body: `${b.head("Клиенты", `Ошибки · ${errors.length}`)}
    <p class="lede">Падения экранов и необработанные ошибки, которые кабинет присылает сам. Одинаковые склеены в одну строку со счётчиком. Если разобранная ошибка повторится, она снова станет открытой. Хранятся 90 дней.</p>
    <div class="bar"><div class="seg">${tab("", "Все")}${Object.entries(STATES)
      .map(([k, v]) => tab(k, v))
      .join("")}</div></div>
    ${body}`,
  });
}

module.exports = { errorsList, ERROR_STATES: Object.keys(STATES) };
