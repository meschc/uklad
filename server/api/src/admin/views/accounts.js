/**
 * Обзор и пользователи: сводка, список с фильтрами, новый аккаунт и полная
 * карточка — контакты, тариф и оплата, функции и лимиты, доступ, журнал.
 */
/* global require, module, URLSearchParams */
/* eslint-disable @typescript-eslint/no-require-imports */
const plans = require("../plans");
const b = require("./base");
const audit = require("./audit");

const { esc, when, day, money, hidden, errorBox, opt } = b;
const KIND = { warehouse: "Склад", seller: "Селлер" };
const badge = (state) => `<span class="badge ${state}">${plans.STATE_TITLES[state]}</span>`;
const page = (session, active, title, body) =>
  b.layout({ title, session, active, body, badges: session.badges });

/** Подпись срока: «21.01.2027 · 92 дн.» или «истёк 3 дн. назад». */
function term(iso, nowIso) {
  if (!iso) return "—";
  const left = b.daysLeft(iso, nowIso);
  const tail = left >= 0 ? `${left} дн.` : `истёк ${-left} дн. назад`;
  return `${day(iso)} <span class="muted small">· ${tail}</span>`;
}

function accountTable(rows, nowIso, empty) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  return `<table><thead><tr><th>Название</th><th>Тип</th><th>Тариф</th><th>Состояние</th><th>Срок</th><th class="r">Цена</th><th>Последний вход</th></tr></thead><tbody>${rows
    .map((a) => {
      const until = a.state === "trial" ? a.trial_until : a.paid_until;
      return `<tr>
        <td><a href="/accounts/${a.id}">${esc(a.name)}</a><div class="muted small">${esc(a.email)}</div></td>
        <td>${KIND[a.kind]}</td>
        <td>${esc(plans.PLANS[a.tariff]?.title ?? a.tariff)}</td>
        <td>${badge(a.state)}</td>
        <td class="num">${term(until, nowIso)}</td>
        <td class="num r">${money(a.price)}</td>
        <td class="num">${when(a.last_login_at)}</td>
      </tr>`;
    })
    .join("")}</tbody></table>`;
}

/** Короткая таблица для узких колонок обзора. */
function shortTable(rows, nowIso, field, empty) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  return `<table><tbody>${rows
    .map(
      (a) =>
        `<tr><td><a href="/accounts/${a.id}">${esc(a.name)}</a><div class="muted small">${esc(
          plans.PLANS[a.tariff]?.title ?? a.tariff,
        )} · ${money(a.price)}</div></td><td class="num r">${term(a[field], nowIso)}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function dashboard({
  session,
  rows,
  trialsEnding,
  paidEnding,
  overdue,
  newLeads,
  revenue30,
  recent,
  now,
}) {
  const live = rows.filter((a) => a.state !== "archived");
  const count = (st) => live.filter((a) => a.state === st).length;
  const mrr = live.filter((a) => a.state === "paid").reduce((s, a) => s + (a.price ?? 0), 0);
  const tile = (href, label, value) =>
    `<a class="tile" href="${href}"><span>${label}</span><b>${value}</b></a>`;
  return page(
    session,
    "/",
    "Обзор",
    `<div class="head"><h1>Обзор</h1><span class="grow"></span><a class="btn" href="/accounts/new">Добавить аккаунт</a></div>
    <div class="tiles">
      ${tile("/accounts?kind=warehouse", "Склады", live.filter((a) => a.kind === "warehouse").length)}
      ${tile("/accounts?kind=seller", "Селлеры", live.filter((a) => a.kind === "seller").length)}
      ${tile("/accounts?state=trial", "На пробном периоде", count("trial"))}
      ${tile("/accounts?state=paid", "Платят", count("paid"))}
      ${tile("/accounts?state=overdue", "Не оплатили", count("overdue"))}
      ${tile("/accounts?state=blocked", "Заблокированы", count("blocked"))}
      ${tile("/leads?status=new", "Новые заявки", newLeads)}
      ${tile("/accounts?state=paid", "В месяц по тарифам", money(mrr))}
    </div>
    <div class="cols">
      <section class="card"><h2>Пробный период кончается за 14 дней</h2>${shortTable(trialsEnding, now, "trial_until", "Ни у кого.")}</section>
      <section class="card"><h2>Оплата кончается за 14 дней</h2>${shortTable(paidEnding, now, "paid_until", "Ни у кого.")}</section>
    </div>
    <div class="cols" style="margin-top:16px">
      <section class="card"><h2>Не оплатили</h2>${shortTable(overdue, now, "paid_until", "Все оплатили.")}</section>
      <section class="card"><h2>Последние действия</h2>
        <p class="muted small">Поступило за 30 дней: ${money(revenue30)}</p>
        ${audit.mini(recent)}
        <p><a class="btn ghost sm" href="/audit">Весь журнал</a></p>
      </section>
    </div>`,
  );
}

