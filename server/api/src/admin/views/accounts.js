/**
 * Обзор и пользователи: сводка, список с отбором, новый аккаунт и карточка —
 * контакты, тариф и оплата, функции и лимиты, доступ, журнал.
 */
/* global require, module, URLSearchParams */
/* eslint-disable @typescript-eslint/no-require-imports */
const plans = require("../plans");
const b = require("./base");
const audit = require("./audit");
const { invoicesCard } = require("./invoices");

const { esc, when, day, money, hidden, errorBox, opt, head, stat, icon } = b;
const KIND = { warehouse: "Склад", seller: "Селлер" };
const SOURCE = { admin: "Админка", lead: "Заявка", cabinet: "Сам в кабинете" };
const badge = (state) => `<span class="badge ${state}">${plans.STATE_TITLES[state]}</span>`;
const source = (a) => {
  const s = a.source || "admin";
  return `<span class="tag ${s === "cabinet" ? "cabinet" : s === "lead" ? "lead" : "admin"}">${SOURCE[s] ?? s}</span>`;
};
const page = (session, active, title, body) =>
  b.layout({ title, session, active, body, badges: session.badges });

/** Подпись срока: «21.01.2027 · 92 дн.» или «истёк 3 дн. назад». */
function term(iso, nowIso) {
  if (!iso) return "—";
  const left = b.daysLeft(iso, nowIso);
  const tail = left >= 0 ? `${left} дн.` : `истёк ${-left} дн. назад`;
  return `${day(iso)} <span class="muted small">· ${tail}</span>`;
}

/** Название с иконкой типа — склад или селлер видно без чтения. */
const who = (a) =>
  `<div class="who"><span class="ava">${icon(a.kind === "seller" ? "seller" : "warehouse")}</span><div><a href="/accounts/${a.id}">${esc(a.name)}</a><div class="muted small">${esc(a.email)}</div></div></div>`;

function accountTable(rows, nowIso, empty) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  return `<table><thead><tr><th>Название</th><th>Откуда</th><th>Тариф</th><th>Состояние</th><th>Срок</th><th class="r">В месяц</th><th>Последний вход</th></tr></thead><tbody>${rows
    .map((a) => {
      const until = a.state === "trial" ? a.trial_until : a.paid_until;
      return `<tr>
        <td>${who(a)}</td>
        <td>${source(a)}</td>
        <td>${esc(plans.PLANS[a.tariff]?.title ?? a.tariff)}</td>
        <td>${badge(a.state)}</td>
        <td class="num">${term(until, nowIso)}</td>
        <td class="num r">${money(a.price)}</td>
        <td class="num muted">${when(a.last_login_at)}</td>
      </tr>`;
    })
    .join("")}</tbody></table>`;
}

