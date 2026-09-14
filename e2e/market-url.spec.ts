import { expect, test, type Page } from "@playwright/test";
import { acceptCookies, foundCount, openMarket, phrase } from "./helpers";

/** Карточки склада — те же, что и в основной спеке витрины. */
const cards = (page: Page) => page.locator('a[href^="/warehouse/"]');

/** На телефоне фильтры лежат в шторке, на широком экране — в колонке слева. */
async function openFilters(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) await page.getByRole("button", { name: /^Фильтры/ }).click();
}

/** Длина истории вкладки — по ней видно, сколько шагов оставил за собой отбор. */
const historyDepth = (page: Page) => page.evaluate(() => window.history.length);

/** То же, что `foundCount`, но на английской витрине: там другая подпись. */
async function englishCount(page: Page): Promise<number> {
  const text = await page
    .locator("p", { hasText: phrase("match your filters") })
    .first()
    .innerText();
  return Number(text.replace(/[^\d]/g, ""));
}

/**
 * Отбор витрины живёт в адресе.
 *
 * Проверяем не «параметр появился», а то, ради чего он появился: ссылку с
 * отбором можно переслать, «назад» снимает последнее условие вместо ухода с
 * витрины, а набор в строке поиска не превращает историю в кашу из шести
 * одинаковых шагов.
 */
test.describe("Отбор витрины в адресе", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
  });

  test("выбранный город попадает в адрес и открывается из него", async ({ page, isMobile }) => {
    await openMarket(page);
    await openFilters(page, isMobile);

    const all = await foundCount(page);
    await page.getByRole("combobox").filter({ hasText: "Все города" }).selectOption("Казань");

    await expect(page).toHaveURL(/\/market\/\?city=/);
    await expect.poll(() => foundCount(page)).toBeLessThan(all);
    const narrowed = await foundCount(page);

    // Тот же адрес, открытый с нуля, — то же, что человек видел перед тем, как
    // его скопировать. Это и есть весь смысл затеи.
    await page.goto(page.url());
    await expect.poll(() => foundCount(page)).toBe(narrowed);
    await expect(cards(page).first()).toContainText("Казань");
  });

  test("«назад» снимает последнее условие, а не уводит с витрины", async ({ page, isMobile }) => {
    await openMarket(page);
    await openFilters(page, isMobile);

    const all = await foundCount(page);
    await page.getByRole("button", { name: "Wildberries" }).click();
    await expect(page).toHaveURL(/mp=wildberries$/);
    const afterFirst = await foundCount(page);

    await page.getByRole("button", { name: "Lamoda" }).click();
    await expect(page).toHaveURL(/mp=wildberries,lamoda$/);

    // Шаг назад — минус одна площадка, а не выход на предыдущую страницу.
    await page.goBack();
    await expect(page).toHaveURL(/mp=wildberries$/);
    await expect.poll(() => foundCount(page)).toBe(afterFirst);

    await page.goBack();
    await expect(page).toHaveURL(/\/market\/$/);
    await expect.poll(() => foundCount(page)).toBe(all);
  });

  test("набор в строке поиска не забивает историю", async ({ page, isMobile }) => {
    await openMarket(page);
    await openFilters(page, isMobile);

    const before = await historyDepth(page);
    // По букве, а не разом: браузер считает записи в историю и после сотни за
    // полминуты начинает ругаться, а слово из шести букв — это шесть правок
    // отбора подряд.
    await page
      .getByRole("textbox", { name: "Название, город или улица" })
      .pressSequentially("Казань", { delay: 20 });

    await expect(page).toHaveURL(/[?&]q=/);
    expect(await historyDepth(page)).toBe(before);
  });

  test("метка рекламной кампании переживает клик по фильтру", async ({ page, isMobile }) => {
    await openMarket(page, "?utm_source=vk");
    await openFilters(page, isMobile);

    await page.getByRole("button", { name: "Wildberries" }).click();
    await expect(page).toHaveURL(/utm_source=vk/);
    await expect(page).toHaveURL(/mp=wildberries/);
  });

  test("переключение языка не теряет отбор", async ({ page }) => {
    await openMarket(page, "?mp=wildberries");
    const narrowed = await foundCount(page);

    // Смена языка — переход по другому адресу того же маршрута, и хвост с
    // отбором обязан переехать вместе с путём: иначе англичанин, которому
    // прислали ссылку на четыре склада, увидит все шестьдесят три.
    await page.getByRole("link", { name: "Switch to English" }).click();
    await expect(page).toHaveURL(/\/en\/market\/\?mp=wildberries$/);
    await expect.poll(() => englishCount(page)).toBe(narrowed);
  });

  test("мусор в адресе показывает каталог, а не пустоту", async ({ page }) => {
    // Адрес правят руками и режут при пересылке. Ответить на это пустой
    // витриной значит соврать: складов ровно столько же, сколько было.
    await openMarket(page, "?city=Атлантида&mp=нетакой&sort=подешевле");

    expect(await foundCount(page)).toBeGreaterThan(10);
    await expect(cards(page)).toHaveCount(12);
    await expect(page.getByText("Под такие условия склада нет")).toBeHidden();
  });
});
