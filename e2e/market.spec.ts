import { expect, test, type Locator, type Page } from "@playwright/test";
import { acceptCookies, fillRequest, foundCount, openMarket, phrase } from "./helpers";

/**
 * Карточки склада. Ищутся по адресу, а не по роли `article`: карточка — это
 * ссылка на страницу склада, потому что склады сравнивают, открывая их в
 * соседних вкладках.
 */
const cards = (page: Page) => page.locator('a[href^="/warehouse/"]');

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

  test("невыполнимый отбор объясняет себя, а не показывает пустоту", async ({ page, isMobile }) => {
    if (isMobile) await page.getByRole("button", { name: /^Фильтры/ }).click();

    // Через поиск, а не набором площадок: склады раздаются генератором, и
    // «столько условий сразу никто не выполнит» — предположение, которое
    // однажды окажется неверным. Названия такого склада в данных нет.
    // По роли, а не по placeholder: колонка фильтров для широкого экрана
    // остаётся в разметке и на телефоне (`hidden lg:block`), и поиск по
    // атрибуту находит два поля — спрятанное и то, что в шторке.
    await page.getByRole("textbox", { name: "Название, город или улица" }).fill("склад-призрак");

    if (isMobile) await page.getByRole("button", { name: /^Показать \d+$/ }).click();
    await expect(page.getByText("Под такие условия склада нет")).toBeVisible();
    await page.getByRole("button", { name: "Сбросить фильтры" }).click();
    expect(await foundCount(page)).toBeGreaterThan(10);
  });

  test("карточка открывается в адрес, который можно переслать", async ({ page }) => {
    const first = cards(page).first();
    const name = (await first.getByRole("heading").innerText()).trim();
    await first.click();

    await expect(page).toHaveURL(/\/warehouse\/w-\d+\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);

    // Ссылка должна открывать ту же страницу с нуля, а не пустую витрину.
    const url = page.url();
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  });

  test("«Все склады» возвращают в тот же список", async ({ page }) => {
    await cards(page).first().click();
    await expect(page).toHaveURL(/\/warehouse\/w-\d+\/$/);

    // Ссылка, а не крестик: склад открывают и по присланному адресу, и
    // возврат обязан работать одинаково в обоих случаях.
    await page.getByRole("link", { name: "Все склады" }).click();
    await expect(page).toHaveURL(/\/market\/$/);
    await expect(cards(page)).toHaveCount(12);
  });

  test("заявка уходит только заполненной и с согласием", async ({ page }) => {
    await cards(page).first().click();
    // Заявка и чат живут в одной боковой колонке — сужаем поиск до неё, иначе
    // «Отправить» поймает и поле чата.
    const aside = page.getByRole("complementary");
    // «Написать письмо», а не «Отправить заявку»: приёмник заявок в сборке не
    // настроен (`VITE_LEADS_ENDPOINT` пуст), и форма не притворяется
    // работающей — кнопка открывает подставленное письмо.
    const send = aside.getByRole("button", { name: "Написать письмо" });

    // Пустая заявка не уходит, и рядом написано, чего не хватает.
    await expect(send).toBeDisabled();
    await expect(aside.getByText(phrase("Напишите, какой товар везёте"))).toBeVisible();

    await fillRequest(aside);
    await expect(send).toBeDisabled();
    await aside.getByRole("checkbox").first().check();
    await expect(send).toBeEnabled();
    // Что сделает нажатие — сказано до нажатия.
    await expect(aside).toContainText(phrase("Отправить его нужно самому"));

    await send.click();
    await expect(aside.getByRole("button", { name: "Письмо открыто" })).toBeVisible();
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

    await page.getByRole("combobox").filter({ hasText: "По рейтингу" }).selectOption("price");
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
    // Подпись у галочки полная — «Проверен Укладом: регистрация компании и
    // право на помещение» (`WarehouseCard.tsx`). Ищем по началу, а не целиком:
    // расшифровка за двоеточием — текст для человека, и он будет меняться.
    const badge = '[aria-label^="Проверен Укладом"]';

    /**
     * Реестр зависит от формы склада: общество ищут в ЕГРЮЛ, предпринимателя —
     * в ЕГРИП. Тест берёт первый попавшийся проверенный склад и не должен
     * зависеть от того, какая форма ему досталась.
     */
    const REGISTRY = /сверена\s+по\s+ЕГР(ЮЛ|ИП)/;

    test("за галочкой видно, что именно сверили", async ({ page }) => {
      await cards(page)
        .filter({ has: page.locator(badge) })
        .first()
        .click();
      await expect(page).toHaveURL(/\/warehouse\/w-\d+\/$/);

      await expect(page.getByRole("heading", { name: "Что проверил Уклад" })).toBeVisible();
      await expect(page.getByText(REGISTRY)).toBeVisible();
      await expect(page.getByText(phrase("Право пользования площадкой"))).toBeVisible();

      // Оговорка — не мелкий шрифт для юристов, а часть обещания: без неё
      // список проверок читается как гарантия качества услуг.
      await expect(page.getByText(phrase("Проверка — не поручительство"))).toBeVisible();
      await page.getByRole("link", { name: "Как это устроено" }).click();
      await expect(page).toHaveURL(/\/legal\/requisites\/$/);
    });

    test("склад без галочки говорит, что его не проверяли", async ({ page }) => {
      await cards(page)
        .filter({ hasNot: page.locator(badge) })
        .first()
        .click();
      await expect(page).toHaveURL(/\/warehouse\/w-\d+\/$/);

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
      return (
        texts
          // `\s` в JS покрывает и неразрывный пробел, которым `toLocaleString`
          // разделяет разряды, — отдельного случая для U+00A0 не нужно.
          .map((t) => /≈\s*([\d\s]+)₽/.exec(t))
          .filter((m): m is RegExpExecArray => m !== null)
          .map((m) => Number(m[1].replace(/\D/g, "")))
      );
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

      // Панель объёма не сито: она считает по той же выдаче и говорит это
      // вилкой месяца прямо у полей ввода.
      await expect(
        page.getByRole("region", { name: "Ваш объём" }).getByText(phrase("Месяц под этот объём")),
      ).toBeVisible();

      // Числа очищают, условия сбрасывают — слова разные нарочно, и кнопка
      // объёма ищется именно своим.
      await page
        .getByRole("region", { name: "Ваш объём" })
        .getByRole("button", { name: "Очистить" })
        .click();
      await expect(estimate).toHaveCount(0);
    });

    test("панель объёма считает, а не отбирает", async ({ page }) => {
      // Ровно та ошибка, ради которой панель развели с отбором видом, словом и
      // собственным ответом: её принимали за ещё одно условие. Проверяем оба
      // конца этого — что ответ появился в самой панели и что список от него
      // не сузился ни на один склад.
      const before = await foundCount(page);

      await fillVolume(page, "Приёмка", "40");

      const panel = page.getByRole("region", { name: "Ваш объём" });
      await expect(panel.getByText(phrase("Месяц под этот объём"))).toBeVisible();
      await expect.poll(() => foundCount(page)).toBe(before);
    });

    test("«сначала дешёвые» считают месяц целиком, а не хранение", async ({ page }) => {
      await fillVolume(page, "Мест хранения", "120");
      await fillVolume(page, "Приёмка", "40");
      await fillVolume(page, "Сборка", "900");
      await expect.poll(async () => (await monthlySums(page)).length).toBeGreaterThan(5);

      await page.getByRole("combobox").filter({ hasText: "По рейтингу" }).selectOption("price");

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

  /**
   * Сравнение отмеченных складов.
   *
   * Прайсы фулфилмента несопоставимы построчно, и до таблицы селлер сравнивал
   * склады, открывая их в соседних вкладках, — то есть глазами и памятью.
   * Поэтому проверяем не «слой открылся», а всю цепочку целиком: отметка
   * попадает в полосу, полоса собирает таблицу, в таблице видно лучшее в
   * строке, и заявка уходит сразу во все отмеченные — но только после
   * согласия.
   */
  test.describe("Сравнение складов", () => {
    /**
     * Отметить первый неотмеченный склад в выдаче и вернуть его название.
     *
     * Каждый раз первый, а не по номеру: отмеченная кнопка меняет подпись на
     * «Убрать из сравнения» и выпадает из выборки, так что после первой отметки
     * первой неотмеченной становится следующая карточка. Название берём из
     * подписи кнопки, а не из заголовка карточки: подпись — атрибут, и
     * типографика, склеивающая слова неразрывным пробелом, до неё не достаёт.
     */
    const mark = async (page: Page): Promise<string> => {
      const button = page.getByRole("button", { name: /^Сравнить: / }).first();
      const name = (await button.getAttribute("aria-label"))!.replace(/^Сравнить: /, "");
      await button.click();
      return name;
    };

    /**
     * Полоса отмеченного внизу экрана.
     *
     * Названная область, а не «первый fixed»: крестик «Убрать из сравнения»
     * есть в трёх местах разом — на карточке склада, в полосе и в шапке
     * колонки таблицы, — и без имени области любой из них ловится вместо
     * нужного.
     */
    const bar = (page: Page) => page.getByRole("region", { name: "К сравнению" });

    /** Крестик отмеченного склада — подпись одна на все три места. */
    const removal = (name: string) => phrase(`Убрать из сравнения: ${name}`);

    /** Числа из клеток строки, в порядке колонок. */
    const rowValues = async (cells: Locator): Promise<number[]> =>
      // Подпись «лучшее в строке» цифр не содержит, поэтому её остатки в
      // тексте клетки на число не влияют.
      (await cells.allInnerTexts()).map((text) => Number(text.replace(/\D/g, "")));

    test("отметки собираются в полосу, а полоса — в таблицу", async ({ page }) => {
      const first = await mark(page);
      const second = await mark(page);

      // Полоса держит весь набор на виду: между первой отметкой и последней
      // проходит полторы страницы прокрутки, и вспоминать, кого отметил,
      // человек не обязан.
      await expect(bar(page)).toBeVisible();
      await expect(bar(page).getByText(phrase("2 из 4"))).toBeVisible();
      await expect(bar(page).getByRole("button", { name: removal(first) })).toBeVisible();
      await expect(bar(page).getByRole("button", { name: removal(second) })).toBeVisible();

      await bar(page).getByRole("button", { name: "Сравнить" }).click();
      const table = page.getByRole("dialog", { name: "Сравнение складов" });

      // Колонка на склад плюс угол таблицы, и в шапке колонки — ссылка на сам
      // склад: из таблицы уходят дочитывать карточку.
      await expect(table.getByRole("columnheader")).toHaveCount(3);
      await expect(table.getByRole("columnheader").nth(1).getByRole("link")).toHaveAttribute(
        "href",
        /\/warehouse\/w-\d+\/$/,
      );

      // Без объёма строки месяца нет вовсе, и вместо неё — что для неё
      // сделать: «0 ₽» читалось бы как «бесплатно».
      await expect(table.getByRole("rowheader", { name: /^Месяц под ваш объём/ })).toHaveCount(0);
      await expect(table.getByText(phrase("Впишите объём в панели над списком"))).toBeVisible();

      // Лучшее в строке отмечено ровно там, где число действительно лучшее.
      // Сравниваем с самими числами, а не с одной ожидаемой колонкой: цены в
      // двух складах могут совпасть, и тогда лучших честно двое.
      const row = table
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name: /^Хранение/ }) });
      const cells = row.getByRole("cell");
      await expect(cells).toHaveCount(2);

      const values = await rowValues(cells);
      const cheapest = Math.min(...values);
      for (const [i, value] of values.entries()) {
        const marked = await cells.nth(i).getByText(phrase("лучшее в строке")).count();
        expect(marked > 0, `клетка ${i} отмечена не по числу`).toBe(value === cheapest);
      }
    });

    test("заявка из таблицы уходит во все отмеченные и только после согласия", async ({ page }) => {
      await mark(page);
      await mark(page);
      await bar(page).getByRole("button", { name: "Сравнить", exact: true }).click();

      const table = page.getByRole("dialog", { name: "Сравнение складов" });
      // В подписи кнопки число складов: заявка уходит сразу во все, и человек
      // обязан видеть, во сколько именно, до нажатия. Слово перед числом
      // зависит от того, настроен ли приёмник: с ним — «Отправить заявку в 2
      // склада», без него кнопка честно открывает письмо.
      const send = table.getByRole("button", { name: phrase("Написать письмо в 2 склада") });
      await expect(send).toBeDisabled();

      await fillRequest(table);

      // Рекламная галочка заявку не разблокирует — согласия раздельные.
      await table.getByRole("checkbox").nth(1).check();
      await expect(send).toBeDisabled();

      await table.getByRole("checkbox").first().check();
      await expect(send).toBeEnabled();
      await send.click();
      await expect(table.getByRole("button", { name: "Письмо открыто" })).toBeVisible();
    });

    test("объём добавляет в таблицу главную строку — месяц", async ({ page }) => {
      await page.getByRole("textbox", { name: "Мест хранения" }).fill("120");
      await page.getByRole("textbox", { name: "Приёмка" }).fill("40");
      await page.getByRole("textbox", { name: "Сборка" }).fill("900");

      await mark(page);
      await mark(page);
      await bar(page).getByRole("button", { name: "Сравнить", exact: true }).click();

      const table = page.getByRole("dialog", { name: "Сравнение складов" });
      const row = table
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name: /^Месяц под ваш объём/ }) });
      // Строка стоит первой: ради неё таблицу и открывают, а прайс под ней —
      // объяснение, из чего этот месяц сложился.
      await expect(table.getByRole("rowheader").first()).toContainText("Месяц под ваш объём");

      // Прочерк допустим — склад может не взять объём, — но не у всех сразу:
      // пустая строка означала бы, что объём до таблицы не доехал.
      const filled = await row.getByRole("cell").filter({ hasNotText: "—" }).count();
      expect(filled, "месяц не посчитан ни одному складу").toBeGreaterThan(0);
    });

    test("одному складу сравниваться не с чем", async ({ page, isMobile }) => {
      const only = await mark(page);
      await expect(bar(page).getByText(phrase("1 из 4"))).toBeVisible();

      // Кнопка гаснет, а не исчезает, и рядом сказано почему: пропавшая кнопка
      // читается как поломка витрины. Объяснение помещается только на широком
      // экране — на телефоне рядом с кнопкой места нет.
      await expect(bar(page).getByRole("button", { name: "Сравнить", exact: true })).toBeDisabled();
      if (!isMobile) {
        await expect(
          bar(page).getByText(phrase("одному складу не с чем сравниваться")),
        ).toBeVisible();
      }

      // Снятая отметка убирает полосу целиком: пустая полоса поверх каталога
      // отнимает низ экрана ни за чем.
      await bar(page)
        .getByRole("button", { name: removal(only) })
        .click();
      await expect(bar(page)).toBeHidden();
    });

    test("больше четырёх складов разом не отмечается", async ({ page }) => {
      for (let i = 0; i < 4; i += 1) await mark(page);
      await expect(bar(page).getByText(phrase("4 из 4"))).toBeVisible();

      // Пятая кнопка не пропадает, а гаснет и объясняет предел подсказкой.
      const extra = page.getByRole("button", { name: /^Сравнить: / }).first();
      await expect(extra).toBeDisabled();
      // Подсказка — атрибут, и типографика её не трогает: сверяем дословно.
      await expect(extra).toHaveAttribute("title", "Сравнить можно 4 склада разом");
    });

    test("таблица закрывается, когда сравнивать в ней становится не с чем", async ({ page }) => {
      const first = await mark(page);
      await mark(page);
      await bar(page).getByRole("button", { name: "Сравнить", exact: true }).click();

      const table = page.getByRole("dialog", { name: "Сравнение складов" });
      await expect(table).toBeVisible();

      // Вычёркивать можно прямо из шапки колонки — и довычёркиваться до
      // одного склада. Таблица из одной колонки не сравнение, а карточка
      // задом наперёд, поэтому слой уходит сам, возвращая человека в каталог.
      await table.getByRole("button", { name: removal(first) }).click();
      await expect(table).toBeHidden();
      await expect(bar(page).getByText(phrase("1 из 4"))).toBeVisible();
    });
  });
});
