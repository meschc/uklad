/**
 * Демо-ссылки: выдать именную из админки и смотреть, что по ней делали.
 *
 * Именная ссылка — для созвона: Кирилл пишет, для кого она, и сразу
 * отправляет человеку. По каждой ссылке видно: открыли или нет, когда,
 * с каких устройств, сколько разных браузеров (≈ людей), какие экраны
 * смотрели, куда нажимали и сколько пробыли. IP и введённое не храним.
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const b = require("./base");

const { esc, when, day, hidden, errorBox, head, stat, icon } = b;
/** Кабинет шлёт «пульс» раз в 15 секунд, пока вкладка на виду. */
const BEAT_SEC = 15;
const VISIT_GAP_MS = 30 * 60_000;

/** Экраны кабинета по-человечески: в событиях приходит ключ `appView`. */
const VIEW = {
  login: "Вход",
  dashboard: "Главная",
  editor: "План склада",
  table: "Товары",
  profile: "Профиль",
  receiving: "Приёмка",
  labels: "Ярлыки",
  documents: "Документы",
  lookup: "Что это?",
  integrations: "Интеграции",
  tasks: "Задания",
  picking: "Сборка",
  operations: "Операции",
  staff: "Персонал",
  analytics: "Аналитика",
  spec: "Паспорт склада",
  seller: "Кабинет продавца",
  chat: "Чат",
  workstation: "Рабочее место",
  devices: "Устройства",
  disputes: "Споры",
  personal: "Личное",
  company: "Компания",
};
const viewName = (k) => VIEW[k] ?? k;

const state = (d, now) =>
  d.revoked_at
    ? `<span class="badge blocked">Отозвана</span>`
    : d.expires_at < now
      ? `<span class="badge">Истекла</span>`
      : d.opens
        ? `<span class="badge paid">Открывали</span>`
        : `<span class="badge new">Не открывали</span>`;

const minutes = (sec) =>
  sec < 60
    ? `${sec} с`
    : sec < 3600
      ? `${Math.round(sec / 60)} мин`
      : `${(sec / 3600).toFixed(1).replace(".", ",")} ч`;

/**
 * Люди считаются по событиям, а события пишутся с 11.11 (PR #109). Переходы
 * до этого есть только счётчиком — для них честнее «—», чем ноль.
 */
const peopleCell = (d) => (d.people ? d.people : d.opens ? "—" : 0);

