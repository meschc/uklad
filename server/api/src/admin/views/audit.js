/** Журнал действий: подписи действий, таблица и страница с отбором. */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const b = require("./base");

const { esc, when } = b;

const ACTION = {
  owner_created: "Создан владелец",
  owner_unlocked: "Снята блокировка входа",
  login: "Вход",
  login_failed: "Неудачный вход",
  login_locked: "Вход заблокирован",
  logout: "Выход",
  password_change: "Смена пароля",
  password_change_failed: "Неудачная смена пароля",
  sessions_close: "Закрыты другие сессии",
  account_create: "Добавлен аккаунт",
  account_edit: "Изменены контакты",
  account_tariff: "Изменён тариф",
  account_extend: "Оплата и продление",
  account_trial: "Продлён пробный период",
  account_features: "Изменены функции и лимиты",
  account_block: "Блокировка",
  account_unblock: "Разблокировка",
  account_archive: "В архив",
  account_restore: "Из архива",
  access_reset: "Сброс доступа",
  lead_update: "Заявка обновлена",
  manager_create: "Добавлен менеджер",
  manager_edit: "Изменён менеджер",
};

function targetLink(target) {
  const m = /^(account|lead|manager):(\d+)$/.exec(target ?? "");
  if (!m) return esc(target ?? "");
  if (m[1] === "manager") return `<a href="/managers">менеджер #${m[2]}</a>`;
  const href = m[1] === "account" ? "/accounts/" : "/leads/";
  const label = m[1] === "account" ? "аккаунт" : "заявка";
  return `<a href="${href}${m[2]}">${label} #${m[2]}</a>`;
}

function detailText(raw) {
  if (!raw) return "";
  try {
    const d = JSON.parse(raw);
    return Object.entries(d)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
  } catch {
    return raw;
  }
}

function rows(list) {
  if (!list.length) return `<p class="empty">Пусто</p>`;
  return `<table><thead><tr><th>Когда</th><th>Действие</th><th>Что</th><th>Подробности</th></tr></thead><tbody>${list
    .map(
      (r) => `<tr><td class="num">${when(r.at)}</td><td>${esc(ACTION[r.action] ?? r.action)}</td>
        <td>${targetLink(r.target)}</td><td class="muted">${esc(detailText(r.detail))}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function mini(list) {
  if (!list.length) return `<p class="empty">Пусто</p>`;
  return `<table><tbody>${list
    .map(
      (r) =>
        `<tr><td class="num small">${when(r.at)}</td><td>${esc(ACTION[r.action] ?? r.action)}</td><td>${targetLink(r.target)}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function auditPage({ session, audit, action }) {
  return b.layout({
    title: "Журнал",
    session,
    active: "/audit",
    badges: session.badges,
    body: `<div class="head"><h1>Журнал действий</h1><span class="count">${audit.length}</span></div>
    <p class="muted">Каждый вход и каждое изменение в админке. Записи нельзя исправить или стереть.</p>
    <div class="bar"><form method="get" action="/audit">
      <select name="action">${b.opt("", "Все действия", action)}${Object.entries(ACTION)
        .map(([k, v]) => b.opt(k, v, action))
        .join("")}</select>
      <button class="ghost">Показать</button>
    </form></div>
    ${rows(audit)}`,
  });
}

module.exports = { ACTION, rows, mini, auditPage, targetLink };
