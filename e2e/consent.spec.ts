import { expect, test } from "@playwright/test";
import { CONSENT_KEY, phrase } from "./helpers";

/**
 * Согласия: баннер cookie и галочки под формами.
 *
 * Здесь единственное место, где баннер не глушится заранее, — его и проверяем.
 * Смысл проверок не в том, что «баннер появился», а в том, что выбор человека
 * действительно записан и переживает перезагрузку, а форма без согласия не
 * отправляется.
 */

const BAR = /Уклад использует cookie/;

/** Что записано в хранилище выбора. */
const choice = (page: import("@playwright/test").Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), CONSENT_KEY);

test.describe("Cookie и согласия", () => {
  test("баннер приходит к новому посетителю", async ({ page }) => {
    await page.goto("/");
    // Появляется с задержкой — ждём дольше самой задержки, но не бесконечно.
    await expect(page.getByText(BAR)).toBeVisible({ timeout: 8000 });

    // До выбора в хранилище ничего нет: баннер, записывающий согласие сам,
    // за себя же и расписался бы.
    expect(await choice(page)).toBeNull();
  });

  test("отказ стоит одного клика и запоминается", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Только необходимые" }).click();

    await expect(page.getByText(BAR)).toBeHidden();
    expect(await choice(page)).toBe("necessary");

    await page.reload();
    // Возвращаемся — баннера быть не должно даже после задержки появления.
    await expect(page.getByText(BAR)).toBeHidden({ timeout: 4000 });
  });

  test("согласие записывается отдельным значением", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Принять все" }).click();

    await expect(page.getByText(BAR)).toBeHidden();
    expect(await choice(page)).toBe("all");
  });

  test("«Подробнее» открывает политику, не убирая выбор с экрана", async ({ page }) => {
    await page.goto("/");
    // Ссылка, а не кнопка: «Подробнее» ведёт на страницу, и робот, читающий
    // баннер, обязан найти оттуда дорогу в саму политику.
    await page.getByRole("link", { name: "Подробнее" }).click();

    await expect(page).toHaveURL(/\/legal\/cookies\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/cookie/i);
    // Человек ушёл читать документ именно затем, чтобы решить: кнопки выбора
    // обязаны ждать его на той же странице.
    await expect(page.getByText(BAR)).toBeVisible();
    expect(await choice(page)).toBeNull();
  });

  test("решение можно пересмотреть из подвала", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Только необходимые" }).click();
    await expect(page.getByText(BAR)).toBeHidden();

    // По роли: `footer` есть и у карточек складов на лендинге.
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await footer.getByRole("button", { name: "Настройки cookie" }).click();

    await expect(page.getByText(BAR)).toBeVisible();
    await page.getByRole("button", { name: "Принять все" }).click();
    expect(await choice(page)).toBe("all");
  });

  test("форма контактов не отправится без согласия на обработку данных", async ({ page }) => {
    await page.goto("/contacts/");
    const form = page.locator("form");
    await form.scrollIntoViewIfNeeded();

    await form.getByPlaceholder("Имя").fill("Кирилл");
    await form.getByPlaceholder("+7 900 000-00-00").fill("kirill@example.com");
    await form.locator("textarea").fill("1 200 SKU, Wildberries и Ozon, склад в Подмосковье");

    // Подпись кнопки — «Написать письмо»: пока приёмник заявок не настроен
    // (`VITE_LEADS_ENDPOINT` пуст), форма не притворяется работающей, а честно
    // открывает письмо. Если переменную однажды зададут, здесь будет
    // «Отправить» — и тест на это и укажет, а не промолчит.
    const send = form.getByRole("button", { name: "Написать письмо" });
    await expect(send).toBeDisabled();
    // Прямо об этом и написано под кнопкой — обещание должно совпадать с делом.
    await expect(form).toContainText(
      phrase("заранее проставленная галочка согласием не считается"),
    );

    // Рекламная галочка ничего не разблокирует: согласия разные и раздельные.
    await form.getByRole("checkbox").nth(1).check();
    await expect(send).toBeDisabled();

    await form.getByRole("checkbox").first().check();
    await expect(send).toBeEnabled();
    // Что произойдёт по нажатию, написано до нажатия, а не после.
    await expect(form).toContainText(phrase("Отправить его нужно самому"));

    await send.click();
    await expect(form.getByRole("button", { name: "Письмо открыто" })).toBeVisible();
    await expect(form).toContainText(phrase("Проверьте, что оно ушло"));
  });

  test("ссылка в подписи к галочке ведёт в документ", async ({ page }) => {
    await page.goto("/contacts/");
    const form = page.locator("form");
    await form.scrollIntoViewIfNeeded();

    // Документ открывается в новой вкладке — и это здесь не придирка к
    // разметке, а суть проверки: заявка заполнена наполовину, и уход на
    // согласие в этой же вкладке стёр бы всё напечатанное. Поэтому ждём
    // именно всплывшую вкладку, а не смену адреса у текущей.
    const [doc] = await Promise.all([
      page.waitForEvent("popup"),
      form.getByRole("link", { name: "согласие на обработку персональных данных" }).click(),
    ]);

    await expect(doc).toHaveURL(/\/legal\/consent\/$/);
    await expect(doc.getByRole("heading", { level: 1 })).toHaveText(
      "Согласие на обработку персональных данных",
    );
    // Исходная вкладка остаётся на форме — вернуться есть куда.
    await expect(page).toHaveURL(/\/contacts\/$/);
  });

  test("галочка ловит клик по нарисованному квадратику", async ({ page }) => {
    await page.goto("/contacts/");
    const form = page.locator("form");
    await form.scrollIntoViewIfNeeded();

    const box = form.getByRole("checkbox").first();
    await expect(box).not.toBeChecked();
    // Настоящий `input` прозрачный и лежит поверх нарисованного квадрата.
    // `check()` целится в него сам, а человек целится в квадрат — проверяем
    // именно попадание по квадрату, иначе рассинхрон слоёв никто не заметит.
    // Подпись поля («Как к вам обращаться») — тоже `label`, поэтому отбираем
    // только те, внутри которых есть галочка.
    await form.locator("label:has(input[type=checkbox])").first().locator("span").first().click();
    await expect(box).toBeChecked();
  });
});
