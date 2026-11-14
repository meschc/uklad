/**
 * Общее для всех страниц админки: каркас с боковым меню, экранирование,
 * даты по Москве, деньги и стили.
 *
 * Страницы рисует сервер строкой: ни React, ни одного скрипта — CSP их
 * запрещает, и подменить страницу внедрённым кодом нечем. Всё, что пришло из
 * базы или формы, проходит через `esc`.
 */
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { icon } = require("./icons");
const { CSS } = require("./styles");

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

/**
 * Меню по смыслу, а не списком: деньги и люди — то, чем руководят каждый
 * день, ниже — каналы, откуда люди приходят, и служебное.
 */
const NAV = [
  [
    "",
    [
      ["/", "Обзор", "overview"],
      ["/money", "Деньги", "money"],
      ["/invoices", "Счета", "money"],
    ],
  ],
  [
    "Клиенты",
    [
      ["/leads", "Заявки", "leads"],
      ["/accounts", "Пользователи", "users"],
      ["/demos", "Демо-ссылки", "link"],
      ["/support", "Поддержка", "support"],
    ],
  ],
  [
    "Команда",
    [
      ["/managers", "Менеджеры", "manager"],
      ["/audit", "Журнал", "audit"],
      ["/settings", "Вход и защита", "shield"],
    ],
  ],
];

/**
 * Марка одним местом — как `UkladLockup` кабинета. Сменится логотип или
 * название — правится здесь и файл `assets/logo.svg`.
 */
const BRAND = { name: "Уклад", sub: "админка", logo: "/logo.svg" };
const lockup = () =>
  `<a class="logo" href="/"><img src="${BRAND.logo}" width="36" height="36" alt=""><span>${BRAND.name}<small>${BRAND.sub}</small></span></a>`;

const hidden = (session) => `<input type="hidden" name="csrf" value="${esc(session.csrf)}">`;
/**
 * Ошибка формы — тот же вид, что `FormError` кабинета: значок и текст у
 * кнопки, без плашки.
 */
const errorBox = (error) =>
  error ? `<p class="error" role="alert">${icon("alert", 16)}<span>${esc(error)}</span></p>` : "";

/**
 * Уведомление после действия — как тост кабинета (`components/Toaster`):
 * справа внизу, в цвет темы, тон — значком. Скриптов нет (CSP), поэтому
 * уходит само на CSS, наведение ставит паузу, крестик — ссылка на ту же
 * страницу. Текст — только из этого списка: в куку кладётся код, не строка.
 */
const FLASH = {
  account_created: ["success", "Пользователь создан, письмо со ссылкой на вход отправлено."],
  saved: ["success", "Сохранено."],
  invoice_saved: ["success", "Счёт сохранён."],
  support_saved: ["success", "Статус обращения сохранён."],
  lead_saved: ["success", "Заявка сохранена."],
  lead_archived: ["success", "Заявка в архиве. Вернуть — во вкладке «Архив»."],
  lead_restored: ["success", "Заявка возвращена из архива."],
  lead_deleted: ["success", "Заявка удалена."],
  demo_issued: ["success", "Демо-ссылка выдана."],
  demo_revoked: ["success", "Демо-ссылка отозвана."],
  manager_added: ["success", "Менеджер добавлен."],
  manager_saved: ["success", "Менеджер сохранён."],
  password_changed: ["success", "Пароль сменён, остальные входы закрыты."],
  sessions_closed: ["success", "Остальные входы закрыты."],
};
const FLASH_ICON = { success: "check", error: "alert" };
function toast(code, path) {
  const f = FLASH[code];
  if (!f) return "";
  const [tone, text] = f;
  return `<div class="toast ${tone}" role="${tone === "error" ? "alert" : "status"}">${icon(FLASH_ICON[tone], 16)}<span>${esc(text)}</span><a class="toast-x" href="${esc(path)}" aria-label="Закрыть уведомление">×</a></div>`;
}
const opt = (value, label, current) =>
  `<option value="${esc(value)}"${String(current ?? "") === String(value) ? " selected" : ""}>${esc(label)}</option>`;

function layout({ title, body, session, active, badges = {} }) {
  const nav = session
    ? `<aside class="side">
        ${lockup()}
        <nav>${NAV.map(
          ([group, items]) =>
            `${group ? `<span class="group">${group}</span>` : ""}${items
              .map(
                ([href, label, ico]) =>
                  `<a href="${href}" class="${active === href ? "on" : ""}">${icon(ico)}<span>${label}</span>${
                    badges[href] ? `<b>${badges[href]}</b>` : ""
                  }</a>`,
              )
              .join("")}`,
        ).join("")}</nav>
        <form method="post" action="/logout">${hidden(session)}<button class="quiet">${icon("logout")}<span>Выйти</span></button></form>
      </aside>`
    : "";
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · ${BRAND.name} админка</title>
<link rel="icon" href="${BRAND.logo}">
<link rel="stylesheet" href="/admin.css">
</head><body class="${session ? "app" : "bare"}">${nav}<main>${body}</main></body></html>`;
}

/** Заголовок страницы: надзаголовок-раздел, название, справа — действия. */
const head = (eyebrow, title, extra = "") =>
  `<header class="head"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1></div><span class="grow"></span>${extra}</header>`;

/** Число крупно с подписью — плитка обзора. `tone` красит число, не плитку. */
const stat = (label, value, { href, tone, ico } = {}) => {
  const inner = `<span class="stat-l">${ico ? icon(ico, 16) : ""}${label}</span><b class="${tone ?? ""}">${value}</b>`;
  return href ? `<a class="stat" href="${href}">${inner}</a>` : `<div class="stat">${inner}</div>`;
};

/**
 * Шаг подтверждения для действий, которые не хочется сделать случайно:
 * страница пересказывает, что будет, и несёт поля формы дальше скрытыми.
 * Скриптов нет (CSP), поэтому подтверждение — вторая форма, а не `confirm()`.
 */
function confirmPage({ session, active, eyebrow, title, lines, action, form, back, danger }) {
  const fields = [...form]
    .filter(([k]) => k !== "csrf" && k !== "confirmed")
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  return layout({
    title,
    session,
    active,
    badges: session.badges,
    body: `${head(eyebrow, title)}
    <form class="confirm" method="post" action="${esc(action)}">${hidden(session)}${fields}
      <input type="hidden" name="confirmed" value="1">
      <dl>${lines.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || "—")}</dd>`).join("")}</dl>
      <div class="actions"><button class="${danger ? "danger" : ""}">${icon("check")}Подтвердить</button><a class="btn soft" href="${esc(back)}">Отмена</a></div>
    </form>`,
  });
}

module.exports = {
  esc,
  when,
  day,
  dateInput,
  daysLeft,
  money,
  layout,
  hidden,
  errorBox,
  FLASH,
  toast,
  opt,
  head,
  stat,
  icon,
  confirmPage,
  BRAND,
  CSS,
};
