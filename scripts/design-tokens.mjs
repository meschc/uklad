/**
 * Генерация docs/design/design-tokens.json из CSS-переменных темы.
 *
 * Источник истины — сам код: дизайнер импортирует полученный файл в Tokens
 * Studio, и палитра в Figma не расходится с тем, что видно в браузере.
 * Запуск: npm run tokens.
 *
 * Источник один — `src/index.css`, общий для витрины и кабинета (ADR 0007).
 * Раньше их было два: `src/site/site.css` переопределял витрине фон, синий и
 * добавлял свой `--brand`, и выгрузка держала четыре набора —
 * `color.app.light|dark` и `color.site.light|dark`. Своей палитры у витрины
 * больше нет: в `site.css` остался только характер (скругление `--r`), а не
 * цвет. Два одинаковых набора под разными именами в Figma читались бы как два
 * разных продукта, поэтому наборов теперь тоже два — `color.light|dark`.
 *
 * Тёмный набор — наложение `.dark` на `:root`, ровно как в браузере: оба
 * селектора садятся на один и тот же элемент (`html`), и `.dark` перебивает
 * только то, что задаёт сам.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// Явный импорт вместо глобальной переменной — см. тот же приём в prerender.mjs.
import console from "node:console";

const THEME_CSS = readFileSync("src/index.css", "utf8");

/**
 * Тело блока, открывающегося на позиции `open`, — по балансу скобок.
 *
 * Считать скобки, а не искать закрывающую по отступу: блоки темы лежат внутри
 * `@layer base`, и правило «закрывается двумя пробелами и скобкой» сломается
 * от первой же перестановки слоёв.
 */
function braced(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

/**
 * Вырезает `@media print` целиком.
 *
 * Печать — третья тема (серый лист витрины лежит в `site.css`, правила бумаги
 * кабинета — в `index.css` и `print.css`), и в Figma ей делать нечего. Если
 * однажды печатный блок переопределит здесь `.dark` или `:root`, без этого
 * шага бумажный белый молча затёр бы экранный.
 */
function withoutPrint(css) {
  let out = css;
  for (;;) {
    const at = out.indexOf("@media print");
    if (at === -1) return out;
    const open = out.indexOf("{", at);
    if (open === -1) return out;
    out = out.slice(0, at) + out.slice(open + braced(out, open).length + 2);
  }
}

/**
 * Переменные всех блоков с этим селектором, слитые в порядке появления.
 *
 * Селектор должен стоять в одиночку: `.dark { … }` — это тема, а
 * `.dark .text-primary { … }` — покраска одного элемента внутри неё, и её
 * свойства в палитру не входят.
 */
function block(css, selector) {
  const heads = new RegExp(`(?:^|[\\s,}])${selector}\\s*\\{`, "g");
  const out = {};
  for (const head of withoutPrint(css).matchAll(heads)) {
    const open = head.index + head[0].length - 1;
    const body = braced(withoutPrint(css), open);
    for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  }
  return out;
}

/** Наложение блоков: последний слой перебивает предыдущие, как в каскаде. */
function layer(...parts) {
  return Object.assign({}, ...parts);
}

/**
 * Разворачивает ссылки `var(--x)` — и целиком, и внутри значения.
 *
 * Ссылки в теме есть намеренно, и двух видов. Кольцо фокуса — это не «похожий
 * на фирменный» цвет, а тот же самый (`--ring: var(--primary)`). Волосяные
 * линии — доля прозрачности на цвете текста
 * (`--hairline: hsl(var(--foreground) / 0.07)`), и там ссылка стоит внутри
 * выражения. Раньше разворачивался только первый вид, и все линии выпадали из
 * выгрузки молча: значение не похоже на цвет — значит, не цвет.
 *
 * Глубина ограничена: цепочка длиннее пяти шагов — это почти наверняка кольцо
 * (`--a: var(--b)`, `--b: var(--a)`), и молча вернуть из него пустоту хуже, чем
 * сказать вслух.
 */
function resolve(value, vars, depth = 0) {
  if (!value.includes("var(")) return value;
  if (depth >= 5) {
    console.warn(`tokens: не разворачивается ссылка ${value} — похоже на кольцо`);
    return value;
  }
  let missing = false;
  const next = value.replace(/var\(\s*--([\w-]+)\s*\)/g, (whole, name) => {
    if (vars[name] === undefined) {
      console.warn(`tokens: ссылка на несуществующую переменную --${name}`);
      missing = true;
      return whole;
    }
    return vars[name];
  });
  // Все оставшиеся ссылки битые — следующий проход ничего не изменит.
  return missing && next === value ? value : resolve(next, vars, depth + 1);
}

/** Тройка Tailwind: «221 83% 53%» — её оборачивает в `hsl()` сама разметка. */
const TRIPLET = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/;
/** Готовый цвет целиком: «hsl(222 24% 10% / 0.07)» — с долей прозрачности. */
const FULL = /^hsla?\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*([\d.]+%?)\s*)?\)$/;

/**
 * Значение переменной → HEX. Не-цвета (`--radius`, `--r`) отбрасываем.
 *
 * Прозрачность уезжает в восьмизначный HEX — форму, которую Tokens Studio
 * понимает и переносит в Figma как заливку с непрозрачностью. Без неё
 * волосяная линия приехала бы в макет сплошной чёрной полосой.
 */
function toHex(value) {
  const full = value.match(FULL);
  const m = full ?? value.match(TRIPLET);
  if (!m) return null;

  const alpha = full?.[4] === undefined ? 1 : parseAlpha(full[4]);
  const h = +m[1] / 360;
  const s = +m[2] / 100;
  const l = +m[3] / 100;
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (n) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  const rgb = `${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
  return `#${rgb}${alpha >= 1 ? "" : hex(alpha)}`;
}

function parseAlpha(raw) {
  return raw.endsWith("%") ? +raw.slice(0, -1) / 100 : +raw;
}

function colors(vars) {
  const out = {};
  for (const [name, value] of Object.entries(vars)) {
    const resolved = resolve(value, vars);
    const hex = toHex(resolved);
    if (!hex) continue;
    out[name] = {
      $type: "color",
      $value: hex,
      // Как этот токен зовут в разметке: тройку разметка оборачивает сама,
      // готовый цвет подставляется как есть.
      $description: TRIPLET.test(resolved) ? `CSS: hsl(var(--${name}))` : `CSS: var(--${name})`,
    };
  }
  return out;
}

const light = block(THEME_CSS, ":root");
const dark = layer(light, block(THEME_CSS, "\\.dark"));

const existing = JSON.parse(readFileSync("docs/design/design-tokens.json", "utf8"));

const tokens = {
  ...existing,
  color: { light: colors(light), dark: colors(dark) },
};

mkdirSync("docs/design", { recursive: true });
writeFileSync("docs/design/design-tokens.json", `${JSON.stringify(tokens, null, 2)}\n`);

const count = (set) => Object.keys(set).length;
console.log(
  `tokens: ${count(tokens.color.light)}/${count(tokens.color.dark)} цветов (светлая/тёмная), ` +
    "общие для витрины и кабинета",
);
