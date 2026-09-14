import type { Locator, Page } from "@playwright/test";

/** Ключ выбора в баннере cookie — тот же, что в `src/site/lib/cookieConsent.ts`. */
export const CONSENT_KEY = "uklad.cookie-consent";

/**
 * Заранее проставленный выбор cookie.
 *
 * Баннер висит внизу экрана поверх всего и через 1,2 с перехватывает клики по
 * нижней части страницы. Для тестов, которые проверяют не баннер, это чистый
 * шум: они начинают падать на «element is covered by another element» в
 * зависимости от того, успел ли таймер. Поэтому везде, кроме `consent.spec.ts`,
 * выбор считается сделанным заранее — ровно как у вернувшегося посетителя.
 */
export async function acceptCookies(page: Page): Promise<void> {
  await page.addInitScript(
    ([key]) => {
      try {
        window.localStorage.setItem(key, "necessary");
      } catch {
        // Приватное окно — баннер просто появится, тест это переживёт.
      }
    },
    [CONSENT_KEY],
  );
}

/**
 * Регулярка на фразу, устойчивая к типографике.
 *
 * Витрина прогоняет свой текст через `useTypography` (см. `src/site/lib`), и
 * тот сшивает предлоги и короткие слова со следующим словом неразрывным
 * пробелом. В разметке это правильно — строка не рвётся после «на» или «не», —
 * но Playwright в текстовых матчерах схлопывает только обычные пробелы, а
 * U+00A0 оставляет как есть. Поэтому `/заявка на склад/` перестаёт находить
 * фразу, которую человек на экране прекрасно видит, и тест падает на
 * «element(s) not found», хотя со страницей всё в порядке.
 *
 * Здесь каждый пробел фразы превращается в «любой пробел, в том числе
 * неразрывный». Литеральные символы регулярки экранируются: на вход идёт
 * человеческий текст, а не шаблон.
 */
export function phrase(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\s+/g, "[\\s\\u00A0]+"));
}

/**
 * Прокрутка в заданную точку — мгновенная.
 *
 * Тесту нужна позиция, а не поездка: если прокрутка растянется на анимацию,
 * следующий шаг попадёт в её середину и проверит то, чего человек ещё не
 * видит. `behavior: "instant"` ставит страницу сразу и не зависит от того,
 * что о плавности думает CSS.
 *
 * Плавную прокрутку витрины (Lenis) это не ломает: чужую прокрутку он
 * подхватывает и продолжает от неё, а не тащит страницу назад к своей цели.
 * Проверять здесь саму плавность нечем — для неё есть `scroll.spec.ts`.
 */
export async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate((y) => {
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  }, top);
}

/**
 * Открыть витрину складов напрямую.
 *
 * Через `goto` по адресу, а не кликом из шапки: путь «лендинг → кнопка →
 * витрина» проверяется отдельным тестом, и повторять его перед каждой проверкой
 * фильтров значит ловить в фильтрах падения навигации.
 *
 * Адрес с завершающей косой чертой — так же, как его строит `href()` на самой
 * витрине. Здесь это не украшение: страницы лежат файлами (`market/index.html`),
 * и статике отдавать нечего, пока в адресе нет каталога.
 *
 * `search` — хвост с готовым отбором, вместе с `?`. Отбор живёт в адресе, и
 * «открыть присланную ссылку» — такой же обычный вход на витрину, как и
 * чистый.
 */
export async function openMarket(page: Page, search = ""): Promise<void> {
  await page.goto(`/market/${search}`);
  await page.getByRole("heading", { name: "Склады для фулфилмента" }).waitFor();
}

/**
 * Заполнить заявку складу.
 *
 * Форма одна и та же на странице склада и в таблице сравнения, поэтому область
 * приходит снаружи. Поля ищутся по `id`, а не по подписи: подписи проходят
 * через типографику витрины, и образец в тесте начинал бы зависеть от правил
 * переносов, а не от формы.
 *
 * Дата считается от нынешнего дня: записанная строкой она когда-нибудь
 * наступит, и тест упадёт сам по себе, без единой правки в коде.
 */
export async function fillRequest(scope: Locator): Promise<void> {
  const ahead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const month = `${ahead.getMonth() + 1}`.padStart(2, "0");
  const day = `${ahead.getDate()}`.padStart(2, "0");

  await scope.locator("#request-goods").fill("Одежда и обувь");
  await scope.locator("#request-places").fill("120");
  await scope.locator("#request-date").fill(`${ahead.getFullYear()}-${month}-${day}`);
  await scope.locator("#request-city").fill("Казань");
}

/** Сколько складов витрина насчитала под текущий отбор. */
export async function foundCount(page: Page): Promise<number> {
  const text = await page
    .locator("p", { hasText: phrase("по вашим условиям") })
    .first()
    .innerText();
  const digits = text.replace(/[^\d]/g, "");
  return Number(digits);
}

/**
 * Есть ли на странице горизонтальная прокрутка.
 *
 * Допуск в 1 пиксель — не поблажка: при дробном devicePixelRatio округление
 * ширины даёт расхождение в единицы, и строгое сравнение падало бы на ровном
 * месте.
 */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth > 1;
  });
}

/**
 * Проверка «страница не едет вбок» с именем виновника в тексте падения.
 *
 * Отдельной функцией, потому что голое `expect(overflow).toBe(false)` сообщает
 * только факт, а искать по нему причину приходится вручную. Список подозреваемых
 * собираем лишь при падении: на здоровой странице он не нужен.
 */
export async function expectNoOverflow(page: Page, where: string): Promise<void> {
  if (!(await hasHorizontalOverflow(page))) return;
  const suspects = await overflowingElements(page);
  throw new Error(
    `${where}: страница едет вбок. Подозреваемые: ${suspects.join(" | ") || "не найдены"}`,
  );
}

/**
 * Элементы, которые вылезают за правый край окна.
 *
 * Сам факт «страница едет вбок» бесполезен без виновника: искать его потом
 * руками по всему лендингу дольше, чем один раз собрать список здесь.
 */
export async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth + 1;
    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // Родителей-обёрток отсекаем: виноват самый глубокий элемент.
        if (el.querySelector("*")) {
          const kids = [...el.children] as HTMLElement[];
          if (kids.some((k) => k.getBoundingClientRect().right > limit)) return false;
        }
        return r.right > limit;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
  });
}
