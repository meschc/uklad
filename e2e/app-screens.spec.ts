import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Каждый экран кабинета открывается — за склад и за продавца.
 *
 * `app.spec.ts` проходит один короткий маршрут. Здесь — обход всего рельса:
 * экраны правят разные задачи, и упавшие «Наклейки» или «Персонал» иначе
 * обнаружились бы только у того, кто туда зайдёт. Падение одного экрана не
 * роняет остальные (`ErrorBoundary` по виду), поэтому ловим его по тексту
 * заглушки и по необработанным ошибкам.
 *
 * Список пунктов не захардкожен, а читается с рельса: новый экран попадает в
 * проверку сам, а переименованный не делает её ложно-красной.
 */

const CRASH = "Этот экран сломался";

/**
 * Не экраны: логотип уводит из склада, тема и сворачивание меню ничего не
 * открывают, «Сообщить о проблеме» — панель поверх экрана, а не экран.
 */
const NOT_SCREENS = new Set([
  "На главную",
  "Переключить тему",
  "Свернуть меню",
  "Развернуть меню",
  "Сообщить о проблеме",
]);

test.describe("Обход экранов кабинета", () => {
  test.skip(({ isMobile }) => !!isMobile, "Редактор плана рассчитан на десктоп");

  for (const role of ["Склад", "Продавец"] as const) {
    test(`роль «${role}»: все экраны рельса открываются`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto("/app/");
      if (role === "Продавец") {
        await page
          .getByRole("group", { name: "Роль" })
          .getByRole("button", { name: "Продавец" })
          .click();
      }
      // Складов несколько: обе роли сначала видят список и сами открывают склад.
      await page
        .getByRole("button")
        .filter({ hasText: /\d+ этаж/ })
        .first()
        .click();

      const rail = page.getByRole("navigation", { name: "Разделы" });
      await expect(rail).toBeVisible();

      const visited = await visitAll(page, rail);
      expect(visited.length, "в рельсе почти нет экранов").toBeGreaterThan(3);
      expect(errors, "необработанные ошибки").toEqual([]);
    });
  }
});

/** Подписи кнопок рельса и признак группы (у группы есть `aria-expanded`). */
async function railButtons(rail: Locator): Promise<{ name: string; group: boolean }[]> {
  return rail.locator("button").evaluateAll((els) =>
    els.map((el) => ({
      // Счётчик непрочитанного идёт второй строкой: «Чат\n2». Неразрывные
      // пробелы типографики (`noOrphans`) приводим к обычным.
      name: (el.getAttribute("aria-label") || (el as HTMLElement).innerText)
        .split("\n")[0]
        .replace(/\s+/g, " ")
        .trim(),
      group: el.hasAttribute("aria-expanded"),
    })),
  );
}

/**
 * Пройти все экраны рельса.
 *
 * Пункты группы видны, только пока она раскрыта. Группа с текущим экраном
 * открыта сразу, поэтому не «щёлкаем» её вслепую, а раскрываем, если она
 * закрыта, — и перед каждым пунктом проверяем это заново.
 */
async function visitAll(page: Page, rail: Locator): Promise<string[]> {
  const top = await railButtons(rail);
  const topNames = new Set(top.map((b) => b.name));
  const visited: string[] = [];

  for (const { name, group } of top) {
    if (!name || NOT_SCREENS.has(name)) continue;
    const button = rail.getByRole("button", { name: startsWith(name) }).first();

    if (!group) {
      await open(page, button, name);
      visited.push(name);
      continue;
    }

    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    // Пункты — только этой группы: раскрытыми бывают сразу несколько.
    const items = (await railButtons(button.locator("xpath=..").getByRole("list")))
      .map((b) => b.name)
      .filter((n) => !topNames.has(n));

    for (const item of items) {
      if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
      const entry = rail.getByRole("button", { name: startsWith(item) }).first();
      await open(page, entry, `${name} → ${item}`);
      visited.push(`${name} → ${item}`);
    }
  }
  return visited;
}

/** Имя кнопки «начинается с»: к пункту бывает приписан счётчик («Чат 2»). */
function startsWith(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s\\u00A0]+");
  return new RegExp(`^${escaped}`);
}

async function open(page: Page, button: Locator, label: string): Promise<void> {
  await button.click();
  // Экраны грузятся отдельными кусками: заглушка сбоя появится, только когда
  // кусок доедет и попробует отрисоваться.
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(CRASH), `экран «${label}» упал`).toHaveCount(0);
  // Рабочее место открывается на весь экран, без рельса: возвращаемся из него
  // его же кнопкой, иначе обход потерял бы рельс на середине.
  if (label.endsWith("Рабочее место")) {
    await page.getByRole("button", { name: "В кабинет" }).click();
    await expect(page.getByRole("navigation", { name: "Разделы" })).toBeVisible();
  }
}
