/** Вход, заявки, менеджеры и настройки входа владельца. */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const b = require("./base");

const { esc, when, hidden, errorBox, opt, head, icon } = b;
const page = (session, active, title, body) =>
  b.layout({ title, session, active, body, badges: session.badges });

const LEAD = { new: "Новая", work: "В работе", won: "Стал клиентом", lost: "Отказ" };
const KIND = { demo: "Демо", warehouse: "Склад", seller: "Селлер", contact: "Вопрос" };
const kindTag = (k) => `<span class="tag ${esc(k)}">${esc(KIND[k] ?? k)}</span>`;
const leadBadge = (s) => `<span class="badge ${esc(s)}">${LEAD[s] ?? esc(s)}</span>`;

function loginPage({ error, dev } = {}) {
  return b.layout({
    title: "Вход",
    body: `<form class="login" method="post" action="/login" autocomplete="on">
      <span class="logo"><img src="${b.BRAND.logo}" width="36" height="36" alt=""><span>${b.BRAND.name}<small>${b.BRAND.sub}</small></span></span>
      <h1>Вход</h1>
      ${dev ? `<p class="hint">Локальная копия с демо-данными. На сервере данные будут свои.</p>` : ""}
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
      ? `<table><thead><tr><th>Заявка</th><th>Вид</th><th>Статус</th><th>Когда</th><th>Аккаунт</th></tr></thead><tbody>${leads
          .map(
            (
              l,
            ) => `<tr><td><a href="/leads/${l.id}">${esc(l.subject)}</a><div class="muted small">#${l.id}</div></td>
            <td>${kindTag(l.kind)}</td>
            <td>${leadBadge(l.status)}${l.mailed ? "" : ` <span class="badge overdue">письмо не ушло</span>`}</td>
            <td class="num muted">${when(l.created_at)}</td>
            <td>${l.account_id ? `<a href="/accounts/${l.account_id}">#${l.account_id}</a>` : "—"}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : `<p class="empty">Заявок нет.</p>`;
  return page(
    session,
    "/leads",
    "Заявки",
    `${head("Клиенты", `Заявки с сайта · ${leads.length}`)}
    <p class="lede">Заявки живут здесь 180 дней, потом стираются: рабочая копия — письмо в почте.</p>
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
    `<a class="back" href="/leads">${icon("back", 16)}Заявки</a>
    ${head(`Заявка #${l.id} · ${when(l.created_at)}`, l.subject, `${kindTag(l.kind)} ${leadBadge(l.status)}`)}
    <div class="side-col">
      <section>
        <h2>Что написал человек</h2>
        <dl>${list}<dt>Язык</dt><dd>${esc(l.lang)}</dd><dt>Реклама</dt><dd>${l.consent_ads ? "согласен" : "нет"}</dd>
          <dt>Письмо</dt><dd>${l.mailed ? "ушло" : "не ушло — ответьте по контактам выше"}</dd></dl>
      </section>
      <div>
        <div class="panel">
          <h2>Клиент</h2>
          ${
            account
              ? `<p>Связана с <a href="/accounts/${account.id}">${esc(account.name)}</a>.</p>`
              : `<p class="hint" style="margin-bottom:14px">Откроем форму нового аккаунта с данными из заявки — проверите и создадите.</p>
                 <a class="btn" href="/accounts/new?lead=${l.id}">${icon("plus")}Сделать клиентом</a>`
          }
        </div>
        <form class="form sec" method="post" action="/leads/${l.id}">${hidden(session)}
          <h2>Что с заявкой</h2>
          <label>Статус<select name="status">${Object.entries(LEAD)
            .map(([k, v]) => opt(k, v, l.status))
            .join("")}</select></label>
          <label>Заметка<textarea name="note" maxlength="2000">${esc(l.note)}</textarea></label>
          <div class="actions"><button class="soft">Сохранить</button></div>
        </form>
      </div>
    </div>`,
  );
}

function managersPage({ session, managers, load }) {
  const rows = managers.length
    ? `<table><thead><tr><th>Менеджер</th><th>Контакт</th><th class="r">Клиентов</th><th>Статус</th><th></th></tr></thead><tbody>${managers
        .map(
          (
            m,
          ) => `<tr><td><div class="who"><span class="ava">${icon("manager")}</span><b>${esc(m.name)}</b></div></td>
          <td class="muted">${esc(m.contact ?? "—")}</td><td class="num r">${load.get(m.id) ?? 0}</td>
          <td>${m.active ? `<span class="badge paid">Работает</span>` : `<span class="badge">Не работает</span>`}</td>
          <td class="r"><a class="btn soft sm" href="/managers/${m.id}">Изменить</a></td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">Менеджеров пока нет.</p>`;
  return page(
    session,
    "/managers",
    "Менеджеры",
    `${head("Команда", "Персональные менеджеры")}
    <p class="lede">По тарифу «Оператор» у клиента свой менеджер. Назначается в карточке аккаунта. Каждое изменение — с подтверждением.</p>
    ${rows}
    <form class="panel form sec" method="post" action="/managers">${hidden(session)}
      <h2>Добавить менеджера</h2>
      <div class="row"><label>Имя<input name="name" required maxlength="120"></label><label>Контакт<input name="contact" maxlength="200" placeholder="почта или телефон"></label></div>
      <div class="actions"><button>${icon("plus")}Добавить</button></div>
    </form>`,
  );
}

function managerEdit({ session, manager: m }) {
  return page(
    session,
    "/managers",
    m.name,
    `<a class="back" href="/managers">${icon("back", 16)}Менеджеры</a>
    ${head(`Менеджер #${m.id}`, m.name)}
    <form class="form" method="post" action="/managers/${m.id}">${hidden(session)}
      <div class="row"><label>Имя<input name="name" maxlength="120" value="${esc(m.name)}"></label><label>Контакт<input name="contact" maxlength="200" value="${esc(m.contact)}"></label></div>
      <label class="check"><input type="checkbox" name="active"${m.active ? " checked" : ""}> Работает</label>
      <div class="actions"><button>Сохранить</button><a class="btn soft" href="/managers">Отмена</a></div>
    </form>`,
  );
}

function settingsPage({ session, admin, sessions, now, error, done }) {
  return page(
    session,
    "/settings",
    "Вход и защита",
    `${head("Команда", "Вход и защита")}
    <div class="split">
      <form class="form" method="post" action="/settings/password">${hidden(session)}
        <h2>Сменить пароль</h2>
        ${errorBox(error)}${done ? `<p class="ok">Пароль сменён, остальные входы закрыты.</p>` : ""}
        <p class="hint">Почта: ${esc(admin.email)}. Нужны текущий пароль и код из приложения.</p>
        <label>Текущий пароль<input name="current" type="password" autocomplete="current-password" required></label>
        <div class="row">
          <label>Новый пароль<input name="next" type="password" autocomplete="new-password" minlength="12" required></label>
          <label>Ещё раз<input name="next2" type="password" autocomplete="new-password" minlength="12" required></label>
        </div>
        <label>Код из приложения<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
        <div class="actions"><button>Сменить пароль</button></div>
      </form>
      <section>
        <h2>Где вы вошли</h2>
        <table><thead><tr><th>Вход</th><th>Последнее действие</th><th>Кончится</th></tr></thead><tbody>${sessions
          .map(
            (x) =>
              `<tr><td class="num">${when(x.created_at)}${x.token_hash === session.tokenHash ? ` <span class="badge paid">это вы</span>` : ""}</td><td class="num">${when(x.seen_at)}</td><td class="num">${when(x.expires_at)}</td></tr>`,
          )
          .join("")}</tbody></table>
        ${
          sessions.length > 1
            ? `<form method="post" action="/settings/sessions" style="margin-top:14px">${hidden(session)}<button class="soft">Закрыть все, кроме этой</button></form>`
            : `<p class="hint" style="margin-top:14px">Других входов нет.</p>`
        }
        <p class="hint" style="margin-top:14px">Сессия живёт 12 часов и закрывается после часа без действий. Сейчас ${when(now)} по Москве.</p>
      </section>
    </div>`,
  );
}

module.exports = { loginPage, leadsList, leadPage, managersPage, managerEdit, settingsPage, LEAD };
