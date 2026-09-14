import { expect, test } from "@playwright/test";
import { acceptCookies, phrase } from "./helpers";

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
      await page.goto(`/legal/${slug}/`);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      // Основание и дата редакции — без них документ невозможно датировать.
      // Через `phrase`: типографика склеивает «от» с датой неразрывным
      // пробелом, и голая регулярка с обычным пробелом фразу не находит.
      await expect(page.getByText(phrase("Редакция от"))).toBeVisible();
      // Заголовок вкладки отличает документы друг от друга в истории браузера.
      await expect(page).toHaveTitle(/ — Уклад$/);
      // Разделы, а не одна простыня текста.
      expect(await page.locator("article section").count()).toBeGreaterThan(1);
    });
  }

  test("указатель перечисляет все семь документов и ведёт в каждый", async ({ page }) => {
    await page.goto("/legal/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Правовая информация");
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(DOCS.length);

    for (const [slug, title] of DOCS) {
      await page.goto("/legal/");
      // Клик по заголовку карточки, а не по кнопке с этим текстом: в подвале
      // рядом висит ссылка с тем же названием документа.
      await page.getByRole("heading", { level: 2, name: title }).click();
      await expect(page).toHaveURL(new RegExp(`/legal/${slug}/$`));
    }
  });

  test("список документов открывается из подвала", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    // Ссылка, а не кнопка: подвал — карта сайта для робота, и всё, что ведёт
    // на страницу, обязано быть настоящей ссылкой. Рядом стоит кнопка
    // «Настройки cookie» — от неё спасает точное имя.
    await footer.getByRole("link", { name: "Cookie", exact: true }).click();

    await expect(page).toHaveURL(/\/legal\/cookies\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/cookie/i);
  });

  test("оглавление прокручивает документ и оставляет ссылку на пункт", async ({ page }) => {
    test.skip(test.info().project.name === "mobile", "Оглавление намеренно скрыто на узком экране");

    await page.goto("/legal/privacy/");
    const toc = page.locator("nav").filter({ hasText: "В документе" });
    // Ссылки, а не кнопки: на пункт договора ссылаются в переписке, и
    // оглавление, из которого нельзя скопировать адрес пункта, бесполезно
    // ровно там, где оно нужнее всего.
    const item = toc.getByRole("link").nth(2);
    const title = (await item.innerText()).trim();
    const anchor = (await item.getAttribute("href"))!;
    await item.click();

    // Страница остаётся той же — меняется только хвост адреса. Перезагрузки
    // здесь быть не должно: документ длинный, и прыжок к пункту не повод
    // выкачивать его заново.
    await expect(page).toHaveURL(new RegExp(`/legal/privacy/${anchor}$`));
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

  test("поиск подсвечивает найденное и ведёт в раздел, ничего не пряча", async ({ page }) => {
    await page.goto("/legal/privacy/");

    // Поиск есть на любом экране, в отличие от оглавления: документ по ссылке
    // из письма чаще всего открывают с телефона.
    const search = page.getByRole("search");
    await expect(search).toBeVisible();

    const sections = page.locator("article section");
    const before = await sections.count();

    await page.getByRole("searchbox").fill("срок хранения");
    await expect(page.locator("mark").first()).toBeVisible();
    // Главное в этом тесте: документ остался целым. Поиск, который прячет
    // разделы без совпадений, отдаёт человеку половину правового текста как
    // целый — и человек об этом не узнает.
    await expect(sections).toHaveCount(before);

    const hit = search.getByRole("link", { name: /Сроки обработки и хранения/ });
    await hit.click();
    await expect(page).toHaveURL(/\/legal\/privacy\/#terms-storage$/);
    await expect
      .poll(async () =>
        page.evaluate(() => document.getElementById("terms-storage")!.getBoundingClientRect().top),
      )
      .toBeLessThan(250);
  });

  test("подсветка поиска на бумагу не уходит", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Печать не зависит от ширины экрана");

    await page.goto("/legal/privacy/");
    await page.getByRole("searchbox").fill("срок хранения");
    await expect(page.locator("mark").first()).toBeVisible();

    await page.emulateMedia({ media: "print" });

    // Распечатка с жёлтыми пятнами по тексту выглядит как правленая редакция
    // договора — а это тот самый файл, который человек приложит к переписке.
    // Поле поиска с листа уходит вместе с остальной обвязкой.
    const fill = await page
      .locator("mark")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fill).toBe("rgba(0, 0, 0, 0)");
    await expect(page.getByRole("search")).toBeHidden();
  });

  test("реквизиты владельца раскрыты на каждой правовой странице", async ({ page }) => {
    for (const [slug] of DOCS) {
      await page.goto(`/legal/${slug}/`);
      // По роли, а не по тегу `footer`: у карточек на других страницах свои
      // подвалы, и общий селектор ловил бы их заодно.
      const footer = page.getByRole("contentinfo");
      // Формат, а не конкретные цифры: тест должен пережить подстановку
      // настоящих реквизитов вместо заглушек в src/site/data/org.ts. Формат
      // предпринимательский — ИНН из двенадцати цифр и ОГРНИП из пятнадцати.
      await expect(footer).toContainText(/ИНН \d{12}\b/);
      await expect(footer).toContainText(/ОГРНИП \d{15}\b/);
      await expect(footer).toContainText("Уклад");
    }
  });

  test("пока реквизиты учебные, об этом сказано прямо", async ({ page }) => {
    await page.goto("/legal/privacy/");
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

  test("документ уходит на печать целиком, без интерфейса вокруг", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Печать не зависит от ширины экрана");

    await page.goto("/legal/privacy/");
    await page.emulateMedia({ media: "print" });

    // Ради чего тест написан. Общий `src/index.css` когда-то нёс правило
    // приложения «спрятать всё, кроме `.print-root`»; на витрине такого блока
    // нет, и «Скачать PDF» отдавал пустые листы — на экране всё было на месте,
    // так что баг не показывался ничем, кроме бумаги. Теперь печать
    // приложения живёт в `src/print.css` и в бандл витрины не попадает.
    await expect(page.locator("article")).toBeVisible();
    await expect(page.locator("article h2").first()).toBeVisible();

    // На лист уходит документ, а не обвязка: шапка, подвал и панель с кнопками
    // печати скрыты, оглавление тоже — в распечатке ссылки бесполезны.
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(page.getByRole("contentinfo")).toBeHidden();
    await expect(page.getByRole("button", { name: /Скачать PDF/i })).toBeHidden();
  });

  test("из документа можно вернуться на лендинг к нужной секции", async ({ page }) => {
    await page.goto("/legal/terms/");
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await footer.getByRole("link", { name: "Вопросы" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText("который видно насквозь");
    await expect
      .poll(async () =>
        page.evaluate(() => document.getElementById("faq")!.getBoundingClientRect().top),
      )
      .toBeLessThan(200);
  });
});
