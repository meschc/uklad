import { expect, test } from "@playwright/test";
import { acceptCookies, expectNoOverflow, scrollTo } from "./helpers";

/**
 * Главная глазами склада, который пришёл первый раз. С 21 окт на главной
 * открывается страница для складов (Кирилл: «главная сейчас это то, что для
 * складов»); прежняя главная для селлеров на паузе.
 */
test.describe("Главная", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/");
  });

  test("первый экран объясняет, что это", async ({ page }) => {
    await expect(page).toHaveTitle(/Уклад/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "систему управления складом",
    );
  });

  test("все секции страницы на месте", async ({ page }) => {
    for (const id of ["inside", "tariffs", "faq", "connect"]) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });

  test("из подвала можно перейти на другую страницу и попасть в её начало", async ({ page }) => {
    // Каталог складов скрыт до запуска (26 окт): переход проверяем на «Контактах».
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await footer.getByRole("link", { name: "Контакты" }).click();

    await expect(page).toHaveURL(/\/contacts\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Контакты");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });

  test("якорь «Тарифы» доводит до секции и не уводит со страницы", async ({ page }) => {
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await footer.getByRole("link", { name: "Тарифы" }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => document.getElementById("tariffs")!.getBoundingClientRect().top),
      )
      .toBeLessThan(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "систему управления складом",
    );
  });

  test("подвал раскрывает владельца сайта", async ({ page }) => {
    // По роли, а не по тегу: у карточек свои `<footer>`.
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    // Владелец — самозанятый: ИНН физлица двенадцатизначный, ОГРНИП нет
    // (см. `src/site/data/org.ts`).
    await expect(footer).toContainText(/ИНН \d{12}\b/);
    await expect(footer).toContainText("Самозанятый (плательщик НПД)");
    await expect(footer).not.toContainText("ОГРНИП");
  });

  test("страница не едет вбок", async ({ page }) => {
    await scrollTo(page, 100_000);
    await expectNoOverflow(page, "главная");
  });
});
