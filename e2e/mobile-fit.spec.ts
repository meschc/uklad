import { expect, test, type Locator, type Page } from "@playwright/test";
import { acceptCookies } from "./helpers";

/**
 * Кабинет и столы на телефоне: каждый экран сам себя проверяет на габариты.
 *
 * Экранов много, правят их разные задачи, и ломается на телефоне то, чего не
 * видно на ноутбуке: страница едет вбок, кнопка 28 px, текст вылезает из
 * своей рамки. Глазами такое находят у склада, а не в PR (Кирилл 17.11: «чтобы
 * в будущем оно всё само подстраивалось»). Поэтому обход: все экраны из меню
 * «Ещё» и все процессы стола, на каждом — три правила из DESIGN-SYSTEM.md
 * («Телефон»):
 *
 * 1. Ничего не шире экрана (кроме блоков с собственной прокруткой).
 * 2. Всё, что нажимают, — не меньше 40 px по обеим сторонам (цель — 44,
 *    40 — запас на округление; Apple 44 pt, Material 48 dp). Переключатель
 *    `Segmented` (role=group) — от 36 px: он целиком полоса во всю ширину.
 *    Галочки и ссылки внутри текста — исключения WCAG 2.5.8.
 * 3. Текст не вылезает из своей рамки: обрезать — `truncate`, переносить —
 *    `break-words`, но не торчать поверх соседа.
 *
 * Список экранов читается с меню: новый экран попадает в проверку сам.
 */

/** Не экраны или экраны со своей проверкой ниже. */
const SKIP = /^(Сообщить о проблеме|Переключить тему|Рабочее место|На главную)/;

test.describe("Телефон: экраны помещаются и нажимаются пальцем", () => {
  test.skip(({ isMobile }) => !isMobile, "Проверка узкого экрана");

  for (const role of ["Склад", "Продавец"] as const) {
    test(`кабинет, роль «${role}»: каждый экран меню`, async ({ page }) => {
      test.setTimeout(180_000);
      await openWarehouse(page, role);

      const names = await sheetItems(page);
      expect(names.length, "в меню почти нет экранов").toBeGreaterThan(3);

      const problems: string[] = [];
      for (const name of names) {
        const sheet = await openSheet(page);
        await expandGroups(sheet);
        await sheet
          .getByRole("button", { name: startsWith(name) })
          .first()
          .click();
        await page.waitForLoadState("networkidle");
        problems.push(...(await audit(page, name)));
      }
      expect(problems, "экраны, которые не держат телефон").toEqual([]);
    });
  }

  test("стол: привязка, вход и каждый процесс", async ({ page }) => {
    test.setTimeout(240_000);
    const openDesk = async () => {
      await openWarehouse(page);
      const sheet = await openSheet(page);
      await sheet.getByRole("button", { name: /^Рабочее место/ }).click();
      await expect(page.getByRole("button", { name: /Привязать/ })).toBeVisible();
    };
    await openDesk();
    const problems = await audit(page, "стол: привязка");
    const combo = page.locator("main").getByRole("combobox");
    await combo.click();
    const stations = (await page.getByRole("option").allInnerTexts()).map((s) => s.trim());
    await page.keyboard.press("Escape");
    expect(stations.length, "у стола нет процессов").toBeGreaterThan(3);

    for (const [i, station] of stations.entries()) {
      // Привязанный стол отвязывает только руководитель — проще начать демо
      // заново: посев ставится при первом запуске.
      if (i > 0) {
        await page.evaluate(() => localStorage.clear());
        await openDesk();
      }
      await combo.click();
      await page.getByRole("option", { name: station, exact: true }).click();
      await page.locator("main input").first().fill(`${station}, стол 1`);
      await page.getByRole("button", { name: /Привязать/ }).click();
      if (i === 0) problems.push(...(await audit(page, "стол: вход по бейджу")));
      // Демо-бейдж — тот же вход, что скан.
      await page.locator("main ul button").first().click();
      await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
      await page.waitForLoadState("networkidle");
      problems.push(...(await audit(page, `стол: ${station}`)));
    }
    expect(problems, "процессы стола, которые не держат телефон").toEqual([]);
  });
});

async function openWarehouse(page: Page, role: "Склад" | "Продавец" = "Склад"): Promise<void> {
  await acceptCookies(page);
  await page.goto("/app/");
  if (role === "Продавец") {
    await page.getByRole("group", { name: "Роль" }).getByRole("button", { name: role }).click();
  }
  await page
    .getByRole("button")
    .filter({ hasText: /\d+ этаж/ })
    .first()
    .click();
}

