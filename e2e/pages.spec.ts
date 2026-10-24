import { expect, test, type Page } from "@playwright/test";
import { acceptCookies, phrase } from "./helpers";

/**
 * Ключевые страницы витрины — страховка от правок соседей.
 *
 * Витрину правят сразу несколько задач: одна переводит страницы в новый стиль,
 * другая трогает тарифы, третья — форму. Ломаются при этом не расчёты, а сами
 * страницы: падает скрипт, пропадает заголовок, отваливается форма. Здесь на
 * каждую из них — короткая проверка «открылась, видно главное, в консоли
 * чисто», чтобы такое падение было видно в PR, а не на сайте.
 */

/** Страница → кусок главного заголовка. Хватает куска: текст правят чаще разметки. */
const PAGES: [path: string, h1: string][] = [
  // С 21 окт на главной — страница для складов.
  ["/", "систему управления складом"],
  ["/warehouses/", "систему управления складом"],
  ["/pricing/", "Тарифы"],
  ["/roadmap/", "что Уклад сделает дальше"],
  ["/market/", "Склады для фулфилмента"],
  ["/sellers/", "Склад, с которым"],
  ["/contacts/", "Контакты"],
  ["/legal/", "Правовая информация"],
];

/** Текст `SiteErrorBoundary`: его появление и есть «страница упала». */
const SITE_CRASH = "Витрина не открылась";

/**
 * Ошибки страницы, собранные за время теста.
 *
 * Необработанное исключение и `console.error` — разные сигналы, но оба значат,
 * что что-то не доехало: битый модуль, ошибка React, отказ запроса.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

test.describe("Ключевые страницы", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
  });

  for (const [path, h1] of PAGES) {
    test(`${path} открывается без ошибок`, async ({ page }) => {
      const errors = collectErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      await expect(page.getByRole("heading", { level: 1 })).toContainText(phrase(h1));
      await expect(page.getByText(SITE_CRASH)).toHaveCount(0);
      expect(errors, "ошибки в консоли").toEqual([]);
    });
  }
});

/**
 * До запуска сайт закрыт от поиска (PR uklad#10): robots.txt запрещает всё, а
 * в каждой странице стоит `noindex`. Открыть сайт случайно — правкой шаблона
 * или предрендера — проще, чем кажется, а узнали бы об этом из выдачи.
 *
 * Проверяется ответ сервера, а не DOM после скриптов: именно его читает робот,
 * который скрипты не выполняет.
 */
test.describe("Закрыто от поиска", () => {
  // Сетевые проверки от ширины экрана не зависят — хватает одного проекта.
  test.skip(({ isMobile }) => !!isMobile, "Проверка ответа сервера, не экрана");

  test("robots.txt запрещает обход целиком", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(/^User-agent: \*\s*\nDisallow: \/\s*$/m);
  });

  test("каждая страница карты сайта отдаётся с noindex", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
    // Карта собирается из маршрутов витрины: опустела — значит, сломался
    // предрендер, и проверять дальше нечего.
    expect(paths.length).toBeGreaterThan(20);

    const open: string[] = [];
    for (const path of [...paths, "/app/", "/404.html"]) {
      const html = await (await request.get(path)).text();
      if (!/<meta name="robots" content="noindex/.test(html)) open.push(path);
    }
    expect(open, "страницы без noindex").toEqual([]);
  });
});

test.describe("Заявка склада на /warehouses/", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/warehouses/");
  });

  test("без согласия заявка не уходит, и причина сказана под кнопкой", async ({ page }) => {
    const form = page.locator("#connect form");
    await form.scrollIntoViewIfNeeded();
    await form.getByLabel("Имя").fill("Иван");
    await form.getByLabel("Как с вами связаться").fill("+7 900 000-00-00");

    // Подсказка о согласии — только после попытки (решение 19 окт).
    await expect(form.getByRole("alert")).toHaveCount(0);
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole("alert")).toContainText(phrase("Без него заявку не подать"));
    // Форма цела: введённое не потерялось.
    await expect(form.getByLabel("Имя")).toHaveValue("Иван");
  });

  test("способ учёта выбирается и снимается повторным нажатием", async ({ page }) => {
    const chip = page.locator("#connect").getByRole("button", { name: "1С", exact: true });
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("Дорожная карта", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/roadmap/");
  });

  test("доска из четырёх колонок по порядку", async ({ page }) => {
    const columns = page.getByRole("heading", {
      name: /^(Обсуждаем|Запланировали|Делаем|Готово)$/,
    });
    await expect(columns).toHaveText(["Обсуждаем", "Запланировали", "Делаем", "Готово"]);
  });

  test("идея открывается своим адресом и закрывается «назад»", async ({ page }) => {
    const card = page.locator('a[href^="#idea-"]').first();
    const title = (await card.innerText()).trim();
    await card.click();

    await expect(page).toHaveURL(/#idea-.+$/);
    // Окно ищем по его заголовку: у `DialogShell` нет `role="dialog"`, а
    // на карточке тот же текст стоит заголовком четвёртого уровня.
    const heading = page.getByRole("heading", { level: 2, name: title });
    await expect(heading).toBeVisible();

    // Та же ссылка, присланная коллеге, открывает то же окно.
    await page.reload();
    await expect(heading).toBeVisible();

    await page.goBack();
    await expect(heading).toHaveCount(0);
  });
});
