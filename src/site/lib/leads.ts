import { ORG } from "../data/org";
import { c, pick } from "./copy";
import type { SiteLang } from "./lang";

/**
 * Куда уходит заполненная форма витрины — один шов на все формы сайта.
 *
 * Форм на витрине две: контакты и заявка складу (она же — заявка сразу во все
 * отмеченные из таблицы сравнения). Обе до сих пор ничего не отправляли:
 * нажатие меняло подпись кнопки на «Отправлено» и на этом заканчивалось.
 * Хуже, чем ничего: человек уходит уверенный, что его заявку прочитают.
 *
 * Решение принято такое — и записано здесь, а не в чьей-то голове:
 *
 * 1. **Адрес приёмника живёт в переменной окружения** `VITE_LEADS_ENDPOINT`.
 *    Подойдёт и Formspree, и собственный обработчик на хостинге, и будущее
 *    своё API: это `POST` с телом JSON, без единого знания о том, кто на том
 *    конце. Подключение бекенда — одна строка в `.env.local`, ни одной правки
 *    в коде.
 * 2. **Пока переменной нет, форма не притворяется работающей.** Кнопка прямо
 *    называется «Написать письмо», а под ней — до нажатия, а не после —
 *    сказано, что письмо откроется в почтовой программе. Тело письма уже
 *    собрано из полей, так что человек не перепечатывает ничего.
 * 3. **Отказ отличается от успеха.** Сеть оборвалась или приёмник ответил
 *    ошибкой — форма говорит об этом и предлагает повторить. Молчаливое
 *    «Отправлено» поверх неудачи — то же враньё, от которого мы уходим.
 *
 * Почему конверт свой, а не `Result` из `@/lib/data`: у того ошибка — ключ
 * словаря кабинета (`MsgKey`), а витрина переводится парами `c(ru, en)` рядом
 * с компонентом. Общий тип потянул бы за собой чужую систему текстов ради
 * одного поля.
 */

/**
 * Откуда пришла заявка. По этому полю приёмник раскладывает письма.
 *
 * Жалоба на склад — отдельный вид, а не заявка с особым текстом: у неё другой
 * срок (склад обязан ответить публично за две недели, см. `lib/reputation`) и
 * другой читатель. Попав в общую очередь заявок, она в ней и потеряется.
 *
 * Голоса и идеи с дорожной карты — тоже свои виды, и по той же причине: их
 * читают не в порядке поступления, а пачкой, когда решают, что делать дальше.
 * Отличаются они друг от друга ровно одним — есть ли в письме своя идея или
 * только отметки на доске (`lib/roadmapVotes`).
 */
export type LeadKind = "contact" | "request" | "complaint" | "vote" | "idea";

/** Одно поле формы. Подпись — ровно та, что человек видел на экране. */
export interface LeadField {
  label: string;
  value: string;
}

export interface Lead {
  kind: LeadKind;
  /** Язык, на котором заполняли: на нём и отвечать. */
  lang: SiteLang;
  /** Тема одной строкой — с ней заявка находится в почте через полгода. */
  subject: string;
  /** Поля по порядку формы. Пустые необязательные в письмо не попадают. */
  fields: LeadField[];
  /**
   * Согласия. Записываются в письмо не для порядка: если человек спросит, на
   * каком основании его данные у нас, ответ должен быть в самом обращении.
   */
  consent: { data: boolean; ads: boolean };
}

/** Почему не отправилось. Три причины — три разных разговора с человеком. */
export type LeadFailure =
  /** Приёмник не настроен: отправлять некуда, и это не сбой, а состояние сайта. */
  | "unconfigured"
  /** Запрос не дошёл: нет сети, оборвалось, истекло время. */
  | "network"
  /** Приёмник ответил ошибкой: дело на его стороне, повтор может помочь. */
  | "server";

export type LeadResult = { ok: true } | { ok: false; reason: LeadFailure };