function accountsList({ session, rows, filter, now }) {
  const link = (patch) => {
    const p = new URLSearchParams({ ...filter, ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const qs = p.toString();
    return `/accounts${qs ? `?${qs}` : ""}`;
  };
  const tab = (key, value, label) =>
    `<a class="${filter[key] === value ? "on" : ""}" href="${esc(link({ [key]: value }))}">${label}</a>`;
  return page(
    session,
    "/accounts",
    "Пользователи",
    `<div class="head"><h1>Пользователи</h1><span class="count">${rows.length}</span><span class="grow"></span>
      <a class="btn" href="/accounts/new">Добавить</a></div>
    <div class="bar">
      <div class="seg">${tab("kind", "", "Все")}${tab("kind", "warehouse", "Склады")}${tab("kind", "seller", "Селлеры")}</div>
      <div class="seg">${tab("state", "", "Действующие")}${Object.entries(plans.STATE_TITLES)
        .map(([k, v]) => tab("state", k, v))
        .join("")}</div>
    </div>
    <div class="bar"><form method="get" action="/accounts">
      <input type="hidden" name="kind" value="${esc(filter.kind)}"><input type="hidden" name="state" value="${esc(filter.state)}">
      <select name="tariff">${opt("", "Любой тариф", filter.tariff)}${Object.entries(plans.PLANS)
        .map(([k, p]) => opt(k, p.title, filter.tariff))
        .join("")}</select>
      <input class="q" name="q" value="${esc(filter.q)}" placeholder="Название, почта, компания, ИНН, телефон, город">
      <button class="ghost">Найти</button>
    </form></div>
    ${accountTable(rows, now, "Никого не нашли.")}`,
  );
}

function profileFields(v) {
  return `
    <div class="row">
      <label>Тип<select name="kind">${opt("warehouse", "Склад", v.kind)}${opt("seller", "Селлер", v.kind)}</select></label>
      <label>Название<input name="name" required maxlength="120" value="${esc(v.name)}"></label>
    </div>
    <div class="row">
      <label>Почта для входа<input name="email" type="email" required maxlength="200" value="${esc(v.email)}"></label>
      <label>Контактное лицо<input name="contact_name" maxlength="120" value="${esc(v.contact_name)}"></label>
    </div>
    <div class="row3">
      <label>Телефон<input name="phone" maxlength="40" value="${esc(v.phone)}"></label>
      <label>Компания<input name="company" maxlength="200" value="${esc(v.company)}"></label>
      <label>ИНН<input name="inn" inputmode="numeric" maxlength="12" value="${esc(v.inn)}"></label>
    </div>
    <label>Город<input name="city" maxlength="80" value="${esc(v.city)}"></label>
    <label>Заметка для себя<textarea name="note" maxlength="2000">${esc(v.note)}</textarea></label>`;
}

function accountNew({ session, values, error }) {
  const v = { kind: "warehouse", tariff: "start", trial: "on", ...values };
  return page(
    session,
    "/accounts",
    "Новый аккаунт",
    `<a class="back" href="/accounts">← Пользователи</a>
    <div class="head"><h1>Новый аккаунт</h1></div>
    <form class="card form" method="post" action="/accounts" style="max-width:720px">
      ${errorBox(error)}${hidden(session)}
      ${profileFields(v)}
      <div class="row">
        <label>Тариф<select name="tariff">${Object.entries(plans.PLANS)
          .map(([k, p]) => opt(k, `${p.title}${p.price ? ` · ${money(p.price)}` : ""}`, v.tariff))
          .join("")}</select></label>
        <label class="check" style="align-self:end;height:36px"><input type="checkbox" name="trial"${
          v.trial === "on" ? " checked" : ""
        }> Пробный период ${plans.TRIAL_MONTHS} месяца</label>
      </div>
      <div class="actions"><button>Создать</button><a class="btn ghost" href="/accounts">Отмена</a></div>
    </form>`,
  );
}

function featuresForm(session, a, features, limits) {
  const rows = Object.entries(plans.FEATURES)
    .map(([key, label]) => {
      const f = features[key];
      const cur = f.override === null ? "plan" : f.override ? "on" : "off";
      return `<span>${f.on ? "✓" : `<span class="muted">—</span>`} ${esc(label)}</span>
        <select name="f_${key}" aria-label="${esc(label)}">${opt("plan", `Как в тарифе (${f.fromPlan ? "да" : "нет"})`, cur)}${opt("on", "Включить", cur)}${opt("off", "Выключить", cur)}</select>`;
    })
    .join("");
  const limitRows = Object.entries(plans.LIMITS)
    .map(([key, label]) => {
      const l = limits[key];
      const fromPlan = l.fromPlan === null ? "без ограничений" : l.fromPlan.toLocaleString("ru-RU");
      return `<label>${esc(label)} <span class="small">· в тарифе: ${fromPlan}</span>
        <input name="l_${key}" inputmode="numeric" placeholder="как в тарифе" value="${l.override ?? ""}"></label>`;
    })
    .join("");
  return `<form class="card form" method="post" action="/accounts/${a.id}/features">
    <h2>Функции и лимиты</h2>${hidden(session)}
    <p class="muted small">По умолчанию — как в тарифе. Можно включить функцию сверх тарифа или поднять лимит одному клиенту. Кабинет начнёт их соблюдать после переезда на сервер.</p>
    <div class="feat">${rows}</div>
    <div class="row">${limitRows}</div>
    <div class="actions"><button>Сохранить функции и лимиты</button></div>
  </form>`;
}

function tariffForm(session, a, managers) {
  const manager = managers.find((m) => m.id === a.manager_id);
  return `<form class="card form" method="post" action="/accounts/${a.id}/tariff">
    <h2>Тариф и оплата</h2>${hidden(session)}
    <div class="row">
      <label>Тариф<select name="tariff">${Object.entries(plans.PLANS)
        .map(([k, p]) => opt(k, p.title, a.tariff))
        .join("")}</select></label>
      <label>Период оплаты<select name="period">${Object.entries(plans.PERIODS)
        .map(([k, p]) => opt(k, p, a.period))
        .join("")}</select></label>
    </div>
    <div class="row">
      <label>Цена в месяц, ₽<input name="price" inputmode="numeric" value="${a.price ?? ""}" placeholder="по тарифу"></label>
      <label>Персональный менеджер<select name="manager_id">${opt(
        "",
        a.tariff === "operator" ? "Назначим при подключении" : "Нет",
        a.manager_id,
      )}${managers
        .filter((m) => m.active || m.id === a.manager_id)
        .map((m) => opt(m.id, m.name, a.manager_id))
        .join("")}</select></label>
    </div>
    <div class="row">
      <label>Пробный период до<input type="date" name="trial_until" value="${b.dateInput(a.trial_until)}"></label>
      <label>Оплачено до<input type="date" name="paid_until" value="${b.dateInput(a.paid_until)}"></label>
    </div>
    ${
      a.tariff === "operator" && !manager
        ? `<p class="muted small">У «Оператора» по тарифу персональный менеджер — назначьте его${
            managers.length ? "" : ` (сначала добавьте в разделе <a href="/managers">Менеджеры</a>)`
          }.</p>`
        : ""
    }
    <div class="actions"><button>Сохранить тариф</button></div>
  </form>`;
}

function paymentsCard(session, a, payments) {
  const list = payments.length
    ? `<table><thead><tr><th>Когда</th><th>Срок</th><th class="r">Сумма</th><th>До</th><th>Заметка</th></tr></thead><tbody>${payments
        .map(
          (p) =>
            `<tr><td class="num">${day(p.at)}</td><td>${p.months} мес.</td><td class="num r">${money(p.amount)}</td><td class="num">${day(p.paid_until)}</td><td class="muted">${esc(p.note ?? "")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="muted">Оплат пока не было.</p>`;
  return `<div class="card stack">
    <h2>Продлить</h2>
    <form class="form" method="post" action="/accounts/${a.id}/extend">${hidden(session)}
      <div class="row3">
        <label>Срок<select name="months">${opt(1, "1 месяц", 1)}${opt(3, "3 месяца")}${opt(6, "6 месяцев")}${opt(12, "12 месяцев")}</select></label>
        <label>Получено, ₽<input name="amount" inputmode="numeric" placeholder="${a.price ?? ""}"></label>
        <label>Заметка<input name="note" maxlength="200" placeholder="счёт №…"></label>
      </div>
      <div class="actions"><button>Записать оплату и продлить</button></div>
    </form>
    <form class="actions" method="post" action="/accounts/${a.id}/trial">${hidden(session)}
      <select name="months" style="width:auto">${opt(1, "+1 месяц")}${opt(3, "+3 месяца")}</select>
      <button class="ghost">Продлить пробный период</button>
    </form>
    <h3>Оплаты</h3>${list}
  </div>`;
}

function accessCards(session, a) {
  const blocked = a.status === "blocked";
  return `<div class="card stack">
      <h2>Доступ</h2>
      ${
        blocked
          ? `<p>Заблокирован${a.blocked_note ? `: ${esc(a.blocked_note)}` : ""}.</p>
             <form method="post" action="/accounts/${a.id}/unblock">${hidden(session)}<button>Разблокировать</button></form>`
          : `<form class="form" method="post" action="/accounts/${a.id}/block">${hidden(session)}
               <label>Причина блокировки<input name="note" maxlength="200" placeholder="Например: не оплатил"></label>
               <div class="actions"><button class="danger">Заблокировать</button></div></form>`
      }
      <form class="form" method="post" action="/accounts/${a.id}/reset">${hidden(session)}
        <p class="muted small">Старый пароль перестанет работать, человек задаст новый по ссылке.</p>
        <div class="actions"><button class="ghost">Сбросить доступ</button></div>
      </form>
    </div>
    <div class="card danger-zone stack">
      <h2>Архив</h2>
      ${
        a.archived_at
          ? `<p>В архиве с ${day(a.archived_at)}.</p><form method="post" action="/accounts/${a.id}/restore">${hidden(session)}<button class="ghost">Вернуть из архива</button></form>`
          : `<p class="muted small">Аккаунт пропадёт из списков, но данные и журнал останутся. Вернуть можно в любой момент.</p>
             <form class="form" method="post" action="/accounts/${a.id}/archive">${hidden(session)}
               <label>Впишите название, чтобы подтвердить<input name="confirm" maxlength="120" autocomplete="off"></label>
               <div class="actions"><button class="danger">Убрать в архив</button></div></form>`
      }
    </div>`;
}

function accountPage(o) {
  const { session, account: a, features, limits, managers, payments, now, error, resetLink } = o;
  return page(
    session,
    "/accounts",
    a.name,
    `<a class="back" href="/accounts">← Пользователи</a>
    <div class="head"><h1>${esc(a.name)}</h1>${badge(a.state)}<span class="muted">${KIND[a.kind]} · #${a.id}</span></div>
    ${error ? `<div class="card" style="margin-bottom:16px">${errorBox(error)}</div>` : ""}
    ${
      resetLink
        ? `<div class="card notice" style="margin-bottom:16px"><strong>Ссылка для нового пароля</strong>
           <p class="muted">Показываем один раз. Отправьте её человеку сами: работает 24 часа и гасит прежние. Заработает, когда кабинет переедет на сервер.</p>
           <code>${esc(resetLink)}</code></div>`
        : ""
    }
    <div class="tiles">
      <div class="tile"><span>Тариф</span><b>${esc(plans.PLANS[a.tariff]?.title ?? a.tariff)}</b></div>
      <div class="tile"><span>Цена в месяц · ${esc(plans.PERIODS[a.period] ?? "")}</span><b>${money(a.price)}</b></div>
      <div class="tile"><span>Пробный до</span><b class="num">${day(a.trial_until)}</b></div>
      <div class="tile"><span>Оплачено до</span><b class="num">${day(a.paid_until)}</b></div>
    </div>
    <div class="cols">
      <div class="stack">
        <form class="card form" method="post" action="/accounts/${a.id}/profile">
          <h2>Контакты</h2>${hidden(session)}${profileFields(a)}
          <dl><dt>Добавлен</dt><dd>${when(a.created_at)}</dd><dt>Изменён</dt><dd>${when(a.updated_at)}</dd><dt>Последний вход</dt><dd>${when(a.last_login_at)}</dd></dl>
          <div class="actions"><button>Сохранить контакты</button></div>
        </form>
        ${featuresForm(session, a, features, limits)}
      </div>
      <div class="stack">
        ${tariffForm(session, a, managers)}
        ${paymentsCard(session, a, payments)}
        ${accessCards(session, a)}
      </div>
    </div>
    <section style="margin-top:24px"><h2>Журнал по аккаунту</h2>${audit.rows(o.audit, now)}</section>`,
  );
}

module.exports = { dashboard, accountsList, accountNew, accountPage, KIND };
