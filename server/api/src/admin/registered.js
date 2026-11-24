/**
 * Регистрация в кабинете → строка в «Пользователях» админки.
 *
 * Кабинет живёт в Postgres, админка — в SQLite рядом с заявками. Раньше
 * зарегистрированный сам по себе человек в админку не попадал вовсе (Кирилл
 * 2.11: «зарегистрировался, а сюда не добавилось»). Теперь сервер при
 * регистрации заводит аккаунт: источник «кабинет», тариф «Старт» и пробный
 * период `TRIAL_MONTHS`. Дальше — как у всех: кончился пробный, не оплатил —
 * «Не оплачен», и он виден в «Деньгах».
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { adminStore } = require("./store");
const plans = require("./plans");

function registeredAccount(db, { email, kind, company, name, orgId }, now) {
  const store = adminStore(db);
  const known = store.accountByEmail(email);
  if (known) {
    // Карточка на эту почту уже была (заявка с сайта, заведена руками) — та же
    // компания: одна почта — одна компания (Кирилл 24.11). Раньше её молча
    // пропускали, компания оставалась без тарифа: он не переключался, а
    // лимит складов не действовал. Связываем, только если карточка ещё ни с
    // какой компанией не связана; чужую связь не перезаписываем. Войти в
    // компанию до подтверждения почты кодом нельзя, так что чужая почта
    // карточку не заберёт.
    if (!known.org_id && orgId && !store.accountByOrg(orgId)) {
      store.updateAccount(known.id, { org_id: orgId }, now);
      store.log(now, null, "account_link", `account:${known.id}`, { почта: email });
      return known.id;
    }
    return null;
  }
  const id = store.addAccount(
    {
      kind: kind === "seller" ? "seller" : "warehouse",
      name: (company || email).slice(0, 120),
      email,
      contact_name: name || null,
      source: "cabinet",
      // По компании кабинет потом узнаёт свой тариф (`cabinet/plan.js`).
      org_id: orgId || null,
      tariff: "start",
      price: plans.PLANS.start.price,
      trial_until: plans.addMonths(now.toISOString(), plans.TRIAL_MONTHS),
    },
    now,
  );
  store.log(now, null, "account_register", `account:${id}`, { почта: email });
  return id;
}

module.exports = { registeredAccount };
