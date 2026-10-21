/**
 * Страницы админки. Рисует их сервер, строкой: отдельной сборки, React и
 * чужих скриптов нет вовсе — политика безопасности запрещает любой скрипт,
 * и подменить страницу через внедрённый код нечем. Всё, что приходит из базы,
 * проходит через `esc`.
 */
/* global module */

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const KIND = { warehouse: "Склад", seller: "Селлер" };
const STATUS = { active: "Работает", blocked: "Заблокирован" };
const ACTION = {
  login: "Вход",
  login_failed: "Неудачный вход",
  login_locked: "Вход заблокирован",
  logout: "Выход",
  account_create: "Добавлен аккаунт",
  account_block: "Блокировка",
  account_unblock: "Разблокировка",
  access_reset: "Сброс доступа",
};

/** Дата по Москве: склады и Кирилл живут в одном поясе. */
function when(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function layout({ title, body, session }) {
  const nav = session
    ? `<header class="top">
        <a class="logo" href="/">Уклад · админка</a>
        <nav><a href="/">Пользователи</a><a href="/audit">Журнал</a></nav>
        <form method="post" action="/logout">
          <input type="hidden" name="csrf" value="${esc(session.csrf)}">
          <button class="ghost">Выйти</button>
        </form>
      </header>`
    : "";
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Уклад админка</title>
<link rel="stylesheet" href="/admin.css">
</head><body>${nav}<main>${body}</main></body></html>`;
}

const hidden = (session) => `<input type="hidden" name="csrf" value="${esc(session.csrf)}">`;

function loginPage({ error } = {}) {
  return layout({
    title: "Вход",
    body: `<form class="card login" method="post" action="/login" autocomplete="on">
      <h1>Вход в админку</h1>
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
      <label>Почта<input name="email" type="email" autocomplete="username" required autofocus></label>
      <label>Пароль<input name="password" type="password" autocomplete="current-password" required></label>
      <label>Код из приложения<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
      <button>Войти</button>
    </form>`,
  });
}

function accountsPage({ session, accounts, filter, error }) {
  const tab = (kind, label) =>
    `<a class="${filter.kind === kind ? "on" : ""}" href="/?kind=${kind}">${label}</a>`;
  const rows = accounts
    .map(
      (a) => `<tr>
        <td><a href="/accounts/${a.id}">${esc(a.name)}</a></td>
        <td>${KIND[a.kind]}</td>
        <td>${esc(a.email)}</td>
        <td><span class="badge ${a.status}">${STATUS[a.status]}</span></td>
        <td class="num">${when(a.last_login_at)}</td>
        <td class="num">${when(a.created_at)}</td>
      </tr>`,
    )
    .join("");
  return layout({
    title: "Пользователи",
    session,
    body: `<div class="head"><h1>Пользователи</h1><span class="count">${accounts.length}</span></div>
    <div class="bar">
      <div class="seg">${tab("", "Все")}${tab("warehouse", "Склады")}${tab("seller", "Селлеры")}</div>
      <form method="get" action="/"><input type="hidden" name="kind" value="${esc(filter.kind)}">
        <input name="q" value="${esc(filter.search)}" placeholder="Название или почта"></form>
    </div>
    <table><thead><tr><th>Название</th><th>Тип</th><th>Почта</th><th>Статус</th><th>Последний вход</th><th>Добавлен</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" class="empty">Пока никого. Первые склады появятся после запуска сервера.</td></tr>`}</tbody></table>
    <form class="card add" method="post" action="/accounts">
      <h2>Добавить аккаунт</h2>
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
      ${hidden(session)}
      <div class="row">
        <label>Тип<select name="kind"><option value="warehouse">Склад</option><option value="seller">Селлер</option></select></label>
        <label>Название<input name="name" required maxlength="120"></label>
        <label>Почта<input name="email" type="email" required maxlength="200"></label>
        <button>Добавить</button>
      </div>
    </form>`,
  });
}

function auditRows(rows) {
  return rows
    .map((r) => {
      let detail = "";
      try {
        const d = r.detail ? JSON.parse(r.detail) : null;
        if (d)
          detail = Object.entries(d)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
      } catch {
        detail = r.detail;
      }
      return `<tr><td class="num">${when(r.at)}</td><td>${esc(ACTION[r.action] ?? r.action)}</td>
        <td>${esc(r.target ?? "")}</td><td class="muted">${esc(detail)}</td></tr>`;
    })
    .join("");
}

function accountPage({ session, account, audit, resetLink }) {
  const a = account;
  const blocked = a.status === "blocked";
  return layout({
    title: a.name,
    session,
    body: `<a class="back" href="/">← Все пользователи</a>
    <div class="head"><h1>${esc(a.name)}</h1><span class="badge ${a.status}">${STATUS[a.status]}</span></div>
    ${
      resetLink
        ? `<div class="card notice"><strong>Ссылка для нового пароля</strong>
           <p>Показываем один раз. Отправьте её человеку сами, она работает 24 часа и гасит прежние.</p>
           <code>${esc(resetLink)}</code></div>`
        : ""
    }
    <div class="grid">
      <dl class="card">
        <dt>Тип</dt><dd>${KIND[a.kind]}</dd>
        <dt>Почта</dt><dd>${esc(a.email)}</dd>
        <dt>Добавлен</dt><dd>${when(a.created_at)}</dd>
        <dt>Последний вход</dt><dd>${when(a.last_login_at)}</dd>
        ${blocked ? `<dt>Причина блокировки</dt><dd>${esc(a.blocked_note || "—")}</dd>` : ""}
        <dt>Тариф</dt><dd class="muted">Следующий этап</dd>
      </dl>
      <div class="card actions">
        <h2>Доступ</h2>
        ${
          blocked
            ? `<form method="post" action="/accounts/${a.id}/unblock">${hidden(session)}<button>Разблокировать</button></form>`
            : `<form method="post" action="/accounts/${a.id}/block">${hidden(session)}
                 <label>Причина<input name="note" maxlength="200" placeholder="Например: не оплатил"></label>
                 <button class="danger">Заблокировать</button></form>`
        }
        <form method="post" action="/accounts/${a.id}/reset">${hidden(session)}
          <button class="ghost">Сбросить доступ</button>
          <p class="muted">Старый пароль перестанет работать, человек задаст новый по ссылке.</p>
        </form>
      </div>
    </div>
    <h2>Журнал по аккаунту</h2>
    <table><thead><tr><th>Когда</th><th>Действие</th><th>Кого</th><th>Подробности</th></tr></thead>
    <tbody>${auditRows(audit) || `<tr><td colspan="4" class="empty">Пусто</td></tr>`}</tbody></table>`,
  });
}

function auditPage({ session, audit }) {
  return layout({
    title: "Журнал",
    session,
    body: `<div class="head"><h1>Журнал действий</h1></div>
    <p class="muted">Каждый вход и каждое действие в админке. Записи нельзя исправить или стереть.</p>
    <table><thead><tr><th>Когда</th><th>Действие</th><th>Кого</th><th>Подробности</th></tr></thead>
    <tbody>${auditRows(audit) || `<tr><td colspan="4" class="empty">Пусто</td></tr>`}</tbody></table>`,
  });
}

const CSS = `
:root{--bg:#fff;--fg:hsl(224 12% 12%);--muted:hsl(220 9% 42%);--line:hsl(220 13% 91%);--soft:#fafafa;--primary:hsl(221 83% 53%);--danger:hsl(0 72% 51%);--r:10px;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:hsl(224 14% 9%);--fg:hsl(220 14% 92%);--muted:hsl(220 9% 60%);--line:hsl(223 12% 20%);--soft:hsl(223 12% 13%);--primary:hsl(217 91% 52%)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
.top{display:flex;align-items:center;gap:24px;padding:0 16px;height:56px;border-bottom:1px solid var(--line)}
.top nav{display:flex;gap:16px;flex:1}.top a{color:var(--fg);text-decoration:none}.top nav a{color:var(--muted)}.top nav a:hover{color:var(--fg)}.logo{font-weight:600}
h1{font-size:24px;margin:0}h2{font-size:16px;margin:32px 0 12px}
.head{display:flex;align-items:center;gap:12px;margin-bottom:16px}.count{color:var(--muted)}
.bar{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}
.seg{display:inline-flex;background:var(--soft);border:1px solid var(--line);border-radius:var(--r);padding:2px}
.seg a{padding:0 14px;height:30px;display:flex;align-items:center;border-radius:8px;color:var(--muted);text-decoration:none}.seg a.on{background:var(--bg);color:var(--fg);box-shadow:0 1px 2px rgb(0 0 0/.08)}
input,select{height:36px;padding:0 10px;border:1px solid var(--line);border-radius:var(--r);background:var(--bg);color:var(--fg);font:inherit;width:100%}
input:focus,select:focus{outline:2px solid var(--primary);outline-offset:-1px}
button{height:36px;padding:0 16px;border:0;border-radius:999px;background:var(--primary);color:#fff;font:inherit;font-weight:500;cursor:pointer}
button.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}button.danger{background:var(--danger)}
table{width:100%;border-collapse:collapse}th{text-align:left;font-weight:500;color:var(--muted);font-size:13px}
th,td{padding:10px 8px;border-bottom:1px solid var(--line)}td a{color:var(--primary);text-decoration:none}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}.muted{color:var(--muted)}.empty{color:var(--muted);text-align:center;padding:32px}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;background:var(--soft);border:1px solid var(--line)}.badge.blocked{color:var(--danger);border-color:currentColor}
.card{background:var(--soft);border-radius:16px;padding:20px}
.login{max-width:360px;margin:12vh auto 0;display:grid;gap:14px}.login h1{font-size:20px}
label{display:grid;gap:6px;color:var(--muted);font-size:13px}
.add{margin-top:32px}.add h2{margin-top:0}.row{display:grid;grid-template-columns:140px 1fr 1fr auto;gap:12px;align-items:end}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}dl{margin:0;display:grid;grid-template-columns:160px 1fr;gap:10px}dt{color:var(--muted)}dd{margin:0}
.actions{display:grid;gap:16px;align-content:start}.actions h2{margin:0}.actions form{display:grid;gap:8px;justify-items:start}.actions p{margin:0;font-size:13px}
.error{color:var(--danger);margin:0}.back{color:var(--muted);text-decoration:none;display:inline-block;margin-bottom:12px}
.notice{margin-bottom:16px;border:1px solid var(--primary)}.notice p{margin:6px 0}.notice code{word-break:break-all}
@media (max-width:720px){.row,.grid{grid-template-columns:1fr}table{display:block;overflow-x:auto}.top{gap:12px}}
`;

module.exports = { loginPage, accountsPage, accountPage, auditPage, CSS, esc };
