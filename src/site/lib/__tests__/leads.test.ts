import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORG } from "../../data/org";
import { hasLeadsEndpoint, leadMailto, leadText, sendLead, type Lead } from "../leads";

/**
 * Отправка заявок с витрины.
 *
 * Проверяется не «функция вызвалась», а три вещи, каждая из которых уже
 * ломалась бы молча: письмо содержит то, что человек напечатал; адрес `mailto:`
 * собран так, что почтовая программа покажет текст, а не мусор; и отказ
 * отличается от успеха — форма обязана знать, что заявка не ушла.
 */

const LEAD: Lead = {
  kind: "request",
  lang: "ru",
  subject: "Заявка складу «Химки-1»",
  fields: [
    { label: "Тип товара", value: "Одежда и обувь" },
    { label: "Компания", value: "" },
    { label: "Город отгрузки", value: " Казань " },
  ],
  consent: { data: true, ads: false },
};

const ENDPOINT = "https://example.test/leads";

describe("письмо заявки", () => {
  it("печатает заполненные поля подписями из формы", () => {
    const text = leadText(LEAD);

    expect(text).toContain("Тип товара: Одежда и обувь");
    // Пробелы по краям срезаются: в письме они выглядят опечаткой.
    expect(text).toContain("Город отгрузки: Казань");
  });

  it("не печатает пустые необязательные поля", () => {
    // Строка «Компания:» без значения в письме читается как недозаполненная
    // форма, хотя поле необязательное и человек сознательно его пропустил.
    expect(leadText(LEAD)).not.toContain("Компания");
  });

  it("записывает оба согласия — их придётся предъявлять", () => {
    const text = leadText(LEAD);

    expect(text).toContain("Согласие на обработку данных: да");
    expect(text).toContain("Рекламные письма: нет");
  });

  it("пишет письмо на языке, на котором заполняли форму", () => {
    const text = leadText({ ...LEAD, lang: "en" });

    expect(text).toContain("Consent to data processing: given");
    expect(text).toContain("Marketing emails: no");
  });
});

describe("адрес mailto", () => {
  it("ведёт на почту из реквизитов", () => {
    expect(leadMailto(LEAD).startsWith(`mailto:${ORG.email}?`)).toBe(true);
  });

  it("кодирует пробелы как %20, а не плюсом", () => {
    // Ловушка `URLSearchParams`: он кодирует пробел плюсом, что верно для
    // строки запроса и неверно для `mailto:` — почтовая программа покажет
    // письмо, склеенное плюсами, и человек отправит его так.
    const url = leadMailto(LEAD);

    expect(url).toContain("%20");
    expect(url).not.toContain("+");
  });

  it("переносит строки письма, а не склеивает их в одну", () => {
    expect(leadMailto(LEAD)).toContain("%0A");
  });
});

describe("отправка", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    // Отказ транспорта пишется в консоль — в тесте она бы просто шумела.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("без настроенного приёмника никуда не ходит", async () => {
    vi.stubEnv("VITE_LEADS_ENDPOINT", "");

    expect(hasLeadsEndpoint()).toBe(false);
    await expect(sendLead(LEAD)).resolves.toEqual({ ok: false, reason: "unconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("шлёт на адрес из переменной окружения заявку целиком", async () => {
    vi.stubEnv("VITE_LEADS_ENDPOINT", ENDPOINT);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    expect(hasLeadsEndpoint()).toBe(true);
    await expect(sendLead(LEAD)).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body.kind).toBe("request");
    expect(body.lang).toBe("ru");
    expect(body.subject).toBe(LEAD.subject);
    expect(body.fields["Тип товара"]).toBe("Одежда и обувь");
    expect(body.consent).toEqual({ data: true, ads: false });
    // Готовый текст письма — чтобы приёмник, который просто пересылает
    // пришедшее, отдал складу письмо, а не выгрузку JSON.
    expect(body.message).toContain("Тип товара: Одежда и обувь");
  });

  it("ответ приёмника с ошибкой — это отказ, а не успех", async () => {
    vi.stubEnv("VITE_LEADS_ENDPOINT", ENDPOINT);
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(sendLead(LEAD)).resolves.toEqual({ ok: false, reason: "server" });
  });

  it("оборванная связь — это отказ, а не успех", async () => {
    vi.stubEnv("VITE_LEADS_ENDPOINT", ENDPOINT);
    fetchMock.mockRejectedValue(new Error("Failed to fetch"));

    await expect(sendLead(LEAD)).resolves.toEqual({ ok: false, reason: "network" });
  });
});
