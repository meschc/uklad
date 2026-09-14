/**
 * Сборка витрины в статические файлы.
 *
 * Каждый адрес витрины становится отдельным `index.html` с готовой разметкой:
 * `/market/` → `dist/market/index.html`, `/en/legal/offer/` →
 * `dist/en/legal/offer/index.html`. Робот и сборщик превью получают текст сразу,
 * не выполняя скриптов; человек получает тот же файл, и дальше витрина живёт как
 * обычное приложение — переходы идут без перезагрузок.
 *
 * Готовую разметку страницы не гидрируем, а перерисовываем заново: у витрины
 * есть состояния, которых при сборке не существует (тема устройства, язык из
 * памяти браузера, согласие на cookie), и попытка «подхватить» серверную
 * разметку упиралась бы в расхождения на каждой второй странице. Разметка здесь
 * нужна тому, кто скрипты не выполняет; тому, кто выполняет, она безвредна.
 *
 * Запуск: node scripts/prerender.mjs — после vite build (см. npm run build).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
// Явные импорты вместо глобальных: файл читают и линтер, и человек, и обоим
// видно, что это скрипт Node, а не код, который поедет в браузер.
import process from "node:process";
import console from "node:console";

const DIST = "dist";
const SSR_ENTRY = pathToFileURL(join(process.cwd(), "dist-ssr/entry-server.js")).href;

const { render, SITE_ROUTES, LANGS, buildSitemap, SITE_ORIGIN, translateNoscript } = await import(
  SSR_ENTRY
);

/** Шаблон — та же страница, что собрал Vite: с хэшами файлов и всей шапкой. */
const template = readFileSync(join(DIST, "index.html"), "utf8");

/** Экранирование для значения атрибута. Заголовки складов приходят из данных. */
function attr(text) {
  return String(text)
    .split("&")
    .join("&amp;")
    .split('"')
    .join("&quot;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;");
}

/** Заменяет содержимое метатега, не трогая остальную шапку. */
function setMeta(html, selector, value) {
  const re = new RegExp(`(<meta\\s+${selector}\\s+content=")[^"]*(")`, "i");
  if (!re.test(html)) throw new Error(`в шаблоне нет метатега ${selector}`);
  return html.replace(re, `$1${attr(value)}$2`);
}

const OG_LOCALE = { ru: "ru_RU", en: "en_US" };

/**
 * Собирает страницу: правит шапку шаблона и кладёт разметку витрины внутрь
 * корневого элемента.
 */
function page({ html, meta, jsonLd }, lang) {
  let out = template;

  // Язык документа. В шаблоне он русский — его читают и скринридер, и
  // переносчик слов, и робот, который иначе сочтёт английскую версию русской.
  out = out.replace('<html lang="ru"', `<html lang="${lang}"`);

  // Предзагружаемый шрифт зависит от языка страницы. В шаблоне предзагружена
  // кириллица — ею набран весь русский сайт; английской странице она не нужна
  // вовсе, и просить браузер скачать 22 КБ вперёд всего остального ради текста,
  // в котором нет ни одной русской буквы, — прямой проигрыш на первой отрисовке.
  if (lang === "en") {
    out = out.replace("/fonts/golos-text-cyrillic.woff2", "/fonts/golos-text-latin.woff2");
  }

  // Блок «здесь нужен JavaScript» — единственный текст, который приезжает из
  // шаблона, а не из витрины: его читают ровно тогда, когда витрина не
  // нарисовалась. Язык у него поэтому свой, и выставить его может только сборка
  // страницы. Почему перевод живёт в `lib/noscript`, а не здесь — там же.
  out = translateNoscript(out, lang);

  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${attr(meta.title)}</title>`);
  out = setMeta(out, 'name="description"', meta.description);
  out = setMeta(out, 'property="og:title"', meta.title);
  out = setMeta(out, 'property="og:description"', meta.description);
  out = setMeta(out, 'property="og:locale"', OG_LOCALE[lang]);
  out = setMeta(out, 'property="og:url"', SITE_ORIGIN + (lang === "en" ? meta.en : meta.ru));

  // Canonical и hreflang: в шаблоне их нет и быть не может — у каждой страницы
  // они свои. `x-default` ведёт на русскую версию: витрина про российский рынок.
  //
  // У тупика ни того, ни другого: канонический адрес — это утверждение «вот
  // настоящий адрес этой страницы», а её нет. Вместо них запрет индексации;
  // `follow` оставлен намеренно — ссылки в шапке и подвале настоящие, и робот,
  // забредший на битый адрес, должен уйти по ним дальше, а не в тупик.
  const links = meta.noindex
    ? ['<meta name="robots" content="noindex, follow" />']
    : [
        `<link rel="canonical" href="${SITE_ORIGIN}${lang === "en" ? meta.en : meta.ru}" />`,
        `<link rel="alternate" hreflang="ru" href="${SITE_ORIGIN}${meta.ru}" />`,
        `<link rel="alternate" hreflang="en" href="${SITE_ORIGIN}${meta.en}" />`,
        `<link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${meta.ru}" />`,
        `<script type="application/ld+json">${jsonLd}</script>`,
      ];
  out = out.replace("</head>", `    ${links.join("\n    ")}\n  </head>`);

  return out.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
}

function write(name, html) {
  const file = join(DIST, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html, "utf8");
}

let written = 0;
for (const route of SITE_ROUTES) {
  for (const lang of LANGS) {
    const rendered = render(route, lang);
    write(rendered.file, page(rendered, lang));
    written += 1;
  }
}

// Страница для хостинга. Адресов у витрины конечное число, а ошибиться в ссылке
// можно бесконечным числом способов; на всё, чего нет на диске, GitHub Pages
// отдаёт `404.html` сам, nginx — по строке `error_page 404 /404.html`. Файл
// собран из той же витрины: человек, попавший на битый адрес, получает не голую
// страницу ошибки, а обычный сайт с шапкой, подвалом и рабочими ссылками.
write("404.html", page(render({ page: "notfound" }, "ru"), "ru"));

// Карта сайта собирается здесь же и по тому же списку адресов: держать её
// отдельным файлом в `public` значило бы забывать про неё при каждом новом
// складе. Дата — день сборки: страницы собраны из одного кода.
const lastmod = new Date().toISOString().slice(0, 10);
writeFileSync(join(DIST, "sitemap.xml"), buildSitemap(SITE_ORIGIN, lastmod), "utf8");

console.log(`Предрендер: ${written} страниц, карта сайта на ${SITE_ROUTES.length} адресов.`);
