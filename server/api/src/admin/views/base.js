/**
 * Общее для всех страниц админки: каркас с боковым меню, экранирование,
 * даты по Москве, деньги и стили.
 *
 * Страницы рисует сервер строкой: ни React, ни одного скрипта — CSP их
 * запрещает, и подменить страницу внедрённым кодом нечем. Всё, что пришло из
 * базы или формы, проходит через `esc`.
 */
/* global module */

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const TZ = "Europe/Moscow";
function when(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function day(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { timeZone: TZ });
}
/** Значение для `<input type=date>`: дата по Москве, ГГГГ-ММ-ДД. */
function dateInput(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
}
/** Сколько дней осталось до даты; отрицательное — прошло. */
function daysLeft(iso, nowIso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date(nowIso)) / 86_400_000);
}
const money = (n) =>
  n == null ? "—" : `${Number(n).toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`;

const NAV = [
  ["/", "Обзор"],
  ["/accounts", "Пользователи"],
  ["/leads", "Заявки"],
  ["/support", "Поддержка"],
  ["/demos", "Демо-ссылки"],
  ["/managers", "Менеджеры"],
  ["/audit", "Журнал"],
  ["/settings", "Вход и защита"],
];

const hidden = (session) => `<input type="hidden" name="csrf" value="${esc(session.csrf)}">`;
const errorBox = (error) => (error ? `<p class="error" role="alert">${esc(error)}</p>` : "");
const opt = (value, label, current) =>
  `<option value="${esc(value)}"${String(current ?? "") === String(value) ? " selected" : ""}>${esc(label)}</option>`;

