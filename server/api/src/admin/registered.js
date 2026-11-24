/**
 * Регистрация в кабинете → строка в «Пользователях» админки.
 *
 * Кабинет живёт в Postgres, админка — в SQLite рядом с заявками. Раньше
 * зарегистрированный сам по себе человек в админку не попадал вовсе (Кирилл
 * 2.11: «зарегистрировался, а сюда не добавилось»). Теперь сервер при
 * регистрации заводит аккаунт: источник «кабинет», тариф «Старт» и пробный
 * период `TRIAL_MONTHS`. Дальше — как у всех: кончился пробный, не оплатил —
 * «Не оплачен», и он виден в «Деньгах».
 *
 * С компанией кабинета карточка связывается только после подтверждения почты
 * кодом (`verifiedAccount`), а не при регистрации. Неподтверждённую
 * регистрацию через 7 дней удаляет `auth.purge` вместе с компанией, и
 * связь, поставленная при регистрации, указывала бы в никуда: следующая
 * настоящая регистрация на эту почту уже не связалась бы, и тариф молча не
 * действовал («Безопасность продукта», 24.11).
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
      // Компанию (`org_id`) ставит подтверждение почты — `verifiedAccount`.
      org_id: null,
      tariff: "start",
      price: plans.PLANS.start.price,
      trial_until: plans.addMonths(now.toISOString(), plans.TRIAL_MONTHS),
    },
    now,
  );
  store.log(now, null, "account_register", `account:${id}`, { почта: email });
  return id;
}

/**
 * Почта подтверждена кодом → карточка на эту почту связывается с её компанией
 * кабинета: одна почта — одна компания (Кирилл 24.11). Так же связывается и
 * карточка, заведённая раньше (заявка с сайта, руками в админке), — раньше её
 * пропускали, и компания оставалась без тарифа и лимита складов. Уже
 * связанную карточку и компанию, у которой карточка есть, не трогаем.
 */
function verifiedAccount(db, { email, orgId }, now) {
  if (!orgId) return null;
  const store = adminStore(db);
  const known = store.accountByEmail(email);
  if (!known || known.org_id || store.accountByOrg(orgId)) return null;
  store.updateAccount(known.id, { org_id: orgId }, now);
  store.log(now, null, "account_link", `account:${known.id}`, { почта: email });
  return known.id;
}

module.exports = { registeredAccount, verifiedAccount };
