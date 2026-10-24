import { describe, expect, it, vi } from "vitest";
import { anonymizeSnapshot } from "../anonymize";
import { createJournal, JOURNAL_KEY, MAX_AGE_MS, MAX_ENTRIES, scrubText } from "../journal";
import {
  activeWarehouseOnly,
  buildReport,
  MAX_REPORT_BYTES,
  sendReport,
  snapshotSummary,
} from "../report";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const env = {
  userAgent: "test",
  language: "ru",
  screen: "1x1",
  timezone: "UTC",
  view: "dashboard",
};

describe("scrubText", () => {
  it("стирает почту и телефон, но не номера записей", () => {
    expect(scrubText("пишите ivan@example.ru или +7 (900) 000-00-00")).toBe(
      "пишите [почта] или [телефон]",
    );
    expect(scrubText("товар #128, коробка 000123")).toBe("товар #128, коробка 000123");
  });

  it("стирает ФИО с инициалами — так подписаны поставки от ИП", () => {
    expect(scrubText("Поставка 27.09 · Мамедова Л. Р.")).toBe("Поставка 27.09 · [ФИО]");
    expect(scrubText("принял А.С. Ковалёв")).toBe("принял [ФИО]");
    expect(scrubText("Поставка 24.10 · Дом и Сад")).toBe("Поставка 24.10 · Дом и Сад");
  });
});

describe("журнал", () => {
  it("держит не больше MAX_ENTRIES записей и забывает старше недели", () => {
    const storage = memoryStorage();
    const j = createJournal(storage);
    const now = 10 * MAX_AGE_MS;
    j.record("view", "old", undefined, now - MAX_AGE_MS - 1);
    for (let i = 0; i < MAX_ENTRIES + 5; i++) j.record("action", `a${i}`, undefined, now);
    const read = j.read(now);
    expect(read).toHaveLength(MAX_ENTRIES);
    expect(read.some((e) => e.name === "old")).toBe(false);
    expect(read.at(-1)?.name).toBe(`a${MAX_ENTRIES + 4}`);
  });

  it("пишет детали без контактов и переживает битое хранилище", () => {
    const storage = memoryStorage();
    const j = createJournal(storage);
    storage.setItem(JOURNAL_KEY, "{не json");
    j.record("error", "window", "TypeError у ivan@example.ru");
    expect(j.read()).toEqual([
      expect.objectContaining({ kind: "error", detail: "TypeError у [почта]" }),
    ]);
  });

  it("без хранилища молчит, а не падает", () => {
    const j = createJournal(null);
    expect(() => j.record("view", "x")).not.toThrow();
    expect(j.read()).toEqual([]);
  });
});

describe("обезличивание снимка", () => {
  const state = {
    account: { name: "Иван Петров", org: "ООО Ромашка", inn: "5036000001", type: "company" },
    profile: { name: "Иван Петров", email: "ivan@example.ru", theme: "light" },
    warehouse: {
      id: "w1",
      name: "Склад Север",
      address: "Подольск, ул. Складская, 1",
      phone: "+7 900 000-00-00",
      staff: [
        { id: "s1", name: "Анна Белова", role: "Кладовщик", phone: "+79000000001" },
        { id: "s2", name: "Пётр Иванов", role: "Сборщик", photoUrl: "https://x/p.jpg" },
      ],
      manager: { id: "s1", name: "Анна Белова", role: "Управляющий" },
      partners: [{ id: "p1", name: "ИП Сидоров", contact: "sidorov@example.ru" }],
    },
    products: [{ id: "g1", name: "Кружка белая 300 мл", sku: "MUG-300" }],
    chats: [{ id: "m1", text: "Позвоните мне 89000000002" }],
    integrations: { wb: { token: "секрет", enabled: true, note: "ключ от Пети" } },
    requests: [{ id: "r1", destination: "Москва, ул. Ленина, 5", vehicle: "А123ВС77" }],
    session: {
      user: { id: "u1", email: "ivan@example.ru", name: "Иван", role: "warehouse" },
      token: "t",
    },
  };
  const { data, stats } = anonymizeSnapshot(state);
  const json = JSON.stringify(data);

  it("не оставляет ни имён людей, ни контактов, ни ключей", () => {
    for (const leak of [
      "Иван",
      "Анна",
      "Пётр",
      "Сидоров",
      "Ромашка",
      "5036000001",
      "example.ru",
      "+7 900",
      "79000000001",
      "89000000002",
      "секрет",
      "Складская",
      "Ленина",
      "А123ВС77",
      "p.jpg",
      "Пети",
    ]) {
      expect(json).not.toContain(leak);
    }
    expect(stats.names).toBeGreaterThanOrEqual(6);
    expect(stats.dropped).toBeGreaterThanOrEqual(8);
  });

  it("оставляет то, по чему видна ошибка: товары, склад, роли, номера", () => {
    expect(json).toContain("Кружка белая 300 мл");
    expect(json).toContain("Склад Север");
    expect(json).toContain("Кладовщик");
    expect(json).toContain('"enabled":true');
  });

  it("одному человеку — одна метка во всём снимке", () => {
    const wh = (data as { warehouse: { staff: { name: string }[]; manager: { name: string } } })
      .warehouse;
    expect(wh.staff[0].name).toBe("Сотрудник 1");
    expect(wh.staff[1].name).toBe("Сотрудник 2");
    expect(wh.manager.name).toBe("Сотрудник 1");
  });
});