async function openSheet(page: Page): Promise<Locator> {
  await page
    .getByRole("navigation", { name: "Разделы" })
    .filter({ visible: true })
    .getByRole("button", { name: /^Ещё/ })
    .click();
  const sheet = page.locator(".fixed.inset-0").getByRole("navigation", { name: "Разделы" });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function expandGroups(sheet: Locator): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const closed = sheet.locator('button[aria-expanded="false"]');
    if ((await closed.count()) === 0) return;
    await closed.first().click();
  }
}

/** Пункты меню «Ещё»: раскрыть все группы и прочитать подписи. */
async function sheetItems(page: Page): Promise<string[]> {
  const sheet = await openSheet(page);
  await expandGroups(sheet);
  const names = await sheet
    .locator("button:not([aria-expanded])")
    .evaluateAll((els) =>
      els.map((el) =>
        (el.getAttribute("aria-label") || (el as HTMLElement).innerText)
          .split("\n")[0]
          .replace(/\s+/g, " ")
          .trim(),
      ),
    );
  await page.getByRole("button", { name: "Закрыть меню" }).click();
  await expect(sheet).toHaveCount(0);
  return [...new Set(names)].filter((n) => n && !SKIP.test(n));
}

function startsWith(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s\\u00A0]+");
  return new RegExp(`^${escaped}`);
}

/** Три правила телефона на открытом экране; пустой список — экран в порядке. */
async function audit(page: Page, where: string): Promise<string[]> {
  const found = await page.evaluate(() => {
    const out: string[] = [];
    const W = document.documentElement.clientWidth;
    const label = (el: Element) =>
      (
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        (el as HTMLElement).innerText ||
        el.getAttribute("placeholder") ||
        el.tagName.toLowerCase()
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 32);
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (getComputedStyle(el).visibility === "hidden") return false;
      if (el.closest("[aria-hidden=true], [inert], .sr-only")) return false;
      // Спрятанное «для чтеца» через clip (шапка таблицы-карточек) не видно.
      for (let p: Element | null = el; p; p = p.parentElement) {
        if (getComputedStyle(p).clip.startsWith("rect")) return false;
      }
      return true;
    };
    // Внутри блока со своей прокруткой (лента, таблица на компьютере) ширина
    // не мешает: её прокручивают, страница стоит.
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
      }
      return false;
    };

    // 1. Шире экрана.
    if (document.documentElement.scrollWidth > W + 1) {
      const wide = [...document.querySelectorAll("body *")]
        .filter((el) => visible(el) && el.getBoundingClientRect().right > W + 1 && !clipped(el))
        .filter((el) => getComputedStyle(el).position !== "fixed")
        .slice(-2)
        .map(label);
      const by = document.documentElement.scrollWidth - W;
      out.push(`страница шире экрана на ${by}px: ${wide.join(", ")}`);
    }

    // 2. Мелкие цели касания.
    const targets = document.querySelectorAll(
      "button, a[href], [role=button], select, [role=combobox], " +
        "input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range])",
    );
    for (const el of targets) {
      if (!visible(el) || (el as HTMLButtonElement).disabled) continue;
      // Ссылка внутри абзаца — часть текста, а не кнопка (WCAG 2.5.8).
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
      const r = el.getBoundingClientRect();
      // Зона касания шире рисунка (`before:-inset-3`, как у галочки строки).
      const before = getComputedStyle(el, "::before");
      const pad =
        before.content !== "none" && before.position === "absolute"
          ? Math.max(0, -parseFloat(before.top) || 0)
          : 0;
      const min = (el.closest("[role=group]") ? 36 : 40) - 2 * pad;
      if (r.height < min || r.width < min)
        out.push(`мелкая цель «${label(el)}» ${Math.round(r.width)}×${Math.round(r.height)}`);
    }

    // 3. Текст торчит из своей рамки.
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (el.children.length > 0 || !el.textContent?.trim() || !visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowX !== "visible" || cs.display === "inline") continue;
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1)
        out.push(`текст шире рамки «${label(el)}» ${el.scrollWidth}>${el.clientWidth}`);
    }
    return out;
  });
  // Одна и та же беда в каждой строке списка — одна запись со счётом: иначе
  // отчёт тонет в сотне одинаковых строк.
  const groups = new Map<string, { first: string; n: number }>();
  for (const p of found) {
    const key = p.replace(/«[^»]*»/, "«…»");
    const g = groups.get(key);
    if (g) g.n++;
    else groups.set(key, { first: p, n: 1 });
  }
  return [...groups.values()].map(({ first, n }) => `${where}: ${first}${n > 1 ? ` (×${n})` : ""}`);
}
