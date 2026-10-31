import { LEGAL_DOCS } from "../data/legal";
import { c, type Copy } from "./copy";

/**
 * Подсказки на странице 404 (идея Кирилла 30 окт): человек видит адрес,
 * который не открылся, может поправить его на месте, а под строкой — живые
 * страницы, похожие на набранное. `/tarif` подскажет «Тарифы», `/контакты` —
 * «Контакты».
 *
 * Похожесть — расстояние Левенштейна до любого из имён страницы: адреса
 * набирают по памяти, с опечаткой, транслитом или по-русски, и точного
 * совпадения ждать нельзя. Скрытые до запуска страницы (каталог, селлеры)
 * сюда не входят — 404 не должна вести туда, куда не ведёт меню.
 */
export interface PageHint {
  to: string;
  label: Copy;
  /** Как ещё могут набрать этот адрес. */
  names: string[];
}

export const PAGE_HINTS: PageHint[] = [
  { to: "/", label: c("Главная", "Home"), names: ["", "home", "index", "glavnaya", "главная"] },
  {
    to: "/warehouses",
    label: c("Складам", "For warehouses"),
    names: ["warehouses", "warehouse", "sklad", "sklady", "склад", "склады", "складам"],
  },
  {
    to: "/pricing",
    label: c("Тарифы", "Pricing"),
    names: ["pricing", "price", "prices", "tarif", "tarify", "tariffs", "ceny", "тарифы", "цены"],
  },
  {
    to: "/roadmap",
    label: c("Дорожная карта", "Roadmap"),
    names: ["roadmap", "plans", "karta", "дорожная", "карта", "планы"],
  },
  {
    to: "/contacts",
    label: c("Контакты", "Contacts"),
    names: ["contacts", "contact", "kontakty", "контакты", "связь"],
  },
  {
    to: "/legal",
    label: c("Документы", "Legal"),
    names: ["legal", "docs", "documents", "dokumenty", "документы"],
  },
  ...LEGAL_DOCS.map((d) => ({
    to: `/legal/${d.slug}`,
    label: c(d.short, d.short),
    names: [d.slug, `legal/${d.slug}`, d.short.toLowerCase()],
  })),
];

/** Без них подсказок не бывает пусто: главное, что есть на сайте. */
const FALLBACK = ["/", "/warehouses", "/pricing"];

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Путь в сравнимый вид: без языка, слешей по краям и регистра. */
export function normalizePath(raw: string): string {
  let p = raw.trim().toLowerCase();
  try {
    p = decodeURIComponent(p);
  } catch {
    // Битая %-последовательность — сравниваем как есть.
  }
  return p.replace(/^\/+|\/+$/g, "").replace(/^en(\/|$)/, "");
}

/** До трёх страниц, похожих на набранный путь; похожих нет — главные. */
export function suggestPages(raw: string, limit = 3): PageHint[] {
  const q = normalizePath(raw);
  const scored = PAGE_HINTS.map((page) => {
    const best = Math.min(
      ...page.names.map((n) => {
        if (q === n) return 0;
        if (n && q && (q.startsWith(n) || n.startsWith(q)) && Math.min(q.length, n.length) >= 3)
          return 0.5;
        return distance(q, n) / Math.max(n.length, q.length, 1);
      }),
    );
    return { page, best };
  })
    .filter((s) => s.best <= 0.4)
    .sort((a, b) => a.best - b.best)
    .map((s) => s.page);

  const out = scored.filter((p, i) => scored.findIndex((x) => x.to === p.to) === i);
  for (const to of FALLBACK) {
    if (out.length >= limit) break;
    if (!out.some((p) => p.to === to)) out.push(PAGE_HINTS.find((p) => p.to === to)!);
  }
  return out.slice(0, limit);
}
