import { expect, test } from "@playwright/test";
import { acceptCookies, expectNoOverflow, phrase, scrollTo } from "./helpers";

/**
 * Лендинг глазами селлера, который пришёл первый раз: понял, куда попал, дошёл
 * до витрины и, если захотел, — до демо.
 */
test.describe("Лендинг", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
    await page.goto("/");
  });

  test("первый экран объясняет, что это", async ({ page }) => {
    await expect(page).toHaveTitle(/Уклад/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "который видно насквозь",
    );
    // Обещание бесплатного входа — часть оффера, а не украшение. Формулировка
    // именно такая: платные дополнения на витрине есть, и «бесплатно для
    // селлера» вообще было бы обещанием, которого страница «Тарифы» не держит.
    await expect(
      page.getByText(phrase("заявка на склад ничего не стоит")),
    ).toBeVisible();
  });

  test("все секции лендинга на месте", async ({ page }) => {
    for (const id of ["how", "product", "warehouses", "operators", "faq"]) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });

  test("логотипы площадок загрузились, а не отвалились в монограмму", async ({
    page,
    request,
  }) => {
    const caption = page.getByText("Отгрузка на площадки");
    await caption.scrollIntoViewIfNeeded();
    await expect(caption).toBeVisible();

    // Битый файл рисуется молча: onError в BrandMark подменяет картинку
    // монограммой, и на глаз пропажа не видна. Знаки висят на loading="lazy",
    // поэтому сначала ждём, пока лента догрузится в кадре.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              [...document.querySelectorAll<HTMLImageElement>('img[src*="/brands/"]')]
                .filter((img) => img.complete && img.naturalWidth > 0).length,
          ),
        { message: "ни один знак площадки не загрузился" },
      )
      // Сколько именно знаков успеет догрузиться — зависит от ширины экрана:
      // на телефоне в кадр ленты помещается втрое меньше, чем на десктопе.
      // Проверка не про количество, а про то, что файлы живые, — ниже.
      .toBeGreaterThanOrEqual(3);

    const broken = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('img[src*="/brands/"]')]
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.getAttribute("src")!),
    );
    expect(broken).toEqual([]);

    // Остальные знаки до экрана могут не доехать — но файл, на который они
    // ссылаются, обязан существовать в сборке.
    const srcs = await page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll<HTMLImageElement>('img[src*="/brands/"]')].map(
          (img) => img.getAttribute("src")!,
        ),
      ),
    ]);
    for (const src of srcs) {
      const res = await request.get(src);
      expect(res.status(), `${src} не отдаётся`).toBe(200);
    }
  });

  test("«Подобрать склад» ведёт на витрину и с самого верха", async ({ page }) => {
    // Прокручиваем вниз: кнопка в шапке работает из любого места страницы, и
    // именно оттуда её обычно и нажимают.
    await scrollTo(page, 2000);
    await page.getByRole("button", { name: "Подобрать склад" }).first().click();

    await expect(page).toHaveURL(/#\/market$/);
    await expect(page.getByRole("heading", { name: "Склады для фулфилмента" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });

  test("якорь «Как это работает» доводит до секции", async ({ page }) => {
    await page.getByRole("link", { name: "Как это работает" }).click();
    await expect
      .poll(async () =>
        page.evaluate(() => document.getElementById("how")!.getBoundingClientRect().top),
      )
      .toBeLessThan(200);
    // Роутер не должен принять якорь за адрес страницы и увести на витрину.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "который видно насквозь",
    );
  });

  test("вход в демо WMS остался ровно один — в подвале", async ({ page }) => {
    // Их было четыре: шапка, финал лендинга, блок для складов и подвал. Демо
    // — не то, за чем на сайт приходит селлер, и четыре двери в него делили
    // внимание с единственным нужным действием.
    const links = page.getByRole("link", { name: /Демо WMS/ });
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAttribute("href", /\/app\/$/);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: /Демо WMS/ })).toBeVisible();
  });

  test("подвал раскрывает владельца сайта и природу данных", async ({ page }) => {
    // По роли, а не по тегу: у карточек складов свои `<footer>`, и `locator`
    // по тегу ловит их вместе с подвалом страницы.
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toContainText(/ИНН \d{10}/);
    await expect(footer).toContainText(/ОГРН \d{13}/);
    // Оговорка о характере данных на сайте ровно одна и живёт в подвале —
    // проверяем, что она не потерялась при правках копирайта.
    await expect(footer).toContainText(
      phrase("остатки на витрине — демонстрационные"),
    );
  });

  test("страница не едет вбок", async ({ page }) => {
    await scrollTo(page, 100_000);
    await expectNoOverflow(page, "лендинг");
  });
});
