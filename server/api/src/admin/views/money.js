/**
 * Деньги отдельно от людей (Кирилл 2.11): сколько приходит, кто должен,
 * у кого кончается пробный или оплаченный срок, все оплаты подряд.
 *
 * Онлайн-оплаты пока нет: клиент платит по счёту, оплату записывают в
 * карточке аккаунта («Записать и продлить»). Экран честно это говорит.
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const plans = require("../plans");
const b = require("./base");
const { shortTable } = require("./accounts");

const { esc, day, money, head, stat } = b;

function moneyPage({
  session,
  rows,
  payments,
  revenue30,
  revenue365,
  trialsEnding,
  paidEnding,
  overdue,
  now,
}) {
  const live = rows.filter((a) => a.state !== "archived");
  const paid = live.filter((a) => a.state === "paid");
  const mrr = paid.reduce((s, a) => s + (a.price ?? 0), 0);
  const owed = overdue.reduce((s, a) => s + (a.price ?? 0), 0);
  const soon = paidEnding.reduce((s, a) => s + (a.price ?? 0), 0);
  const list = payments.length
    ? `<table><thead><tr><th>Когда</th><th>Кто</th><th>Срок</th><th class="r">Сумма</th><th>Оплачено до</th><th>Заметка</th></tr></thead><tbody>${payments
        .map(
          (p) =>
            `<tr><td class="num">${day(p.at)}</td><td><a href="/accounts/${p.account_id}">${esc(p.account_name)}</a></td><td>${p.months} мес.</td><td class="num r">${money(p.amount)}</td><td class="num">${day(p.paid_until)}</td><td class="muted">${esc(p.note ?? "")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">Оплат пока не было.</p>`;
  return b.layout({
    title: "Деньги",
    session,
    active: "/money",
    badges: session.badges,
    body: `${head("Деньги", "Деньги")}
    <div class="note warn"><strong>Онлайн-оплата не подключена</strong>
      <p>Пришедший с сайта получает пробный период ${plans.TRIAL_MONTHS} мес. Когда он кончится, аккаунт станет «Не оплачен» и появится ниже. Счёт выставляете вы, оплату записываете в карточке клиента.</p></div>
    <div class="stats">
      ${stat("В месяц по тарифам", money(mrr), { tone: "ok", ico: "money" })}
      ${stat("Пришло за 30 дней", money(revenue30), { ico: "check" })}
      ${stat("Ждём оплаты", money(owed), { tone: owed ? "warn" : "", ico: "alert" })}
      ${stat("Продлить за 14 дней", money(soon), { ico: "calendar" })}
    </div>
    <div class="split">
      <section><h2>Не оплатили · ${overdue.length}</h2>${shortTable(overdue, now, "paid_until", "Все оплатили.")}</section>
      <section><h2>Оплата кончается за 14 дней</h2>${shortTable(paidEnding, now, "paid_until", "Ни у кого.")}</section>
    </div>
    <div class="split sec">
      <section><h2>Пробный кончается за 14 дней</h2>${shortTable(trialsEnding, now, "trial_until", "Ни у кого.")}</section>
      <section><h2>За год</h2><p class="stat" style="background:none;padding:0"><b>${money(revenue365)}</b></p>
        <p class="hint">Платят ${paid.length} из ${live.length} действующих.</p></section>
    </div>
    <section class="sec"><h2>Все оплаты</h2>${list}</section>`,
  });
}

module.exports = { moneyPage };
