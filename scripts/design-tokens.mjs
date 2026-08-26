/**
 * Генерация docs/design/design-tokens.json из CSS-переменных темы.
 *
 * Источник истины — src/index.css: дизайнер импортирует полученный файл в
 * Tokens Studio, и палитра в Figma не расходится с кодом. Запуск: npm run tokens.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const css = readFileSync("src/index.css", "utf8");

/** Переменные одного блока (`:root` или `.dark`). */
function block(selector) {
  const re = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n  \\}`);
  const body = css.match(re)?.[1] ?? "";
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

/** «221 83% 53%» → #2563EB. Не-цвета (например --radius) отбрасываем. */
function hslToHex(value) {
  const m = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return null;
  const h = +m[1] / 360;
  const s = +m[2] / 100;
  const l = +m[3] / 100;
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (n) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${hex(0)}${hex(8)}${hex(4)}`;
}

function colors(vars) {
  const out = {};
  for (const [name, value] of Object.entries(vars)) {
    const hex = hslToHex(value);
    if (hex) {
      out[name] = {
        $type: "color",
        $value: hex,
        $description: `CSS: hsl(var(--${name}))`,
      };
    }
  }
  return out;
}

const existing = JSON.parse(
  readFileSync("docs/design/design-tokens.json", "utf8"),
);

const tokens = {
  ...existing,
  color: { light: colors(block(":root")), dark: colors(block("\\.dark")) },
};

mkdirSync("docs/design", { recursive: true });
writeFileSync(
  "docs/design/design-tokens.json",
  `${JSON.stringify(tokens, null, 2)}\n`,
);
console.log(
  `tokens: ${Object.keys(tokens.color.light).length} light / ${Object.keys(tokens.color.dark).length} dark`,
);
