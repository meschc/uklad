/** Вход, заявки, демо-ссылки, менеджеры и настройки входа владельца. */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const b = require("./base");

const { esc, when, day, hidden, errorBox, opt } = b;
const page = (session, active, title, body) =>
  b.layout({ title, session, active, body, badges: session.badges });

const LEAD = { new: "Новая", work: "В работе", won: "Стал клиентом", lost: "Отказ" };
const KIND = { demo: "Демо", warehouse: "Склад", seller: "Селлер", contact: "Вопрос" };

function loginPage({ error, dev } = {}) {
  return b.layout({
    title: "Вход",
    body: `<form class="card login" method="post" action="/login" autocomplete="on">
      <h1>Вход в админку</h1>
      ${dev ? `<p class="muted small">Локальная копия с демо-данными. На сервере данные будут свои.</p>` : ""}
      ${errorBox(error)}
      <label>Почта<input name="email" type="email" autocomplete="username" required autofocus></label>
      <label>Пароль<input name="password" type="password" autocomplete="current-password" required></label>
      <label>Код из приложения<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
      <button>Войти</button>
    </form>`,
  });
}

function leadsList({ session, leads, status, ready }) {
  const tab = (v, label) =>
    `<a class="${status === v ? "on" : ""}" href="/leads${v ? `?status=${v}` : ""}">${label}</a>`;
  const body = !ready
    ? `<p class="empty">Приёмник заявок не подключён к этой базе.</p>`
    : leads.length
      ? `<table><thead><tr><th>#</th><th>Когда</th><th>Вид</th><th>Тема</th><th>Статус</th><th>Аккаунт</th></tr></thead><tbody>${leads
          .map(
            (l) => `<tr><td class="num">${l.id}</td><td class="num">${when(l.created_at)}</td>
            <td>${esc(KIND[l.kind] ?? l.kind)}</td><td><a href="/leads/${l.id}">${esc(l.subject)}</a></td>
            <td><span class="badge ${esc(l.status)}">${LEAD[l.status] ?? esc(l.status)}</span>${l.mailed ? "" : ` <span class="badge overdue">письмо не ушло</span>`}</td>
            <td>${l.account_id ? `<a href="/accounts/${l.account_id}">#${l.account_id}</a>` : "—"}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : `<p class="empty">Заявок нет.</p>`;
  return page(
    session,
    "/leads",
    "Заявки",
    `<div class="head"><h1>Заявки с сайта</h1><span class="count">${leads.length}</span></div>
    <p class="muted">Заявки живут здесь 180 дней, потом стираются: рабочая копия — письмо в почте.</p>
    <div class="bar"><div class="seg">${tab("", "Все")}${Object.entries(LEAD)
      .map(([k, v]) => tab(k, v))
      .join("")}</div></div>
    ${body}`,
  );
}

function leadPage({ session, lead: l, fields, account }) {
  const list = Object.entries(fields)
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join("");
  return page(
    session,
    "/leads",
    `Заявка #${l.id}`,
    `<a class="back" href="/leads">← Заявки</a>
    <div class="head"><h1>Заявка #${l.id}</h1><span class="badge ${esc(l.status)}">${LEAD[l.status] ?? esc(l.status)}</span></div>
    <div class="cols">
      <section class="card stack">
        <h2>${esc(l.subject)}</h2>
        <dl><dt>Когда</dt><dd>${when(l.created_at)}</dd><dt>Вид</dt><dd>${esc(KIND[l.kind] ?? l.kind)}</dd>
          <dt>Язык</dt><dd>${esc(l.lang)}</dd><dt>Реклама</dt><dd>${l.consent_ads ? "согласен" : "нет"}</dd>
          <dt>Письмо</dt><dd>${l.mailed ? "ушло" : "не ушло — ответьте по контактам ниже"}</dd>${list}</dl>
      </section>
      <div class="stack">
        <form class="card form" method="post" action="/leads/${l.id}">${hidden(session)}
          <h2>Что с заявкой</h2>
          <label>Статус<select name="status">${Object.entries(LEAD)
            .map(([k, v]) => opt(k, v, l.status))
            .join("")}</select></label>
          <label>Заметка<textarea name="note" maxlength="2000">${esc(l.note)}</textarea></label>
          <div class="actions"><button>Сохранить</button></div>
        </form>
        <div class="card stack">
          <h2>Аккаунт</h2>
          ${
            account
              ? `<p>Связана с <a href="/accounts/${account.id}">${esc(account.name)}</a>.</p>`
              : `<p class="muted small">Создаст аккаунт по почте из заявки: тариф «Старт», пробный период 3 месяца. Если почта уже есть — свяжет с ним.</p>
                 <form method="post" action="/leads/${l.id}/convert">${hidden(session)}<button>Сделать клиентом</button></form>`
          }
        </div>
      </div>
    </div>`,
  );
}

