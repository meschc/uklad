import { expect, test } from "@playwright/test";

/**
 * Демо WMS по адресу `/app/`.
 *
 * Главное, что здесь проверяется, — что второй вход сборки вообще жив:
 * витрина и приложение собираются двумя разными `input` в vite.config, и
 * отвалившийся `/app/` на лендинге ничем себя не выдаёт. Дальше — короткий
 * маршрут «список складов → склад → раздел», на котором ломается навигация.
 */

const CRASH = "Этот экран сломался";

test.describe("Демо WMS", () => {
  // Рельс разделов фиксированной ширины, масштабирование в app/index.html
  // запрещено — редактор плана изначально десктопный, и гонять его в Pixel 7
  // значит проверять не то, чем он является.
  test.skip(({ isMobile }) => !!isMobile, "Редактор плана рассчитан на десктоп");

  test("приложение отдаётся сборкой и открывается на списке складов", async ({ page }) => {
    await page.goto("/app/");

    // Хвост заголовка, а не весь: спереди к нему приписывается счётчик
    // непрочитанных сообщений — см. отдельную проверку ниже.
    await expect(page).toHaveTitle(/Уклад — редактор плана склада$/);
    await expect(page.getByRole("heading", { name: "Склады" })).toBeVisible();
    await expect(page.getByText("Выберите склад для работы")).toBeVisible();
    expect(await warehouseCards(page).count()).toBeGreaterThan(0);
    await expect(page.getByText(CRASH)).toHaveCount(0);
  });

  test("непрочитанные сообщения видны, не открывая вкладку", async ({ page }) => {
    await page.goto("/app/");

    // Демо-переписка раздаётся при входе в кабинет, и непрочитанное в ней есть
    // всегда; сколько именно — дело сида, поэтому проверяем число, а не пятёрку.
    await expect(page).toHaveTitle(/^\(\d+\) Уклад/);

    // Иконка с бейджем собирается из настоящей `/favicon.svg` уже в браузере:
    // в jsdom этого не проверить, а молча не доехать она может только здесь.
    const icon = page.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(icon).toHaveAttribute("href", /^data:image\/svg\+xml/);
  });

  test("демо закрыто от поисковиков", async ({ page }) => {
    await page.goto("/app/");
    // Демо с выдуманными данными не должно всплывать в выдаче вместо
    // лендинга — за это отвечает единственная строка в app/index.html.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("склад открывается карточкой и приводит рельс разделов", async ({ page }) => {
    await page.goto("/app/");
    await warehouseCards(page).first().click();

    const rail = page.getByRole("navigation", { name: "Разделы" });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("button", { name: "План склада" })).toBeVisible();
    await expect(page.getByText(CRASH)).toHaveCount(0);
  });

  test("группа рельса раскрывается и ведёт на экран", async ({ page }) => {
    await page.goto("/app/");
    await warehouseCards(page).first().click();

    const rail = page.getByRole("navigation", { name: "Разделы" });
    // `exact`: иначе «Склад» поймает и соседний пункт «План склада».
    const group = rail.getByRole("button", { name: "Склад", exact: true });
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await group.click();
    await expect(group).toHaveAttribute("aria-expanded", "true");

    await rail.getByRole("button", { name: "Интеграции" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Интеграции");
    // Подменю обязано закрыться: раскрытым оно перекрывает половину экрана.
    await expect(group).toHaveAttribute("aria-expanded", "false");
  });

  test("знаки внешних систем на месте, а не отвалились в монограммы", async ({ page, request }) => {
    await page.goto("/app/");
    await warehouseCards(page).first().click();
    await page
      .getByRole("navigation", { name: "Разделы" })
      .getByRole("button", {
        name: "Склад",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Интеграции" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Интеграции");

    const marks = page.locator('img[src*="/brands/"]');
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              [...document.querySelectorAll<HTMLImageElement>('img[src*="/brands/"]')].filter(
                (img) => img.complete && img.naturalWidth > 0,
              ).length,
          ),
        { message: "ни один знак системы не загрузился" },
      )
      .toBeGreaterThan(5);

    // Битый файл рисуется монограммой молча — на глаз это выглядит как
    // «у этой системы просто нет логотипа».
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('img[src*="/brands/"]')]
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.getAttribute("src")!),
    );
    expect(broken).toEqual([]);

    const srcs = [
      ...new Set(await marks.evaluateAll((els) => els.map((el) => el.getAttribute("src")!))),
    ];
    for (const src of srcs) {
      expect((await request.get(src)).status(), `${src} не отдаётся`).toBe(200);
    }
  });

  test("продавцу показывают его набор экранов, а не складской", async ({ page }) => {
    await page.goto("/app/");
    await page
      .getByRole("group", { name: "Роль" })
      .getByRole("button", {
        name: "Продавец",
      })
      .click();

    // Смена роли сама уводит на «свой» старт: держать продавца на складском
    // экране, который ему нельзя, было бы хуже, чем перевести его сразу.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Кабинет продавца");

    const rail = page.getByRole("navigation", { name: "Разделы" });
    await expect(rail.getByRole("button", { name: "Остатки и заявки" })).toBeVisible();
    // Приёмка и сборка — работа склада; продавцу в них делать нечего, и
    // группы «Работа» у него в рельсе нет вовсе.
    await expect(rail.getByRole("button", { name: "Работа" })).toHaveCount(0);
    await expect(rail.getByRole("button", { name: "Печать" })).toHaveCount(0);

    // План склада продавцу виден — но только на чтение (п.26).
    await rail.getByRole("button", { name: "План склада" }).click();
    await expect(page.getByText(CRASH)).toHaveCount(0);
  });

  /**
   * Экран кабинета — в адресе.
   *
   * Раньше `?role=&view=` читались один раз при запуске и обратно не писались:
   * скопированный из строки адрес открывал у коллеги не тот экран, а «назад»
   * уводило с сайта, потому что за весь поход по рельсу в истории не
   * появлялось ни одной записи.
   */
  test.describe("Прямая ссылка на экран", () => {
    test("открытый экран попадает в адрес и открывается из него", async ({ page }) => {
      await page.goto("/app/");
      await page.getByRole("heading", { name: "Склады" }).waitFor();
      // Первая запись — заменой: она приводит адрес к тому, что и так на
      // экране, и лишним шагом истории быть не должна.
      await expect(page).toHaveURL(/\/app\/\?role=\w+&view=dashboard$/);

      await openIntegrations(page);
      await expect(page).toHaveURL(/view=integrations$/);

      // Тот же адрес с нуля — тот же экран, а не тот, с которого начинали.
      const url = page.url();
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Интеграции");
      await expect(page.getByText(CRASH)).toHaveCount(0);
    });

    test("«назад» возвращает на предыдущий экран, а не уводит с сайта", async ({ page }) => {
      await page.goto("/app/");
      await warehouseCards(page).first().click();
      await expect(page).toHaveURL(/view=editor$/);

      const rail = page.getByRole("navigation", { name: "Разделы" });
      await rail.getByRole("button", { name: "Склад", exact: true }).click();
      await rail.getByRole("button", { name: "Интеграции" }).click();
      await expect(page).toHaveURL(/view=integrations$/);

      await page.goBack();
      await expect(page).toHaveURL(/view=editor$/);
      await expect(rail.getByRole("button", { name: "План склада" })).toBeVisible();
      await expect(page.getByText(CRASH)).toHaveCount(0);

      // Ещё шаг назад — на список складов, то есть туда, откуда пришли.
      await page.goBack();
      await expect(page).toHaveURL(/view=dashboard$/);
      await expect(page.getByRole("heading", { name: "Склады" })).toBeVisible();
    });
  });

  test("логотип рельса возвращает в кабинет", async ({ page }) => {
    await page.goto("/app/");
    await warehouseCards(page).first().click();

    const rail = page.getByRole("navigation", { name: "Разделы" });
    await rail.getByRole("button", { name: "На главную" }).click();

    await expect(page.getByRole("heading", { name: "Склады" })).toBeVisible();
    // Кабинет — уровень выше склада, рельса на нём быть не должно.
    await expect(rail).toHaveCount(0);
  });
});

/**
 * Карточки складов в кабинете.
 *
 * По слову «этаж»: у карточки нет ни заголовка, ни ярлыка, а её доступное имя
 * склеено из всего содержимого. Число этажей печатает только она — кнопка
 * «Новый склад» под это не подходит.
 */
function warehouseCards(page: import("@playwright/test").Page) {
  return page.getByRole("button").filter({ hasText: /\d+ этаж/ });
}

/** Путь «список складов → склад → Интеграции»: экран за двумя раскрытиями рельса. */
async function openIntegrations(page: import("@playwright/test").Page) {
  await warehouseCards(page).first().click();
  const rail = page.getByRole("navigation", { name: "Разделы" });
  await rail.getByRole("button", { name: "Склад", exact: true }).click();
  await rail.getByRole("button", { name: "Интеграции" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Интеграции");
}
