/** Поддержка: обращения «Сообщить о проблеме» из кабинета. */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const b = require("./base");

const { esc, when, hidden, opt } = b;
const page = (session, title, body) =>
  b.layout({ title, session, active: "/support", body, badges: session.badges });

const STATUS = { new: "Новое", work: "В работе", done: "Решено" };
const BADGE = { new: "new", work: "work", done: "won" };
const KIND = { view: "Экран", action: "Действие", error: "Ошибка" };

function supportList({ session, reports, status }) {
  const tab = (v, label) =>
    `<a class="${status === v ? "on" : ""}" href="/support${v ? `?status=${v}` : ""}">${label}</a>`;
  const body = reports.length
    ? `<table><thead><tr><th>№</th><th>Когда</th><th>Что случилось</th><th>Экран</th><th class="r">Ошибок</th><th>Копия</th><th>Статус</th></tr></thead><tbody>${reports
        .map(
          (r) => `<tr><td class="num">${r.id}</td><td class="num">${when(r.created_at)}</td>
          <td><a href="/support/${r.id}">${esc(r.message.length > 90 ? `${r.message.slice(0, 90)}…` : r.message)}</a></td>
          <td>${esc(r.view)}</td><td class="num r">${r.errors}</td><td>${r.has_snapshot ? "есть" : "—"}</td>
          <td><span class="badge ${BADGE[r.status] ?? ""}">${STATUS[r.status] ?? esc(r.status)}</span></td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">Обращений нет.</p>`;
  return page(
    session,
    "Поддержка",
    `<div class="head"><h1>Поддержка</h1><span class="count">${reports.length}</span></div>
    <p class="muted">Обращения «Сообщить о проблеме» из кабинета. Журнал и копия данных приходят уже без имён и контактов. Хранятся 90 дней.</p>
    <div class="bar"><div class="seg">${tab("", "Все")}${Object.entries(STATUS)
      .map(([k, v]) => tab(k, v))
      .join("")}</div></div>
    ${body}`,
  );
}

function supportPage({ session, report: r, payload }) {
  const env = payload.env ?? {};
  const journal = Array.isArray(payload.journal) ? payload.journal : [];
  const stats = payload.snapshot?.stats;
  // Свежие события сверху: ищут обычно то, что было прямо перед обращением.
  const rows = journal
    .slice()
    .reverse()
    .map(
      (
        e,
      ) => `<tr><td class="num">${Number.isFinite(e.at) && Math.abs(e.at) < 8.64e15 ? when(new Date(e.at).toISOString()) : "—"}</td>
      <td>${e.kind === "error" ? `<span class="badge blocked">${KIND.error}</span>` : esc(KIND[e.kind] ?? e.kind)}</td>
      <td>${esc(e.name)}</td><td>${e.detail ? `<pre class="pre small">${esc(e.detail)}</pre>` : ""}</td></tr>`,
    )
    .join("");
  return page(
    session,
    `Обращение № ${r.id}`,
    `<a class="back" href="/support">← Поддержка</a>
    <div class="head"><h1>Обращение № ${r.id}</h1><span class="badge ${BADGE[r.status] ?? ""}">${STATUS[r.status] ?? esc(r.status)}</span></div>
    <div class="cols">
      <section class="card stack">
        <h2>Что случилось</h2>
        <p class="pre">${esc(r.message)}</p>
        <dl><dt>Когда</dt><dd>${when(r.created_at)}</dd><dt>Экран</dt><dd>${esc(env.view)}</dd>
          <dt>Браузер</dt><dd class="small">${esc(env.userAgent)}</dd><dt>Экран устройства</dt><dd>${esc(env.screen)}</dd>
          <dt>Язык и пояс</dt><dd>${esc(env.language)} · ${esc(env.timezone)}</dd>
          <dt>Копия данных</dt><dd>${
            stats
              ? `есть: заменено имён ${Number(stats.names) || 0}, удалено полей ${Number(stats.dropped) || 0}, скрыто текстов ${Number(stats.texts) || 0}`
              : "не приложена"
          }</dd></dl>
        <div class="actions"><a class="btn ghost sm" href="/support/${r.id}.json">Скачать обращение целиком</a></div>
        <p class="muted small">Файл — для разбора ошибки: в нём журнал и копия без имён. Скачивание пишется в журнал админки.</p>
      </section>
      <form class="card form" method="post" action="/support/${r.id}">${hidden(session)}
        <h2>Что с обращением</h2>
        <label>Статус<select name="status">${Object.entries(STATUS)
          .map(([k, v]) => opt(k, v, r.status))
          .join("")}</select></label>
        <label>Заметка<textarea name="note" maxlength="2000">${esc(r.note)}</textarea></label>
        <div class="actions"><button>Сохранить</button></div>
      </form>
    </div>
    <h2 class="gap-top">Журнал событий · ${journal.length}</h2>
    ${journal.length ? `<table><thead><tr><th>Когда</th><th>Вид</th><th>Что</th><th>Подробности</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">Журнал пуст.</p>`}`,
  );
}

module.exports = { supportList, supportPage, SUPPORT_STATUSES: Object.keys(STATUS) };