function demosList({ session, demos, now }) {
  const body = demos.length
    ? `<table><thead><tr><th>Почта</th><th>Выдана</th><th>Работает до</th><th class="r">Открыли</th><th>Первый раз</th><th>Заявка</th></tr></thead><tbody>${demos
        .map(
          (d) => `<tr><td>${esc(d.email)}</td><td class="num">${when(d.created_at)}</td>
          <td class="num">${day(d.expires_at)}${d.expires_at < now ? ` <span class="badge archived">истекла</span>` : ""}</td>
          <td class="num r">${d.opens}</td><td class="num">${when(d.opened_at)}</td>
          <td>${d.lead_id ? `<a href="/leads/${d.lead_id}">#${d.lead_id}</a>` : "—"}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">Демо-ссылок пока не выдавали.</p>`;
  return page(
    session,
    "/demos",
    "Демо-ссылки",
    `<div class="head"><h1>Демо-ссылки</h1><span class="count">${demos.length}</span></div>
    <p class="muted">Выдаются сами по заявке «Демо» с почтой. Здесь видно, открыл ли человек демо и сколько раз; саму ссылку не показываем.</p>
    ${body}`,
  );
}

function managersPage({ session, managers, load }) {
  const rows = managers.length
    ? managers
        .map(
          (
            m,
          ) => `<form class="card form" method="post" action="/managers/${m.id}">${hidden(session)}
          <div class="row3">
            <label>Имя<input name="name" maxlength="120" value="${esc(m.name)}"></label>
            <label>Контакт<input name="contact" maxlength="200" value="${esc(m.contact)}"></label>
            <label class="check" style="align-self:end;height:36px"><input type="checkbox" name="active"${m.active ? " checked" : ""}> Работает</label>
          </div>
          <div class="actions"><button class="sm">Сохранить</button><span class="muted small">Клиентов: ${load.get(m.id) ?? 0}</span></div>
        </form>`,
        )
        .join("")
    : `<p class="empty">Менеджеров пока нет.</p>`;
  return page(
    session,
    "/managers",
    "Менеджеры",
    `<div class="head"><h1>Персональные менеджеры</h1></div>
    <p class="muted">По тарифу «Оператор» у клиента свой менеджер. Назначается в карточке аккаунта.</p>
    <div class="stack" style="max-width:820px">${rows}
      <form class="card form" method="post" action="/managers">${hidden(session)}
        <h2>Добавить менеджера</h2>
        <div class="row"><label>Имя<input name="name" required maxlength="120"></label><label>Контакт<input name="contact" maxlength="200" placeholder="почта или телефон"></label></div>
        <div class="actions"><button>Добавить</button></div>
      </form>
    </div>`,
  );
}

function settingsPage({ session, admin, sessions, now, error, done }) {
  return page(
    session,
    "/settings",
    "Вход и защита",
    `<div class="head"><h1>Вход и защита</h1></div>
    <div class="cols">
      <form class="card form" method="post" action="/settings/password">${hidden(session)}
        <h2>Сменить пароль</h2>
        ${errorBox(error)}${done ? `<p class="ok">Пароль сменён, остальные входы закрыты.</p>` : ""}
        <p class="muted small">Почта: ${esc(admin.email)}. Нужны текущий пароль и код из приложения.</p>
        <label>Текущий пароль<input name="current" type="password" autocomplete="current-password" required></label>
        <div class="row">
          <label>Новый пароль<input name="next" type="password" autocomplete="new-password" minlength="12" required></label>
          <label>Ещё раз<input name="next2" type="password" autocomplete="new-password" minlength="12" required></label>
        </div>
        <label>Код из приложения<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
        <div class="actions"><button>Сменить пароль</button></div>
      </form>
      <section class="card stack">
        <h2>Где вы вошли</h2>
        <table><thead><tr><th>Вход</th><th>Последнее действие</th><th>Кончится</th></tr></thead><tbody>${sessions
          .map(
            (x) =>
              `<tr><td class="num">${when(x.created_at)}${x.token_hash === session.tokenHash ? ` <span class="badge paid">это вы</span>` : ""}</td><td class="num">${when(x.seen_at)}</td><td class="num">${when(x.expires_at)}</td></tr>`,
          )
          .join("")}</tbody></table>
        ${
          sessions.length > 1
            ? `<form method="post" action="/settings/sessions">${hidden(session)}<button class="ghost">Закрыть все, кроме этой</button></form>`
            : `<p class="muted small">Других входов нет.</p>`
        }
        <p class="muted small">Сессия живёт 12 часов и закрывается после часа без действий. Секрет кода из приложения меняется только на сервере.</p>
        <p class="muted small">Сейчас ${when(now)} по Москве.</p>
      </section>
    </div>`,
  );
}

module.exports = { loginPage, leadsList, leadPage, demosList, managersPage, settingsPage };
