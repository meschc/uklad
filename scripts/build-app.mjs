/**
 * Отдельная сборка кабинета — под поддомен app.u-klad.ru (ADR 0008).
 *
 * Vite кладёт страницу туда же, где она лежит в исходниках: `app/index.html` →
 * `dist-app/app/index.html`. На поддомене кабинет живёт в корне, поэтому
 * страница переезжает в `dist-app/index.html`. Ссылки на скрипты и стили в ней
 * абсолютные (`/assets/…`, `base` не задан — см. ADR 0002), переезд их не
 * ломает.
 *
 * Из `public/` берётся только то, что нужно кабинету: иконки вкладки, шрифты и
 * знаки партнёров для экрана интеграций. Остальное — CNAME, карта сайта, фото и
 * превью для соцсетей — витринное; чужой CNAME на поддомене и вовсе увёл бы
 * хостинг на адрес витрины.
 *
 * robots.txt запрещает всё: рабочему месту в поиске делать нечего, а `noindex`
 * в шапке страницы робот прочтёт, только если сначала её скачает.
 *
 * Запуск: node scripts/build-app.mjs — после vite build --mode app (см. npm run
 * build:app).
 */
import { cpSync, existsSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// Явные импорты вместо глобальных — как в prerender.mjs.
import process from "node:process";
import console from "node:console";

const OUT = "dist-app";

/** Что из `public/` нужно кабинету. Всё остальное там — витрины. */
const CABINET_PUBLIC = ["favicon.svg", "favicon.ico", "apple-touch-icon.png", "fonts", "brands"];

const ROBOTS = "User-agent: *\nDisallow: /\n";

const nestedPage = join(OUT, "app", "index.html");
if (!existsSync(nestedPage)) {
  console.error(`Нет ${nestedPage}: сначала vite build --mode app.`);
  process.exit(1);
}
renameSync(nestedPage, join(OUT, "index.html"));
// Каталог после переезда пуст. Если нет — пусть падает: значит, Vite положил
// туда что-то ещё, и молча выкидывать это нельзя.
rmdirSync(join(OUT, "app"));

for (const entry of CABINET_PUBLIC) {
  cpSync(join("public", entry), join(OUT, entry), { recursive: true });
}
writeFileSync(join(OUT, "robots.txt"), ROBOTS);

console.log(`Кабинет: ${OUT}/index.html, из public/ — ${CABINET_PUBLIC.join(", ")}, robots.txt`);