/** Короткий список для обзора и «Денег»: кто, сколько и до какого числа. */
function shortTable(rows, nowIso, field, empty) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  return `<table><tbody>${rows
    .map(
      (a) =>
        `<tr><td>${who(a)}</td><td class="num r">${money(a.price)}<div>${term(a[field], nowIso)}</div></td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function dashboard({ session, rows, trialsEnding, overdue, newLeads, revenue30, recent, now }) {
  const live = rows.filter((a) => a.state !== "archived");
  const count = (st) => live.filter((a) => a.state === st).length;
  const mrr = live.filter((a) => a.state === "paid").reduce((s, a) => s + (a.price ?? 0), 0);
  return page(
    session,
    "/",
    "Обзор",
    `${head("Уклад сегодня", "Обзор", `<a class="btn" href="/accounts/new">${icon("plus")}Добавить аккаунт</a>`)}
    <div class="stats">
      ${stat("Новые заявки", newLeads, { href: "/leads?status=new", tone: newLeads ? "primary" : "", ico: "leads" })}
      ${stat("На пробном", count("trial"), { href: "/accounts?state=trial", ico: "calendar" })}
      ${stat("Платят", count("paid"), { href: "/money", tone: "ok", ico: "check" })}
      ${stat("Не оплатили", count("overdue"), { href: "/money", tone: count("overdue") ? "warn" : "", ico: "alert" })}
    </div>
    <div class="stats">
      ${stat("В месяц по тарифам", money(mrr), { href: "/money", ico: "money" })}
      ${stat("Пришло за 30 дней", money(revenue30), { href: "/money", ico: "money" })}
      ${stat("Склады", live.filter((a) => a.kind === "warehouse").length, { href: "/accounts?kind=warehouse", ico: "warehouse" })}
      ${stat("Селлеры", live.filter((a) => a.kind === "seller").length, { href: "/accounts?kind=seller", ico: "seller" })}
    </div>
    <div class="split">
      <section>
        <div class="sec-head"><h2>Пробный кончается за 14 дней</h2></div>
        ${shortTable(trialsEnding, now, "trial_until", "Ни у кого.")}
        <div class="sec-head sec"><h2>Не оплатили</h2><span class="grow"></span><a class="btn soft sm" href="/money">Все деньги</a></div>
        ${shortTable(overdue, now, "paid_until", "Все оплатили.")}
      </section>
      <section>
        <div class="sec-head"><h2>Последние действия</h2><span class="grow"></span><a class="btn soft sm" href="/audit">Весь журнал</a></div>
        ${audit.mini(recent)}
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
    `${head("Клиенты", `Пользователи · ${rows.length}`, `<a class="btn" href="/accounts/new">${icon("plus")}Добавить</a>`)}
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
      <button class="soft">${icon("search")}Найти</button>
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
      <label>Телефон<input name="phone" type="tel" maxlength="40" value="${esc(v.phone)}"></label>
      <label>Компания<input name="company" maxlength="200" value="${esc(v.company)}"></label>
      <label>ИНН<input name="inn" inputmode="numeric" pattern="[0-9]{10}([0-9]{2})?" maxlength="12" value="${esc(v.inn)}"></label>
    </div>
    <label>Город<input name="city" maxlength="80" value="${esc(v.city)}"></label>
    <label>Заметка для себя<textarea name="note" maxlength="2000">${esc(v.note)}</textarea></label>`;
}

/**
 * Новый аккаунт. Из заявки приходит уже заполненным: имя, почта, телефон и
 * всё, что человек написал, — остаётся проверить и нажать «Создать».
 */
function accountNew({ session, values, error, lead }) {
  const v = { kind: "warehouse", tariff: "start", trial: "on", ...values };
  return page(
    session,
    lead ? "/leads" : "/accounts",
    "Новый аккаунт",
    `<a class="back" href="${lead ? `/leads/${lead.id}` : "/accounts"}">${icon("back", 16)}${lead ? `Заявка #${lead.id}` : "Пользователи"}</a>
    ${head(lead ? `Из заявки #${lead.id}` : "Клиенты", "Новый аккаунт")}
    ${lead ? `<div class="note"><strong>Подставили из заявки</strong><p>Проверьте название и почту: по почте человек будет входить.</p></div>` : ""}
    <form class="form" method="post" action="/accounts">
      ${errorBox(error)}${hidden(session)}
      ${lead ? `<input type="hidden" name="lead_id" value="${lead.id}">` : ""}
      ${profileFields(v)}
      <div class="row">
        <label>Тариф<select name="tariff">${Object.entries(plans.PLANS)
          .map(([k, p]) => opt(k, `${p.title}${p.price ? ` · ${money(p.price)}` : ""}`, v.tariff))
          .join("")}</select></label>
        <label class="check end"><input type="checkbox" name="trial"${
          v.trial === "on" ? " checked" : ""
        }> Пробный период ${plans.TRIAL_MONTHS} мес.</label>
      </div>
      <p class="hint">Спецусловия после созвона — в карточке: дата пробного периода и цена правятся вручную.</p>
      <div class="actions"><button>${icon("check")}Создать</button><a class="btn soft" href="/accounts">Отмена</a></div>
    </form>`,
  );
}

function featuresForm(session, a, features, limits) {
  const rows = Object.entries(plans.FEATURES)
    .map(([key, label]) => {
      const f = features[key];
      const cur = f.override === null ? "plan" : f.override ? "on" : "off";
      return `<span>${f.on ? `<span class="ok">✓</span>` : `<span class="muted">—</span>`} ${esc(label)}</span>
        <select name="f_${key}" aria-label="${esc(label)}">${opt("plan", `Как в тарифе (${f.fromPlan ? "да" : "нет"})`, cur)}${opt("on", "Включить", cur)}${opt("off", "Выключить", cur)}</select>`;
    })
    .join("");
  const limitRows = Object.entries(plans.LIMITS)
    .map(([key, label]) => {
      const l = limits[key];
      const fromPlan = l.fromPlan === null ? "без ограничений" : l.fromPlan.toLocaleString("ru-RU");
      return `<label>${esc(label)} · в тарифе ${fromPlan}
        <input name="l_${key}" inputmode="numeric" placeholder="как в тарифе" value="${l.override ?? ""}"></label>`;
    })
    .join("");
  return `<section class="sec"><h2>Функции и лимиты</h2>
    <form class="form" method="post" action="/accounts/${a.id}/features">${hidden(session)}
    <p class="hint">По умолчанию — как в тарифе. Можно включить функцию сверх тарифа или поднять лимит одному клиенту.</p>
    <div class="feat">${rows}</div>
    <div class="row">${limitRows}</div>
    <div class="actions"><button class="soft">Сохранить функции и лимиты</button></div>
  </form></section>`;
}

function tariffForm(session, a, managers) {
  const manager = managers.find((m) => m.id === a.manager_id);
  return `<form class="panel form" method="post" action="/accounts/${a.id}/tariff">
    <h2>Тариф и сроки</h2>${hidden(session)}
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
        ? `<p class="hint">У «Оператора» по тарифу персональный менеджер — назначьте его${
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
    : `<p class="empty">Оплат пока не было.</p>`;
  return `<section class="sec">
    <h2>Записать оплату</h2>
    <form class="form" method="post" action="/accounts/${a.id}/extend">${hidden(session)}
      <div class="row3">
        <label>Срок<select name="months">${opt(1, "1 месяц", 1)}${opt(3, "3 месяца")}${opt(6, "6 месяцев")}${opt(12, "12 месяцев")}</select></label>
        <label>Получено, ₽<input name="amount" inputmode="numeric" placeholder="${a.price ?? ""}"></label>
        <label>Заметка<input name="note" maxlength="200" placeholder="счёт №…"></label>
      </div>
      <div class="actions"><button>${icon("money")}Записать и продлить</button></div>
    </form>
    <form class="actions mt" method="post" action="/accounts/${a.id}/trial">${hidden(session)}
      <select name="months">${opt(1, "+1 месяц")}${opt(3, "+3 месяца")}</select>
      <button class="soft">Продлить пробный период</button>
    </form>
    <div class="sec"><h2>Оплаты</h2>${list}</div>
  </section>`;
}

function accessCards(session, a) {
  const blocked = a.status === "blocked";
  return `<section class="sec"><h2>Доступ</h2>
      ${
        blocked
          ? `<p>Заблокирован${a.blocked_note ? `: ${esc(a.blocked_note)}` : ""}.</p>
             <form method="post" action="/accounts/${a.id}/unblock">${hidden(session)}<button>Разблокировать</button></form>`
          : `<form class="form" method="post" action="/accounts/${a.id}/block">${hidden(session)}
               <label>Причина блокировки<input name="note" maxlength="200" placeholder="Например: не оплатил"></label>
               <div class="actions"><button class="danger">${icon("ban")}Заблокировать</button></div></form>`
      }
      <form class="form mt" method="post" action="/accounts/${a.id}/reset">${hidden(session)}
        <p class="hint">Старый пароль перестанет работать, человек задаст новый по ссылке.</p>
        <div class="actions"><button class="soft">Сбросить доступ</button></div>
      </form>
    </section>
    <section class="sec"><h2>Архив</h2>
      ${
        a.archived_at
          ? `<p>В архиве с ${day(a.archived_at)}.</p><form method="post" action="/accounts/${a.id}/restore">${hidden(session)}<button class="soft">Вернуть из архива</button></form>`
          : `<p class="hint">Аккаунт пропадёт из списков, но данные и журнал останутся.</p>
             <form class="form mt" method="post" action="/accounts/${a.id}/archive">${hidden(session)}
               <label>Впишите название, чтобы подтвердить<input name="confirm" maxlength="120" autocomplete="off"></label>
               <div class="actions"><button class="danger">Убрать в архив</button></div></form>`
      }
    </section>`;
}

function accountPage(o) {
  const { session, account: a, features, limits, managers, payments, now, error, resetLink } = o;
  const invoices = o.invoices ?? [];
  return page(
    session,
    "/accounts",
    a.name,
    `<a class="back" href="/accounts">${icon("back", 16)}Пользователи</a>
    ${head(`${KIND[a.kind]} · #${a.id}`, a.name, `${source(a)} ${badge(a.state)}`)}
    ${error ? `<div class="note warn">${errorBox(error)}</div>` : ""}
    ${
      resetLink
        ? `<div class="note"><strong>Ссылка для нового пароля</strong>
           <p>Показываем один раз. Отправьте её человеку сами: работает 24 часа и гасит прежние.</p>
           <code class="copy">${esc(resetLink)}</code></div>`
        : ""
    }
    <div class="stats">
      ${stat("Тариф", esc(plans.PLANS[a.tariff]?.title ?? a.tariff))}
      ${stat(`В месяц · ${esc(plans.PERIODS[a.period] ?? "")}`, money(a.price))}
      ${stat("Пробный до", day(a.trial_until), { tone: a.state === "trial" ? "primary" : "" })}
      ${stat("Оплачено до", day(a.paid_until), { tone: a.state === "overdue" ? "warn" : a.state === "paid" ? "ok" : "" })}
    </div>
    <div class="side-col">
      <div class="stack">
        <section><h2>Контакты</h2>
        <form class="form" method="post" action="/accounts/${a.id}/profile">${hidden(session)}${profileFields(a)}
          <div class="actions"><button class="soft">Сохранить контакты</button></div>
        </form>
        <dl class="sec small"><dt>Добавлен</dt><dd>${when(a.created_at)}</dd><dt>Изменён</dt><dd>${when(a.updated_at)}</dd><dt>Последний вход</dt><dd>${when(a.last_login_at)}</dd></dl>
        </section>
        ${featuresForm(session, a, features, limits)}
      </div>
      <div class="stack">
        ${tariffForm(session, a, managers)}
        ${invoicesCard(session, a, invoices)}
        ${paymentsCard(session, a, payments)}
        ${accessCards(session, a)}
      </div>
    </div>
    <section class="sec"><h2>Журнал по аккаунту</h2>${audit.rows(o.audit, now)}</section>`,
  );
}

module.exports = { dashboard, accountsList, accountNew, accountPage, shortTable, who, KIND };
