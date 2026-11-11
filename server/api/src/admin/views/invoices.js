/**
 * Счета: открытые к оплате и поиск по строке выписки, плюс блок в карточке
 * аккаунта. «Оплачено» — одна кнопка: срок продлевается сам (`invoices.js`).
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const b = require("./base");
const { STATUS_TITLES } = require("../invoices");

const { esc, day, money, hidden, errorBox } = b;

function payButtons(session, i, back) {
  if (i.status !== "issued") return "";
  return `<form method="post" action="/invoices/${i.id}/paid" style="display:inline">${hidden(session)}<input type="hidden" name="back" value="${back}"><button class="sm">Оплачено</button></form>
    <form method="post" action="/invoices/${i.id}/cancel" style="display:inline">${hidden(session)}<input type="hidden" name="back" value="${back}"><button class="ghost sm">Отменить</button></form>`;
}

function invoicesPage({ session, rows, q, ready, error }) {
  const list = rows.length
    ? `<table><thead><tr><th>Счёт</th><th>Склад</th><th class="r">Сумма</th><th>Срок</th><th>Оплатить до</th><th>Письмо</th><th></th></tr></thead><tbody>${rows
        .map(
          (i) =>
            `<tr><td class="num">${esc(i.number)}</td><td><a href="/accounts/${i.account_id}">${esc(i.account_name)}</a></td><td class="num r">${money(i.amount)}</td><td>${i.months} мес.</td><td class="num">${day(i.due_at)}</td><td class="muted">${i.sent_at ? day(i.sent_at) : "не ушло"}</td><td>${payButtons(session, i, "list")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="muted">${q ? "Открытых счетов с такими данными нет." : "Неоплаченных счетов нет."}</p>`;
  return b.layout({
    title: "Счета",
    session,
    active: "/invoices",
    badges: session.badges,
    body: `<div class="head"><h1>Счета</h1></div>
    ${
      ready
        ? ""
        : `<div class="card notice" style="margin-bottom:16px"><strong>Счета сами не выставляются</strong><p class="muted">На сервере не заданы реквизиты получателя (PAYEE_* в deploy/.env).</p></div>`
    }
    ${errorBox(error)}
    <form class="actions" method="get" action="/invoices">
      <input name="q" value="${esc(q)}" maxlength="100" placeholder="Номер счёта, сумма или склад из выписки" style="flex:1">
      <button class="ghost">Найти</button>
    </form>
    <section style="margin-top:16px">${list}</section>`,
  });
}

function invoicesCard(session, a, invoices) {
  const list = invoices.length
    ? `<table><thead><tr><th>Счёт</th><th class="r">Сумма</th><th>До</th><th>Статус</th><th></th></tr></thead><tbody>${invoices
        .map(
          (i) =>
            `<tr><td class="num">${esc(i.number)}</td><td class="num r">${money(i.amount)}</td><td class="num">${day(i.due_at)}</td><td>${STATUS_TITLES[i.status]}</td><td>${payButtons(session, i, "account")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="muted">Счетов пока не было. Первый выставится сам за 7 дней до конца срока.</p>`;
  const canIssue = a.kind === "warehouse" && !invoices.some((i) => i.status === "issued");
  return `<div class="card stack">
    <h2>Счета</h2>${list}
    ${
      canIssue
        ? `<form class="actions" method="post" action="/accounts/${a.id}/invoice">${hidden(session)}<button class="ghost">Выставить счёт сейчас</button></form>`
        : ""
    }
  </div>`;
}

module.exports = { invoicesPage, invoicesCard };