const T = {
  consent: c("Согласие на обработку данных: да", "Consent to data processing: given"),
  ads: c("Рекламные письма: {v}", "Marketing emails: {v}"),
  yes: c("да", "yes"),
  no: c("нет", "no"),
  page: c("Страница: {url}", "Page: {url}"),
};

/**
 * Сколько ждём ответа приёмника. Без ограничения зависший запрос оставляет
 * кнопку в «Отправляем…» навсегда, и человек не знает, ушло письмо или нет.
 */
const SEND_TIMEOUT_MS = 15_000;

/**
 * Адрес приёмника. Читается при каждом вызове, а не один раз в константу:
 * Vite подставляет значение переменной прямо в код на сборке, так что чтение
 * ничего не стоит, зато в тестах переменную можно подменить.
 */
function endpoint(): string {
  return (import.meta.env.VITE_LEADS_ENDPOINT ?? "").trim();
}

/** Есть ли куда отправлять. По этому форма выбирает подпись кнопки. */
export function hasLeadsEndpoint(): boolean {
  return endpoint() !== "";
}

/** Адрес страницы, с которой ушла заявка. На сборке окна нет — там и заявок нет. */
function pageUrl(): string {
  return typeof window === "undefined" ? "" : window.location.href;
}

/**
 * Письмо человеческим текстом.
 *
 * Один и тот же текст уходит и телом `mailto:`, и полем `message` в запросе:
 * приёмник, который просто пересылает пришедшее, отдаст складу письмо, а не
 * выгрузку JSON.
 */
export function leadText(lead: Lead): string {
  const lines = lead.fields
    .map((f) => ({ label: f.label, value: f.value.trim() }))
    .filter((f) => f.value !== "")
    .map((f) => `${f.label}: ${f.value}`);

  lines.push("");
  lines.push(pick(lead.lang, T.consent));
  lines.push(pick(lead.lang, T.ads, { v: pick(lead.lang, lead.consent.ads ? T.yes : T.no) }));

  const url = pageUrl();
  if (url) lines.push(pick(lead.lang, T.page, { url }));

  return lines.join("\n");
}

/**
 * Адрес для почтовой программы с уже заполненным письмом.
 *
 * Кодируется `encodeURIComponent`, а не `URLSearchParams`: тот кодирует пробел
 * плюсом — верно для строки запроса и неверно для `mailto:`, где плюс остаётся
 * плюсом. Почтовая программа показала бы письмо, склеенное плюсами, и человек
 * отправил бы его в таком виде.
 */
export function leadMailto(lead: Lead): string {
  const subject = encodeURIComponent(lead.subject);
  const body = encodeURIComponent(leadText(lead));
  return `mailto:${ORG.email}?subject=${subject}&body=${body}`;
}

/** Тело запроса. Отдельной функцией — её читают, когда пишут приёмник. */
function leadPayload(lead: Lead): Record<string, unknown> {
  return {
    kind: lead.kind,
    lang: lead.lang,
    subject: lead.subject,
    // Formspree берёт тему письма из поля с подчёркиванием; собственному
    // обработчику лишнее поле не мешает, а настройки он не требует вовсе.
    _subject: lead.subject,
    page: pageUrl(),
    consent: lead.consent,
    fields: Object.fromEntries(lead.fields.map((f) => [f.label, f.value.trim()])),
    message: leadText(lead),
  };
}

/**
 * Отправка. Исключение наружу не выходит: у формы есть ветка «не вышло», и
 * ошибка транспорта обязана прийти в неё, а не в `unhandledrejection`.
 */
export async function sendLead(lead: Lead): Promise<LeadResult> {
  const url = endpoint();
  if (!url) return { ok: false, reason: "unconfigured" };

  // `AbortController` с таймером, а не `AbortSignal.timeout`: последний не
  // знает Safari до 16-й, а витрину открывают с чего угодно.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(leadPayload(lead)),
      signal: abort.signal,
    });

    if (!response.ok) {
      console.error("[uklad] приёмник заявок ответил", response.status);
      return { ok: false, reason: "server" };
    }
    return { ok: true };
  } catch (error) {
    console.error("[uklad] заявка не ушла:", error);
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}