function demosList({ session, demos, now, error, days }) {
  const body = demos.length
    ? `<table><thead><tr><th>Для кого</th><th>Состояние</th><th class="r">Открытий</th><th class="r">Людей</th><th>Последний раз</th><th>Работает до</th></tr></thead><tbody>${demos
        .map(
          (
            d,
          ) => `<tr><td><a href="/demos/${d.id}">${esc(d.label || d.email || `Ссылка #${d.id}`)}</a>
            <div class="muted small">${d.label && d.email ? esc(d.email) : d.lead_id ? `по заявке #${d.lead_id}` : d.issued_by ? "выдана из админки" : ""}</div></td>
          <td>${state(d, now)}</td><td class="num r">${d.opens}</td><td class="num r">${peopleCell(d)}</td>
          <td class="num muted">${when(d.last_at || d.opened_at)}</td><td class="num">${day(d.expires_at)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">Демо-ссылок пока не выдавали.</p>`;
  return b.layout({
    title: "Демо-ссылки",
    session,
    active: "/demos",
    badges: session.badges,
    body: `${head("Клиенты", `Демо-ссылки · ${demos.length}`)}
    <form class="panel form mb" method="post" action="/demos">${hidden(session)}
      <h2>Выдать ссылку</h2>
      ${errorBox(error)}
      <div class="row3">
        <label>Для кого<input name="label" required maxlength="80" placeholder="Например: Склад «Север», Ольга"></label>
        <label>Почта, если есть<input name="email" type="email" maxlength="200"></label>
        <label>Сколько дней работает<input name="days" inputmode="numeric" pattern="[0-9]{1,2}" value="${days}"></label>
      </div>
      <div class="actions"><button>${icon("link")}Выдать ссылку</button></div>
    </form>
    ${body}`,
  });
}

/** События → визиты: один браузер и перерыв не больше получаса. */
function visitsOf(events) {
  const asc = [...events].reverse();
  const last = new Map();
  const visits = [];
  for (const e of asc) {
    const prev = last.get(e.visitor);
    if (!prev || Date.parse(e.at) - Date.parse(prev.end) > VISIT_GAP_MS) {
      const v = { visitor: e.visitor, device: e.device, start: e.at, end: e.at, events: [] };
      visits.push(v);
      last.set(e.visitor, v);
    }
    const v = last.get(e.visitor);
    v.end = e.at;
    v.events.push(e);
  }
  return visits.reverse();
}

const EV = {
  open: ["link", "Перешёл по ссылке"],
  start: ["monitor", "Открыл кабинет"],
  view: ["eye", "Экран"],
  click: ["click", "Нажал"],
  leave: ["logout", "Ушёл"],
};

function demoPage({ session, demo: d, link, events, now }) {
  const people = new Set(events.map((e) => e.visitor)).size;
  const devices = new Map();
  for (const e of events) if (e.device) devices.set(e.device, (devices.get(e.device) ?? 0) + 1);
  const deviceVisitors = new Map();
  for (const e of events) {
    if (!deviceVisitors.has(e.device)) deviceVisitors.set(e.device, new Set());
    deviceVisitors.get(e.device).add(e.visitor);
  }
  const active = events.filter((e) => e.kind === "beat").length * BEAT_SEC;
  const views = new Map();
  for (const e of events) if (e.kind === "view") views.set(e.what, (views.get(e.what) ?? 0) + 1);
  const viewTime = new Map();
  for (const e of events)
    if (e.kind === "beat" && e.what) viewTime.set(e.what, (viewTime.get(e.what) ?? 0) + BEAT_SEC);
  const topViews = [...new Set([...views.keys(), ...viewTime.keys()])]
    .map((k) => ({ k, n: views.get(k) ?? 0, t: viewTime.get(k) ?? 0 }))
    .sort((a, b2) => b2.t - a.t || b2.n - a.n)
    .slice(0, 12);
  const maxT = Math.max(1, ...topViews.map((v) => v.t));
  const clicks = events.filter((e) => e.kind === "click").length;
  const visits = visitsOf(events);
  const live = !d.revoked_at && d.expires_at >= now;

  const timeline = visits.length
    ? visits
        .slice(0, 30)
        .map(
          (
            v,
          ) => `<div class="visit">${when(v.start)} · ${esc(v.device || "устройство не определено")} <span class="muted small">· посетитель ${esc(v.visitor.slice(0, 4))}</span></div>
          ${v.events
            .filter((e) => e.kind !== "beat")
            .map((e) => {
              const [ico, label] = EV[e.kind] ?? ["clock", e.kind];
              return `<div class="ev"><span class="num muted small">${new Date(e.at).toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow" })}</span>${icon(ico, 16)}<span>${label}${e.what ? ` · <b>${esc(["view", "leave"].includes(e.kind) ? viewName(e.what) : e.what)}</b>` : ""}</span></div>`;
            })
            .join("")}`,
        )
        .join("")
    : `<p class="empty">По ссылке ещё не переходили.</p>`;

  return b.layout({
    title: d.label || "Демо-ссылка",
    session,
    active: "/demos",
    badges: session.badges,
    body: `<a class="back" href="/demos">${icon("back", 16)}Демо-ссылки</a>
    ${head(`Демо · выдана ${when(d.created_at)}`, d.label || d.email || `Ссылка #${d.id}`, state(d, now))}
    ${
      live
        ? `<div class="note"><strong>Ссылка для человека</strong><p>Работает до ${day(d.expires_at)}. Отправьте её сами — в мессенджер или почтой.</p><code class="copy">${esc(link)}</code></div>`
        : ""
    }
    ${
      d.opens && !events.length
        ? `<div class="note warn"><strong>Подробностей нет</strong><p>Ссылку открывали до того, как админка начала записывать шаги (11.11). Видно только число переходов и первый переход. Новые открытия запишутся полностью.</p></div>`
        : ""
    }
    <div class="stats">
      ${stat("Открытий", d.opens, { ico: "link" })}
      ${stat("Людей", people || (d.opens ? "—" : 0), { ico: "users", tone: people > 1 ? "primary" : "" })}
      ${stat("Пробыли на экране", minutes(active), { ico: "clock" })}
      ${stat("Нажатий", clicks, { ico: "click" })}
    </div>
    <div class="split">
      <section><h2>Что смотрели</h2>${
        topViews.length
          ? `<div class="bars">${topViews
              .map(
                (v) =>
                  `<div class="b"><span>${esc(viewName(v.k))}</span><i class="w${Math.max(1, Math.round((v.t / maxT) * 20)) * 5}"></i><span class="num muted small r">${minutes(v.t)}</span></div>`,
              )
              .join("")}</div>`
          : `<p class="empty">Пока ничего.</p>`
      }</section>
      <section><h2>Устройства</h2>${
        devices.size
          ? `<table><tbody>${[...devices.keys()]
              .map(
                (k) =>
                  `<tr><td><div class="who"><span class="ava">${icon(/телефон|планшет/.test(k) ? "phone" : "monitor")}</span>${esc(k)}</div></td><td class="num r muted">${deviceVisitors.get(k).size} чел.</td></tr>`,
              )
              .join("")}</tbody></table>`
          : `<p class="empty">Пока ничего.</p>`
      }
      <dl class="sec small"><dt>Первый переход</dt><dd>${when(d.opened_at)}</dd><dt>Почта</dt><dd>${esc(d.email || "—")}</dd><dt>Заявка</dt><dd>${d.lead_id ? `<a href="/leads/${d.lead_id}">#${d.lead_id}</a>` : "—"}</dd></dl>
      ${
        live
          ? `<form method="post" action="/demos/${d.id}/revoke" class="sec">${hidden(session)}<button class="soft">${icon("ban")}Отозвать ссылку</button></form>`
          : ""
      }
      </section>
    </div>
    <section class="sec"><h2>По шагам</h2><div class="timeline">${timeline}</div></section>`,
  });
}

module.exports = { demosList, demoPage, visitsOf };