function layout({ title, body, session, active, badges = {} }) {
  const nav = session
    ? `<aside class="side">
        <a class="logo" href="/">Уклад<span>админка</span></a>
        <nav>${NAV.map(
          ([href, label]) =>
            `<a href="${href}" class="${active === href ? "on" : ""}">${label}${
              badges[href] ? `<b>${badges[href]}</b>` : ""
            }</a>`,
        ).join("")}</nav>
        <form method="post" action="/logout">${hidden(session)}<button class="ghost sm">Выйти</button></form>
      </aside>`
    : "";
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Уклад админка</title>
<link rel="stylesheet" href="/admin.css">
</head><body class="${session ? "app" : ""}">${nav}<main>${body}</main></body></html>`;
}

const CSS = `
:root{--bg:#fff;--fg:hsl(224 12% 12%);--muted:hsl(220 9% 42%);--line:hsl(220 13% 91%);--soft:#fafafa;--primary:hsl(221 83% 53%);--danger:hsl(0 72% 51%);--ok:hsl(152 60% 36%);--warn:hsl(32 90% 44%);--r:10px;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:hsl(224 14% 9%);--fg:hsl(220 14% 92%);--muted:hsl(220 9% 60%);--line:hsl(223 12% 20%);--soft:hsl(223 12% 13%);--primary:hsl(217 91% 60%);--ok:hsl(152 50% 50%);--warn:hsl(32 90% 60%)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
body.app{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
main{max-width:1180px;width:100%;padding:28px 32px 64px}
.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:20px;padding:20px 12px;border-right:1px solid var(--line)}
.side nav{display:grid;gap:2px;flex:1;align-content:start}
.side nav a{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:8px;color:var(--muted);text-decoration:none}
.side nav a:hover{color:var(--fg);background:var(--soft)}.side nav a.on{color:var(--fg);background:var(--soft);font-weight:500}
.side nav b{background:var(--primary);color:#fff;border-radius:999px;font-size:11px;padding:1px 7px;font-weight:600}
.logo{font-weight:700;font-size:17px;color:var(--fg);text-decoration:none;padding:0 12px}.logo span{display:block;font-weight:400;font-size:12px;color:var(--muted)}
h1{font-size:24px;margin:0}h2{font-size:16px;margin:0 0 12px}h3{font-size:14px;margin:0 0 8px}
.head{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}.head .grow{flex:1}.count{color:var(--muted)}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:end}
.bar form{display:flex;gap:8px;flex-wrap:wrap;align-items:end;width:100%}.bar .q{flex:1;min-width:200px}.bar select{width:auto}
.seg{display:inline-flex;background:var(--soft);border:1px solid var(--line);border-radius:var(--r);padding:2px;flex-wrap:wrap}
.seg a{padding:0 12px;height:30px;display:flex;align-items:center;border-radius:8px;color:var(--muted);text-decoration:none;white-space:nowrap}.seg a.on{background:var(--bg);color:var(--fg);box-shadow:0 1px 2px rgb(0 0 0/.08)}
input,select,textarea{height:36px;padding:0 10px;border:1px solid var(--line);border-radius:var(--r);background:var(--bg);color:var(--fg);font:inherit;width:100%}
textarea{height:auto;min-height:80px;padding:8px 10px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:2px solid var(--primary);outline-offset:-1px}
input[type=checkbox]{width:16px;height:16px}
button,.btn{height:36px;padding:0 16px;border:0;border-radius:999px;background:var(--primary);color:#fff;font:inherit;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;text-decoration:none;white-space:nowrap}
button.ghost,.btn.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}button.danger{background:var(--danger)}button.sm,.btn.sm{height:32px;padding:0 12px;font-size:13px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-weight:500;color:var(--muted);font-size:13px;white-space:nowrap}
th,td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}td a{color:var(--primary);text-decoration:none}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}.r{text-align:right}.muted{color:var(--muted)}.small{font-size:12px}.empty{color:var(--muted);text-align:center;padding:28px}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;white-space:nowrap;border:1px solid var(--line);background:var(--soft)}
.badge.paid,.badge.won{color:var(--ok);border-color:currentColor}.badge.trial,.badge.work{color:var(--primary);border-color:currentColor}
.badge.overdue,.badge.new{color:var(--warn);border-color:currentColor}.badge.blocked,.badge.lost{color:var(--danger);border-color:currentColor}.badge.archived{color:var(--muted)}
.card{background:var(--soft);border-radius:16px;padding:20px}
.stack{display:grid;gap:16px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.tile{background:var(--soft);border-radius:16px;padding:16px 18px;text-decoration:none;color:var(--fg);display:block}.tile b{display:block;font-size:26px;font-variant-numeric:tabular-nums;margin-top:4px}.tile span{color:var(--muted);font-size:13px}
label{display:grid;gap:6px;color:var(--muted);font-size:13px}label.check{display:flex;align-items:center;gap:8px;color:var(--fg);font-size:14px}
.form{display:grid;gap:12px}.form .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.form .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
dl{margin:0;display:grid;grid-template-columns:150px 1fr;gap:8px 12px}dt{color:var(--muted)}dd{margin:0;word-break:break-word}
.login{max-width:360px;margin:12vh auto 0;display:grid;gap:14px}.login h1{font-size:20px}
.error{color:var(--danger);margin:0}.ok{color:var(--ok);margin:0}.back{color:var(--muted);text-decoration:none;display:inline-block;margin-bottom:12px}
.notice{border:1px solid var(--primary)}.notice code{word-break:break-all;display:block;margin-top:8px;padding:8px;background:var(--bg);border-radius:8px}
.feat{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center}.feat select{width:auto;height:32px}
.danger-zone{border:1px solid var(--line);background:transparent}
.pre{white-space:pre-wrap;font:inherit;margin:0}.gap-top{margin-top:24px}
@media (max-width:900px){body.app{grid-template-columns:1fr}.side{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;border-right:0;border-bottom:1px solid var(--line);padding:12px}.side nav{display:flex;flex-wrap:wrap;flex:1 1 100%;order:3}.tiles{grid-template-columns:1fr 1fr}.cols,.form .row,.form .row3{grid-template-columns:1fr}main{padding:20px 16px 48px}table{display:block;overflow-x:auto}}
`;

module.exports = { esc, when, day, dateInput, daysLeft, money, layout, hidden, errorBox, opt, CSS };