describe("обезличивание: ловушка на поля, которых в правилах нет", () => {
  // Завтра в карточку сотрудника добавят «ФИО полностью» или СНИЛС, а в товар —
  // описание с контактом. Ни одно из этих имён поля правило не знает заранее.
  const state = {
    warehouse: {
      id: "w1",
      staff: [
        {
          id: "s1",
          name: "Иванов Иван",
          fio: "Иванов Иван Иванович",
          fullName: "Иванов Иван Иванович",
          snils: "112-233-445 95",
          passport: "4510 123456",
          nickname: "Ваня-кладовщик",
          role: "Кладовщик",
          hourlyRate: 300,
          createdAt: 1,
        },
      ],
      partners: [{ id: "p1", name: "ИП Сидоров", bik: "044525225", rs: "40802810900000000001" }],
    },
    account: { type: "company", name: "Иван", org: "ООО Ромашка", inn: "503600000123" },
    products: [
      {
        id: "g1",
        name: "Кружка",
        barcode: "4600000000017",
        description: "Иванов Иван +7 999 123-45-67, ivan@example.ru",
      },
    ],
    lat: 55.75,
  };
  const { data } = anonymizeSnapshot(state);
  const json = JSON.stringify(data);

  it("ни почты, ни телефона, ни ИНН, ни ФИО, ни документов", () => {
    for (const leak of [
      "Иванов",
      "Иван",
      "Ваня",
      "Сидоров",
      "Ромашка",
      "503600000123",
      "044525225",
      "40802810900000000001",
      "112-233-445",
      "4510 123456",
      "999 123",
      "example.ru",
      "55.75",
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it("у карточки человека остаются роль, числа и даты, у товара — штрихкод", () => {
    const s = (data as { warehouse: { staff: Record<string, unknown>[] } }).warehouse.staff[0];
    expect(s).toEqual({
      id: "s1",
      name: "Сотрудник 1",
      role: "Кладовщик",
      hourlyRate: 300,
      createdAt: 1,
    });
    expect(json).toContain("4600000000017");
  });
});

describe("отправка обращения", () => {
  it("уходит на /api/support/reports и возвращает номер", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 7 })));
    const report = buildReport({ message: "не работает", env, state: null, entries: [] });
    const res = await sendReport(report, fetchImpl as unknown as typeof fetch);
    expect(res).toEqual({ ok: true, data: { id: 7 } });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/support/reports",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("отказ сервера и обрыв связи — ключ ошибки, а не исключение", async () => {
    const report = buildReport({ message: "x", env, state: null, entries: [] });
    const tooOften = vi.fn(async () => new Response("", { status: 429 }));
    expect(await sendReport(report, tooOften as unknown as typeof fetch)).toEqual({
      ok: false,
      error: "support.error.tooOften",
    });
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendReport(report, down as unknown as typeof fetch)).toEqual({
      ok: false,
      error: "support.error.failed",
    });
  });

  it("слишком большое не отправляет вовсе", async () => {
    const fetchImpl = vi.fn();
    const report = buildReport({
      message: "x",
      env,
      state: { products: [{ id: "g", name: "a".repeat(MAX_REPORT_BYTES) }] },
      entries: [],
    });
    expect(await sendReport(report, fetchImpl as unknown as typeof fetch)).toEqual({
      ok: false,
      error: "support.error.tooLarge",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("стирает контакты и из сообщения человека", () => {
    const report = buildReport({
      message: "звоните +7 900 000 00 00",
      env,
      state: null,
      entries: [],
    });
    expect(report.message).toBe("звоните [телефон]");
  });
});

describe("сводка копии для окна", () => {
  it("считает сотрудников и записи, пустое не показывает", () => {
    const data = {
      warehouse: { staff: [{ id: "s1" }, { id: "s2" }] },
      products: [{}, {}, {}],
      shipments: [],
    };
    expect(snapshotSummary(data)).toEqual([
      { label: "support.sum.staff", n: 2 },
      { label: "support.sum.products", n: 3 },
    ]);
    expect(snapshotSummary(undefined)).toEqual([]);
  });
});

describe("копия только открытого склада", () => {
  it("убирает другие склады, их работу и чужие товары с местами", () => {
    const state = {
      warehouse: { id: "w1" },
      otherWarehouses: [{ id: "w2", name: "Склад на Кольцевой" }],
      warehouseData: { w2: { requests: [{ id: "r9" }] } },
      products: [{ id: "g1", warehouseId: "w1" }, { id: "g2", warehouseId: "w2" }, { id: "g3" }],
      placements: { g1: "A-1", g2: "B-2" },
    };
    expect(activeWarehouseOnly(state)).toEqual({
      warehouse: { id: "w1" },
      products: [{ id: "g1", warehouseId: "w1" }, { id: "g3" }],
      placements: { g1: "A-1" },
    });
  });
});
