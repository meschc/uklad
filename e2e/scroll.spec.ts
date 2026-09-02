import { expect, test } from "@playwright/test";
import { acceptCookies, openMarket } from "./helpers";

/**
 * Прокрутка витрины.
 *
 * Проверка нужна именно сквозная: плавность живёт не в коде, а в кадрах, и
 * юнит-тестом её не увидеть. Дважды подряд она ломалась молча — сначала своим
 * циклом, который принимал мышь за тачпад и отдавал её системе, потом
 * настройкой, обрезавшей цель по высоте прежней страницы. Оба раза сборка
 * была зелёной, а страница дёргалась.
 *
 * Только на широком экране: у тач-экранов инерция своя, мы её не подменяем
 * (`syncTouch` выключен), и проверять там нечего.
 */
test.describe("Прокрутка", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
  });

  test("колесо ведёт страницу, а не переносит рывком", async ({ page, isMobile }) => {
    test.skip(isMobile, "Плавную прокрутку колеса обещаем мыши, а не пальцу");

    // Заметно больше кадра прокрутки и заведомо меньше высоты лендинга: жест
    // должен целиком уместиться внутри страницы, иначе цель обрежется по её
    // концу и «недоезд» окажется правильным поведением.
    const DISTANCE = 600;
    // Мгновенный перенос — это ровно DISTANCE в первом же замере. Порог с
    // запасом: между жестом и замером проходит round-trip до браузера, и за
    // него страница успевает проехать часть пути честно.
    const STILL_MOVING = DISTANCE * 0.8;

    await page.goto("/");
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, DISTANCE);

    const started = await page.evaluate(() => window.scrollY);
    expect(started, "страница не тронулась с места").toBeGreaterThan(0);
    expect(started, "страницу перенесло рывком, без промежуточных кадров").toBeLessThan(
      STILL_MOVING,
    );

    // И доезжает туда, куда просили: плавность, которая останавливается на
    // полпути, — это не плавность, а потерянный жест.
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 3000 })
      .toBeGreaterThan(DISTANCE - 10);
  });

  /**
   * Доводки по секциям на лендинге нет и быть не должно.
   *
   * Её заводили дважды — сперва CSS-снапом, потом `lenis/snap` в самой мягкой
   * форме, — и оба раза снимали за одно и то же: страница подтягивается к
   * границе сама, и человек, который просто остановился почитать, видит, что
   * его подвинули. Тест держит именно это: где остановился — там и стоишь.
   */
  test("страница остаётся ровно там, где её остановили", async ({ page, isMobile }) => {
    test.skip(isMobile, "Колесо — про мышь, а не про палец");

    // Прокрутка порциями — как настоящим колесом: доводчик отмеряет свою
    // задержку от последнего щелчка, и одним длинным жестом его не поймать.
    const STEP = 100;
    const TOTAL = 900;
    // Заведомо больше любой задержки доводки: она включалась через полсекунды.
    const SETTLE_MS = 2500;

    await page.goto("/");
    await page.mouse.move(700, 450);
    for (let done = 0; done < TOTAL; done += STEP) {
      await page.mouse.wheel(0, STEP);
      await page.waitForTimeout(60);
    }

    await expect
      .poll(async () => page.evaluate(() => Math.round(window.scrollY)), { timeout: 2000 })
      .toBe(TOTAL);

    await page.waitForTimeout(SETTLE_MS);
    expect(
      await page.evaluate(() => Math.round(window.scrollY)),
      "страницу утащило от места, где человек остановился",
    ).toBe(TOTAL);
  });

  test("колесо над картой оставляет страницу на месте", async ({ page, isMobile }) => {
    test.skip(isMobile, "Карта во всю ширину раскрывается только на широком экране");

    await openMarket(page);
    await page.getByRole("button", { name: "Карта" }).click();
    const map = page.locator(".leaflet-container");
    await expect(map).toBeVisible();

    const before = await page.evaluate(() => window.scrollY);
    const box = await map.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, 400);

    // Колесом над картой меняют масштаб. Уехавшая при этом страница — не
    // мелкая неточность: карта уходит из виду прямо в момент, когда человек её
    // рассматривает.
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 1500 })
      .toBe(before);
  });
});
