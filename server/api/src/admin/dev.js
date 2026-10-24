/**
 * Админка на своём компьютере — посмотреть и пощупать до сервера.
 *
 *   node server/api/src/admin/dev.js
 *
 * Открывается на http://localhost:5176. База — отдельный файл
 * `~/.uklad-admin-local.db`, в первый запуск в неё кладутся демо-склады,
 * заявки и менеджеры, а для входа создаётся владелец: пароль и секрет для
 * приложения кодов печатаются в терминал один раз. Вход — как на сервере:
 * пароль плюс код из приложения.
 *
 * На сервере это не используется: там владельца создаёт `cli.js`, а демо-данных
 * нет вовсе. Слушает только 127.0.0.1 — из сети не видно.
 */
/* global require, process, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { openDb } = require("../db");
const { adminStore } = require("./store");
const { hashPassword } = require("./password");
const { createAdminApp } = require("./app");
const plans = require("./plans");
const totp = require("./totp");

const PORT = Number(process.env.ADMIN_DEV_PORT ?? 5176);
const FILE = process.env.ADMIN_DEV_DB ?? path.join(os.homedir(), ".uklad-admin-local.db");
const EMAIL = process.env.ADMIN_DEV_EMAIL ?? "owner@u-klad.ru";

const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY);
const ahead = (days) => new Date(Date.now() + days * DAY).toISOString();

function seed(db, store) {
  const managerA = store.addManager({ name: "Анна Белова", contact: "anna@u-klad.ru" }, ago(20));
  store.addManager({ name: "Игорь Ким", contact: "+7 900 000-00-02" }, ago(10));

  const accounts = [
    [
      "warehouse",
      "Склад «Север»",
      "sever@example.ru",
      "operator",
      24900,
      { paid: 40, manager: managerA, city: "Подольск", inn: "5036000001" },
    ],
    [
      "warehouse",
      "Фулфилмент Восток",
      "vostok@example.ru",
      "warehouse",
      9900,
      { trial: 9, city: "Казань" },
    ],
    [
      "warehouse",
      "Логистик-Юг",
      "yug@example.ru",
      "warehouse",
      9900,
      { paid: -6, city: "Краснодар" },
    ],
    ["warehouse", "Мезонин-24", "mez24@example.ru", "start", 4900, { trial: 70, city: "Москва" }],
    [
      "warehouse",
      "Склад на Окской",
      "okskaya@example.ru",
      "custom",
      7500,
      { paid: 12, city: "Рязань", limits: { staff: 8 } },
    ],
    ["seller", "ИП Смирнова, одежда", "smirnova@example.ru", "start", 4900, { trial: 50 }],
    ["seller", "Дом и уют", "dom@example.ru", "start", 4900, { paid: 25, city: "Тверь" }],
    ["warehouse", "Старый склад", "old@example.ru", "start", 4900, { paid: -90, archived: true }],
  ];
  for (const [kind, name, email, tariff, price, o] of accounts) {
    const created = ago(30 + Math.floor(Math.random() * 30));
    const id = store.addAccount(
      {
        kind,
        name,
        email,
        tariff,
        price,
        city: o.city ?? null,
        inn: o.inn ?? null,
        contact_name: "Иван Петров",
        phone: "+7 900 000-00-00",
        trial_until: o.trial ? ahead(o.trial) : ago(5).toISOString(),
        paid_until: o.paid ? ahead(o.paid) : null,
        manager_id: o.manager ?? null,
        limits: o.limits ? JSON.stringify(o.limits) : null,
      },
      created,
    );
    db.prepare(`UPDATE accounts SET last_login_at = ? WHERE id = ?`).run(
      ago(Math.random() * 6).toISOString(),
      id,
    );
    store.log(created, null, "account_create", `account:${id}`, {
      тип: kind,
      почта: email,
      тариф: plans.PLANS[tariff].title,
    });
    if (o.paid) {
      store.addPayment({
        accountId: id,
        at: ago(20).toISOString(),
        months: 1,
        amount: price,
        paidUntil: ahead(o.paid),
        note: "демо",
      });
    }
    if (o.archived) store.setArchived(id, ago(3).toISOString(), ago(3));
    if (name === "Логистик-Юг") {
      store.setStatus(id, "blocked", "не оплатил за октябрь", ago(2));
      store.log(ago(2), null, "account_block", `account:${id}`, {
        причина: "не оплатил за октябрь",
      });
    }
  }

  const insertLead = db.prepare(
    `INSERT INTO leads (created_at, kind, lang, subject, message, consent_ads, mailed, status) VALUES (?, ?, 'ru', ?, ?, ?, 1, ?)`,
  );
  const leads = [
    [
      "demo",
      "Демо для склада",
      "Имя: Ольга\nПочта: olga@sklad-test.ru\nКак ведёте учёт: Excel",
      "new",
    ],
    [
      "warehouse",
      "Подключение склада",
      "Имя: Сергей\nСклад: Терминал-Запад\nПочта: west@terminal-test.ru\nТелефон: +7 900 111-22-33",
      "new",
    ],
    [
      "contact",
      "Вопрос с сайта",
      "Имя: Мария\nПочта: maria@test.ru\nСообщение: Есть ли интеграция с 1С?",
      "work",
    ],
    ["demo", "Демо для склада", "Имя: Пётр\nПочта: petr@test.ru", "lost"],
  ];
  leads.forEach(([kind, subject, message, status], i) => {
    insertLead.run(ago(i * 2 + 0.3).toISOString(), kind, subject, message, i % 2, status);
  });
  db.prepare(
    `INSERT INTO demo_links (token, email, lead_id, created_at, expires_at, opened_at, opens) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomBytes(16).toString("base64url"),
    "olga@sklad-test.ru",
    1,
    ago(0.3).toISOString(),
    ahead(13.7),
    ago(0.2).toISOString(),
    3,
  );
  db.prepare(
    `INSERT INTO demo_links (token, email, lead_id, created_at, expires_at, opens) VALUES (?, ?, ?, ?, ?, 0)`,
  ).run(randomBytes(16).toString("base64url"), "petr@test.ru", 4, ago(6).toISOString(), ahead(8));

  // Обращения из кабинета — в том виде, в каком их шлёт «Сообщить о проблеме».
  const report = (message, view, journal, snapshot) =>
    JSON.stringify({
      version: 1,
      createdAt: ago(0.1).toISOString(),
      message,
      env: {
        userAgent: "Mozilla/5.0 (Macintosh) Chrome/130",
        language: "ru-RU",
        screen: "1512x982",
        timezone: "Europe/Moscow",
        view,
      },
      journal,
      ...(snapshot ? { snapshot } : {}),
    });
  const at = (h) => Date.now() - h * 3_600_000;
  const addReport = db.prepare(
    `INSERT INTO support_reports (created_at, message, view, errors, has_snapshot, payload, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const j1 = [
    { at: at(1.2), kind: "view", name: "dashboard" },
    { at: at(1.1), kind: "view", name: "receiving" },
    {
      at: at(1.0),
      kind: "error",
      name: "command:data.failed",
      detail:
        "TypeError: Cannot read properties of undefined (reading 'lines')\n    at acceptLine (receiving.ts:212)",
    },
    { at: at(0.9), kind: "view", name: "receiving" },
  ];
  addReport.run(
    ago(0.04).toISOString(),
    "После сканирования коробки пропала строка приёмки, пришлось начинать заново.",
    "receiving",
    1,
    1,
    report(
      "После сканирования коробки пропала строка приёмки, пришлось начинать заново.",
      "receiving",
      j1,
      { data: { products: [] }, stats: { names: 9, dropped: 14, texts: 3 } },
    ),
    "new",
  );
  addReport.run(
    ago(2).toISOString(),
    "Как напечатать ярлыки сразу на весь ряд?",
    "labels",
    0,
    0,
    report("Как напечатать ярлыки сразу на весь ряд?", "labels", [
      { at: at(48), kind: "view", name: "labels" },
    ]),
    "done",
  );
}

function main() {
  const db = openDb(FILE);
  const store = adminStore(db.raw);
  if (store.countAdmins() === 0) {
    const password = randomBytes(12).toString("base64url");
    const secret = totp.newSecret();
    store.addAdmin(
      { email: EMAIL, passwordHash: hashPassword(password), totpSecret: secret },
      new Date(),
    );
    seed(db.raw, store);
    console.log(`
Локальная админка создана (демо-данные). Это не сервер: данные только на этом компьютере.

  Адрес:   http://localhost:${PORT}
  Почта:   ${EMAIL}
  Пароль:  ${password}
  Секрет для приложения кодов (Яндекс Ключ / Google Authenticator → «ввести ключ»):
           ${secret}
  Или ссылка для QR: ${totp.otpauthUrl(secret, EMAIL, "Уклад админка (локально)")}

Начать заново: удалите ${FILE} и запустите снова.
`);
  } else {
    console.log(`Локальная админка: http://localhost:${PORT} (база ${FILE})`);
  }
  const cfg = {
    adminOrigin: `http://localhost:${PORT}`,
    publicUrl: "https://u-klad.ru",
    trustProxy: false,
  };
  http.createServer(createAdminApp({ cfg, db: db.raw })).listen(PORT, "127.0.0.1");
}

main();
