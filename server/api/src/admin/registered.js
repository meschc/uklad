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

function registeredAccount(db, { email, kind, company, name }, now) {
  const store = adminStore(db);
  if (store.accountByEmail(email)) return null;
  const id = store.addAccount(
    {
      kind: kind === "seller" ? "seller" : "warehouse",
      name: (company || email).slice(0, 120),
      email,
      contact_name: name || null,
      source: "cabinet",
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
