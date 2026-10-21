/**
 * Создать владельца админки. Регистрации через сайт нет — только так, на
 * самом сервере:
 *
 *   docker compose exec api node api/src/admin/cli.js create-owner почта@домен
 *
 * Команда придумывает пароль сама (24 символа) и печатает его вместе с
 * секретом для приложения кодов ОДИН раз. В базе остаются только хэш пароля
 * и секрет. Второго владельца команда не создаст: сначала нужно руками
 * разобраться, откуда он взялся.
 */
/* global require, process, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { openDb } = require("../db");
const { adminStore } = require("./store");
const { hashPassword } = require("./password");
const totp = require("./totp");

function main([cmd, email]) {
  if (cmd !== "create-owner" || !email || !email.includes("@")) {
    console.error("Использование: cli.js create-owner почта@домен");
    process.exit(2);
  }
  const db = openDb(path.resolve(process.env.DB_FILE ?? "/data/uklad.db"));
  const store = adminStore(db.raw);
  if (store.countAdmins() > 0) {
    console.error("Владелец уже есть. Второго не создаём.");
    process.exit(1);
  }
  const password = randomBytes(18).toString("base64url");
  const secret = totp.newSecret();
  const now = new Date();
  store.addAdmin(
    { email: email.trim().toLowerCase(), passwordHash: hashPassword(password), totpSecret: secret },
    now,
  );
  store.log(now, null, "owner_created", email);
  db.close();
  console.log(`
Владелец создан. Сохраните это в менеджер паролей — второй раз не покажем.

  Почта:   ${email}
  Пароль:  ${password}
  Секрет для приложения кодов: ${secret}
  Или ссылка для QR: ${totp.otpauthUrl(secret, email)}
`);
}

main(process.argv.slice(2));
