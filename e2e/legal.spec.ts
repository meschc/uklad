import { expect, test } from "@playwright/test";
import { acceptCookies } from "./helpers";

/**
 * Правовой контур. Проверяется не «текст красивый», а то, ради чего он вообще
 * есть: документ открывается по прямой ссылке, обязательное раскрытие видно, и
 * ни одна из этих страниц не выкидывает человека обратно на лендинг.
 */

/** Слаг документа и заголовок, под которым он обязан открыться. */
const DOCS: [slug: string, title: string][] = [
  ["requisites", "Сведения о владельце сайта и агрегатора"],
  ["terms", "Пользовательское соглашение"],
  ["offer", "Публичная оферта на предоставление доступа к сервису «Уклад»"],
  ["privacy", "Политика в отношении обработки персональных данных"],
  ["consent", "Согласие на обработку персональных данных"],
  ["cookies", "Политика использования файлов cookie"],
  ["recommendations", "Правила применения рекомендательных технологий"],
];

test.describe("Правовая информация", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
  });

  for (const [slug, title] of DOCS) {
    test(`документ /${slug} открывается по прямой ссылке`, async ({ page }) => {
      await page.goto(`/#/legal/${slug}`);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      // Основание и дата редакции — без них документ невозможно датировать.
      await expect(page.getByText(/Редакция от /)).toBeVisible();
      // Заголовок вкладки отличает документы друг от друга в истории браузера.
      await expect(page).toHaveTitle(/ — Уклад$/);
      // Разделы, а не одна простыня текста.
      expect(await page.locator("article section").count()).toBeGreaterThan(1);
    });
  }

  test("указатель перечисляет все семь документов и ведёт в каждый", async ({ page }) => {
    await page.goto("/#/legal");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Правовая информация");
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(DOCS.length);

    for (const [slug, title] of DOCS) {
      await page.goto("/#/legal");
      // Клик по заголовку карточки, а не по кнопке с этим текстом: в подвале
      // рядом висит ссылка с тем же названием документа.
      await page.getByRole("heading", { level: 2, name: title }).click();
      await expect(page).toHaveURL(new RegExp(`#/legal/${slug}$`));
    }
  });

  test("список документов открывается из подвала", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await footer.getByRole("button", { name: "Cookie", exact: true }).click();

    await expect(page).toHaveURL(/#\/legal\/cookies$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/cookie/i);
  });

  test("оглавление прокручивает документ, а не уводит с него", async ({ page }) => {
    test.skip(
      test.info().project.name === "mobile",
      "Оглавление намеренно скрыто на узком экране",
    );

    await page.goto("/#/legal/privacy");
    const toc = page.locator("nav").filter({ hasText: "В документе" });
    const item = toc.getByRole("button").nth(2);
    const title = (await item.innerText()).trim();
    await item.click();

    // Хэш обязан остаться адресом документа: `href="#раздел"` увёл бы роутер
    // на лендинг — ровно та ловушка, ради которой оглавление сделано кнопками.
    await expect(page).toHaveURL(/#\/legal\/privacy$/);
    await expect
      .poll(async () =>
        page.evaluate(
          (t) =>
            [...document.querySelectorAll("article section h2")]
              .find((h) => h.textContent?.trim() === t)!
              .getBoundingClientRect().top,
          title,
        ),
      )
      .toBeLessThan(250);
  });

  test("реквизиты владельца раскрыты на каждой правовой странице", async ({ page }) => {
    for (const [slug] of DOCS) {
      await page.goto(`/#/legal/${slug}`);
      // По роли, а не по тегу `footer`: у карточек на других страницах свои
      // подвалы, и общий селектор ловил бы их заодно.
      const footer = page.getByRole("contentinfo");
      // Формат, а не конкретные цифры: тест должен пережить подстановку
      // настоящих реквизитов вместо заглушек в src/site/data/org.ts.
      await expect(footer).toContainText(/ИНН \d{10}/);
      await expect(footer).toContainText(/ОГРН \d{13}/);
      await expect(footer).toContainText("Уклад");
    }
  });

  test("пока реквизиты учебные, об этом сказано прямо", async ({ page }) => {
    await page.goto("/#/legal/privacy");
    // Оговорка живёт в подвале и снимается флагом ORG.filled. Если её нет —
    // значит подставлены настоящие реквизиты, и это тоже правильное
    // состояние. Раньше на месте оговорки стояла жёлтая полоса поверх каждого
    // документа; её сняли — предупреждение о заглушках не должно быть первым,
    // что человек читает в правовом документе.
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    const note = footer.getByText(/реквизиты\s+в\s+документах\s+учебные/);
    const shown = await note.count();
    if (shown) await expect(note.first()).toBeVisible();
  });

  test("из документа можно вернуться на лендинг к нужной секции", async ({ page }) => {
    await page.goto("/#/legal/terms");
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await footer.getByRole("button", { name: "Вопросы" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "который видно насквозь",
    );
    await expect
      .poll(async () =>
        page.evaluate(() => document.getElementById("faq")!.getBoundingClientRect().top),
      )
      .toBeLessThan(200);
  });
});
