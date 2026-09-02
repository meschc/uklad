import { expect, test, type Page } from "@playwright/test";
import { acceptCookies, foundCount, openMarket, phrase } from "./helpers";

/**
 * Карточки склада. Ищутся по адресу, а не по роли `article`: карточка — это
 * ссылка на страницу склада, потому что склады сравнивают, открывая их в
 * соседних вкладках.
 */
const cards = (page: Page) => page.locator('a[href^="#/warehouse/"]');

/**
 * Витрина: селлер сужает отбор, открывает карточку, шлёт заявку.
 *
 * Проверяем не «фильтр покрасился», а что число найденных складов меняется в
 * ожидаемую сторону: покрашенная кнопка при неработающем отборе — ровно та
 * ошибка, которую глазами не поймать.
 */
test.describe("Витрина складов", () => {
  test.beforeEach(async ({ page }) => {
    await acceptCookies(page);
    await openMarket(page);
  });

  test("каталог показывает склады и считает их", async ({ page }) => {
    expect(await foundCount(page)).toBeGreaterThan(10);
    // Первая страница — 12 карточек, остальное под «Показать ещё».
    await expect(cards(page)).toHaveCount(12);
  });

  test("«Показать ещё» дозагружает карточки", async ({ page }) => {
    const more = page.getByRole("button", { name: /Показать ещё/ });
    await more.scrollIntoViewIfNeeded();
    await more.click();
    await expect(cards(page)).toHaveCount(24);
  });

  test("фильтр по городу сужает выдачу", async ({ page, isMobile }) => {
    if (isMobile) await page.getByRole("button", { name: /^Фильтры/ }).click();

    const before = await foundCount(page);
    await page.getByRole("combobox").filter({ hasText: "Все города" }).selectOption("Казань");

    await expect.poll(() => foundCount(page)).toBeLessThan(before);
    expect(await foundCount(page)).toBeGreaterThan(0);

    if (isMobile) await page.getByRole("button", { name: /^Показать \d+$/ }).click();
    // Каждая карточка в выдаче — из выбранного города, а не «примерно оттуда».
    for (const card of await cards(page).all()) {
      await expect(card).toContainText("Казань");
    }
  });

  test("условия складываются, а не заменяют друг друга", async ({ page, isMobile }) => {
    if (isMobile) await page.getByRole("button", { name: /^Фильтры/ }).click();

    const all = await foundCount(page);
    await page.getByRole("button", { name: "Wildberries" }).click();
    const afterFirst = await foundCount(page);
    expect(afterFirst).toBeLessThanOrEqual(all);

    await page.getByRole("button", { name: "Lamoda" }).click();
    await expect.poll(() => foundCount(page)).toBeLessThanOrEqual(afterFirst);
  });

  test("сброс возвращает полный список", async ({ page, isMobile }) => {
    if (isMobile) await page.getByRole("button", { name: /^Фильтры/ }).click();

    const all = await foundCount(page);
    await page.getByRole("button", { name: "Проверенные Укладом" }).click();
    await expect.poll(() => foundCount(page)).toBeLessThan(all);

    await page.getByRole("button", { name: /^Сбросить/ }).click();
    await expect.poll(() => foundCount(page)).toBe(all);
  });

  test("невыполнимый отбор объясняет себя, а не показывает пустоту", async ({
    page,
    isMobile,
  }) => {
    if (isMobile) await page.getByRole("button", { name: /^Фильтры/ }).click();

    // Через поиск, а не набором площадок: склады раздаются генератором, и
    // «столько условий сразу никто не выполнит» — предположение, которое
    // однажды окажется неверным. Названия такого склада в данных нет.
    // По роли, а не по placeholder: колонка фильтров для широкого экрана
    // остаётся в разметке и на телефоне (`hidden lg:block`), и поиск по
    // атрибуту находит два поля — спрятанное и то, что в шторке.
    await page
      .getByRole("textbox", { name: "Название, город или улица" })
      .fill("склад-призрак");

    if (isMobile) await page.getByRole("button", { name: /^Показать \d+$/ }).click();
    await expect(page.getByText("Под такие условия склада нет")).toBeVisible();
    await page.getByRole("button", { name: "Сбросить фильтры" }).click();
    expect(await foundCount(page)).toBeGreaterThan(10);
  });

  test("карточка открывается в адрес, который можно переслать", async ({ page }) => {
    const first = cards(page).first();
    const name = (await first.getByRole("heading").innerText()).trim();
    await first.click();

    await expect(page).toHaveURL(/#\/warehouse\/w-\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);

    // Ссылка должна открывать ту же страницу с нуля, а не пустую витрину.
    const url = page.url();
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  });

  test("«Все склады» возвращают в тот же список", async ({ page }) => {
    await cards(page).first().click();
    await expect(page).toHaveURL(/#\/warehouse\/w-\d+$/);

    await page.getByRole("button", { name: "Все склады" }).click();
    await expect(page).toHaveURL(/#\/market$/);
    await expect(cards(page)).toHaveCount(12);
  });

  test("заявка уходит только после согласия на обработку данных", async ({ page }) => {
    await cards(page).first().click();
    // Заявка и чат живут в одной боковой колонке — сужаем поиск до неё, иначе
    // «Отправить» поймает и поле чата.
    const aside = page.getByRole("complementary");
    const send = aside.getByRole("button", { name: "Отправить заявку" });

    await expect(send).toBeDisabled();
    await aside.getByRole("checkbox").first().check();
    await expect(send).toBeEnabled();

    await send.click();
    await expect(aside.getByRole("button", { name: "Заявка отправлена" })).toBeVisible();
  });

  test("карта — второй способ смотреть тот же отбор", async ({ page }) => {
    await page.getByRole("button", { name: "Карта" }).click();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    // Точки рисуются по найденным складам: пустая карта означала бы, что
    // отбор до неё не доехал.
    await expect(page.locator(".leaflet-marker-pane > *").first()).toBeAttached();

    await page.getByRole("button", { name: "Списком" }).click();
    await expect(page.locator(".leaflet-container")).toBeHidden();
  });

  /**
   * Карточки рядом с картой уже схлопывались в полоски: от каждой оставалась
   * верхушка обложки, а весь текст уезжал под обрез. Глазами это ловится
   * сразу, а тестами — ничем из того, что здесь есть: разметка на месте, текст
   * в DOM, за край ничего не вылезает. Поэтому проверка на габарит.
   *
   * Порог — четверть настоящей высоты карточки: сама она около 420 точек, а
   * сломанная была 45. Точное число здесь и не нужно, оно меняется от длины
   * названия; нужно отличить карточку от полоски.
   */
  test("рядом с картой карточки остаются карточками, а не полосками", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Колонка рядом с картой раскрывается только на широком экране");
    const MIN_CARD_HEIGHT = 200;

    await page.getByRole("button", { name: "Карта" }).click();
    await expect(page.locator(".leaflet-container")).toBeVisible();

    const first = cards(page).first();
    const box = await first.boundingBox();
    expect(box?.height, "карточка схлопнулась в полоску").toBeGreaterThan(MIN_CARD_HEIGHT);

    // И колонка при этом прокручивается сама, а не растягивает страницу под
    // себя: карта рядом с ней стоит на месте, и список обязан ехать внутри.
    const scrolls = await first.evaluate((el) => {
      // Не родитель: у карточки появилась обёртка под кнопку сравнения, и
      // прямой родитель — уже она, а не колонка. Ищем первого предка, который
      // вообще умеет прокручиваться, — тогда тест переживёт и следующую
      // обёртку.
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (getComputedStyle(node).overflowY !== "auto") continue;
        return node.scrollHeight > node.clientHeight + 1;
      }
      return false;
    });
    expect(scrolls, "список у карты не прокручивается внутри себя").toBe(true);
  });

  test("сортировка меняет порядок, а не состав", async ({ page }) => {
    const namesOf = () => cards(page).getByRole("heading").allInnerTexts();

    const before = await namesOf();
    const count = await foundCount(page);

    await page
      .getByRole("combobox")
      .filter({ hasText: "По рейтингу" })
      .selectOption("price");
    await expect.poll(async () => (await namesOf()).join("|")).not.toBe(before.join("|"));
    expect(await foundCount(page)).toBe(count);
  });

  /**
   * Отметка «проверен» стоит ровно столько, сколько сказано за ней.
   *
   * Проверяем не наличие галочки, а наличие расшифровки: галочка без списка
   * того, что за ней стоит, читается как поручительство сервиса за склад — а
   * поручительства мы не даём и прямо об этом пишем. И вторая половина того
   * же: склад без отметки обязан сказать, что его не проверяли. Отметка,
   * отсутствие которой ничем не отличается от присутствия, ничего не значит.
   */
  test.describe("Проверка склада", () => {
    const badge = '[aria-label="Проверен Укладом"]';

    /**
     * Реестр зависит от формы склада: общество ищут в ЕГРЮЛ, предпринимателя —
     * в ЕГРИП. Тест берёт первый попавшийся проверенный склад и не должен
     * зависеть от того, какая форма ему досталась.
     */
    const REGISTRY = /сверена\s+по\s+ЕГР(ЮЛ|ИП)/;

    test("за галочкой видно, что именно сверили", async ({ page }) => {
      await cards(page).filter({ has: page.locator(badge) }).first().click();
      await expect(page).toHaveURL(/#\/warehouse\/w-\d+$/);

      await expect(page.getByRole("heading", { name: "Что проверил Уклад" })).toBeVisible();
      await expect(page.getByText(REGISTRY)).toBeVisible();
      await expect(page.getByText(phrase("Право пользования площадкой"))).toBeVisible();

      // Оговорка — не мелкий шрифт для юристов, а часть обещания: без неё
      // список проверок читается как гарантия качества услуг.
      await expect(page.getByText(phrase("Проверка — не поручительство"))).toBeVisible();
      await page.getByRole("link", { name: "Как это устроено" }).click();
      await expect(page).toHaveURL(/#\/legal\/requisites$/);
    });

    test("склад без галочки говорит, что его не проверяли", async ({ page }) => {
      await cards(page).filter({ hasNot: page.locator(badge) }).first().click();
      await expect(page).toHaveURL(/#\/warehouse\/w-\d+$/);

      await expect(page.getByText(phrase("Уклад не проверял"))).toBeVisible();
      await expect(page.getByText(REGISTRY)).toHaveCount(0);
    });
  });

  /**
   * Объём селлера — то, ради чего витрина вообще собрана.
   *
   * Прайсы фулфилмента несопоставимы между собой: у одного склада дешевле
   * хранение, у другого сборка, и «кто дешевле» — вопрос без ответа, пока не
   * известен оборот. Панель объёма превращает четыре прайса в одно число на
   * склад, и проверять здесь надо именно это: не что поля заполнились, а что
   * в карточках появился счёт и что «сначала дешёвые» начали считать месяц
   * целиком, а не одно хранение.
   */
  test.describe("Объём селлера", () => {
    /** Суммы «≈ N ₽» из карточек, в порядке выдачи. */
    const monthlySums = async (page: Page): Promise<number[]> => {
      const texts = await cards(page).allInnerTexts();
      return texts
        // `\s` в JS покрывает и неразрывный пробел, которым `toLocaleString`
        // разделяет разряды, — отдельного случая для U+00A0 не нужно.
        .map((t) => /≈\s*([\d\s]+)₽/.exec(t))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => Number(m[1].replace(/\D/g, "")));
    };

    const fillVolume = async (page: Page, label: string, value: string): Promise<void> => {
      await page.getByRole("textbox", { name: label }).fill(value);
    };

    test("объём превращает прайс в счёт за месяц", async ({ page }) => {
      const estimate = page.getByText(phrase("в месяц под ваш объём"));
      await expect(estimate).toHaveCount(0);

      await fillVolume(page, "Мест хранения", "120");
      await fillVolume(page, "Приёмка", "40");
      await fillVolume(page, "Сборка", "900");

      // Сумма нужна не «где-нибудь», а в карточках — иначе сравнивать нечего.
      await expect.poll(async () => (await monthlySums(page)).length).toBeGreaterThan(5);

      // Счёт складывается из трёх строк прайса, так что дешевле хранения он
      // быть не может ни у кого: нулевая сумма означала бы, что объём до
      // расчёта не доехал.
      for (const sum of await monthlySums(page)) expect(sum).toBeGreaterThan(0);

      // Кнопок «Сбросить» на витрине две: своя у фильтров и своя у объёма.
      // Нужна вторая — та, что внутри названной области панели.
      await page
        .getByRole("region", { name: "Ваш объём" })
        .getByRole("button", { name: "Сбросить" })
        .click();
      await expect(estimate).toHaveCount(0);
    });

    test("«сначала дешёвые» считают месяц целиком, а не хранение", async ({ page }) => {
      await fillVolume(page, "Мест хранения", "120");
      await fillVolume(page, "Приёмка", "40");
      await fillVolume(page, "Сборка", "900");
      await expect.poll(async () => (await monthlySums(page)).length).toBeGreaterThan(5);

      await page
        .getByRole("combobox")
        .filter({ hasText: "По рейтингу" })
        .selectOption("price");

      // Порядок проверяем по самим суммам, а не по названиям складов: список
      // упорядочен правильно ровно тогда, когда числа в нём не убывают.
      await expect
        .poll(async () => {
          const sums = await monthlySums(page);
          return sums.every((sum, i) => i === 0 || sums[i - 1] <= sum);
        })
        .toBe(true);
    });

    test("склад, которому объём не по размеру, говорит об этом сам", async ({ page }) => {
      // Столько мест нет ни у кого: склад обязан объясниться, а не пропасть
      // из выдачи — пропажа читается как поломка витрины.
      await fillVolume(page, "Мест хранения", "999999");

      await expect(page.getByText(phrase("Не возьмёт весь объём")).first()).toBeVisible();
      expect(await monthlySums(page)).toHaveLength(0);
      expect(await foundCount(page)).toBeGreaterThan(10);

      // И наоборот: с одним местом мешает уже не вместимость, а порог входа.
      await fillVolume(page, "Мест хранения", "1");
      await expect(page.getByText(phrase("Берёт от")).first()).toBeVisible();
    });
  });
});
