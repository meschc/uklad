import { expect, test } from "@playwright/test";
import { acceptCookies, expectNoOverflow, scrollTo } from "./helpers";

/**
 * Поведение на узком экране.
 *
 * Селлер приходит с телефона чаще, чем с ноутбука, а ломается на телефоне
 * ровно то, чего не видно на макете: страница уезжает вбок из-за одного
 * широкого блока, и дальше по ней невозможно читать. Поэтому проверки здесь
 * про габариты и про элементы, которые на узком экране устроены иначе.
 */

/** Страницы, каждая из которых обязана помещаться в ширину экрана. */
const PAGES: [path: string, name: string][] = [
  ["/", "лендинг"],
  ["/warehouses/", "страница для складов"],
  ["/pricing/", "тарифы"],
  ["/contacts/", "контакты"],
  ["/legal/", "правовая информация"],
  ["/legal/cookies/", "политика cookie"],
  ["/legal/privacy/", "политика обработки"],
];

test.describe("Габариты", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
  });

  for (const [path, name] of PAGES) {
    test(`${name}: ничего не вылезает за край`, async ({ page }) => {
      await page.goto(path);
      await expectNoOverflow(page, `${name}, верх`);

      // И после прокрутки: широкий блок в середине страницы виден только
      // тогда, когда до него доехали.
      await scrollTo(page, 100_000);
      await expectNoOverflow(page, `${name}, низ`);
    });
  }
});

test.describe("Телефон", () => {
  test.skip(({ isMobile }) => !isMobile, "Проверка узкого экрана");

  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
  });

  test("меню прячется в кнопку и ведёт по разделам", async ({ page }) => {
    await page.goto("/pricing/");
    const burger = page.getByRole("button", { name: "Меню" });
    await expect(burger).toHaveAttribute("aria-expanded", "false");

    await burger.click();
    await expect(burger).toHaveAttribute("aria-expanded", "true");
    // В меню ссылки, а не кнопки: разделы обязаны открываться в новой вкладке
    // и попадать в индекс. Первое совпадение — как раз меню: подвал ниже.
    await page.getByRole("link", { name: "Контакты" }).first().click();

    await expect(page).toHaveURL(/\/contacts\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Контакты");
    // Меню обязано закрыться само: иначе оно накрывает страницу, на которую
    // только что перешли.
    await expect(burger).toHaveAttribute("aria-expanded", "false");
  });

  test("широкая таблица прокручивается внутри себя, а не тащит страницу", async ({ page }) => {
    await page.goto("/legal/cookies/");
    const box = page.locator("div.overflow-x-auto").filter({ has: page.locator("table") });
    await expect(box.first()).toBeVisible();

    // Таблица заведомо шире телефона (min-w-[520px]) — прокрутка должна
    // остаться внутри её рамки.
    const scrollable = await box.first().evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(scrollable, "таблица помещается — проверка потеряла смысл").toBe(true);
    await expectNoOverflow(page, "политика cookie с таблицей");
  });

  test("оглавление документа на телефоне не занимает экран", async ({ page }) => {
    await page.goto("/legal/privacy/");
    // Колонка с оглавлением на узком экране скрыта намеренно: разделов два
    // десятка, и на телефоне она отодвинула бы сам текст на второй экран.
    await expect(page.locator("nav").filter({ hasText: "В документе" })).toBeHidden();
    await expect(page.locator("article section").first()).toBeVisible();
  });
});
