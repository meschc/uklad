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
  ["/sellers/", "страница селлера"],
  ["/market/", "витрина"],
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

  test("фильтры витрины прячутся в шторку", async ({ page }) => {
    await page.goto("/market/");
    // Колонки фильтров на телефоне нет — есть кнопка, открывающая шторку.
    await page.getByRole("button", { name: /^Фильтры/ }).click();
    await expect(page.getByRole("button", { name: /^Показать \d+$/ })).toBeVisible();

    await page.getByRole("button", { name: "Проверенные Укладом" }).click();
    // Счётчик на кнопке подтверждения обновляется до применения — человек
    // видит, к чему приведёт выбор, ещё не закрыв шторку.
    await page.getByRole("button", { name: /^Показать \d+$/ }).click();
    await expect(page.getByRole("button", { name: /^Фильтры · \d+$/ })).toBeVisible();
    await expectNoOverflow(page, "витрина после отбора");
  });

  test("страница склада на телефоне не едет вбок и отпускает обратно", async ({ page }) => {
    await page.goto("/market/");
    await page.locator('a[href^="/warehouse/"]').first().click();

    await expect(page).toHaveURL(/\/warehouse\/w-\d+\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoOverflow(page, "страница склада");

    await page.getByRole("link", { name: "Все склады" }).click();
    await expect(page).toHaveURL(/\/market\/$/);
  });

  /**
   * Строчный контрол — пилюля. Ломается это не вбок, а вверх: текст не влез в
   * ширину, перенёсся на вторую строку, и полностью скруглённый блок высотой в
   * две строки перестал быть пилюлей — стал овалом с дыркой посередине.
   * Габаритная проверка выше такое пропускает: за край ничего не выехало.
   *
   * Порог 44 точки — это одна строка с полями по вертикали с запасом; вторая
   * строка любого из этих контролов сразу даёт за пятьдесят.
   */
  test("строчные пилюли не разъезжаются на две строки", async ({ page }) => {
    const PILL_MAX_HEIGHT = 44;

    await page.goto("/");
    const chip = page.getByRole("link", { name: /взгляд с вашей стороны/ });
    await expect(chip).toBeVisible();
    const chipBox = await chip.boundingBox();
    expect(
      chipBox?.height,
      "объявление в шапке героя переносится — подрежьте копию",
    ).toBeLessThanOrEqual(PILL_MAX_HEIGHT);

    await page.goto("/market/");
    for (const name of ["Списком", "Карта"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box?.height, `переключатель «${name}» переносится`).toBeLessThanOrEqual(
        PILL_MAX_HEIGHT,
      );
    }
  });
});
