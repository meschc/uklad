// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { packText } from "../../storeCodec";
import { PERSIST_KEY } from "../persistStorage";
import { DEMO_MAX_AGE_DAYS, DEMO_SEED_KEY, DEMO_SEED_VERSION, isDemoStale } from "../seedVersion";

/**
 * Демо должно быть полным: что склад умеет, то посетитель и видит. Тест
 * собирает настоящий стор на пустом браузере (то есть с посевом) и проверяет
 * каждое сохраняемое поле: либо посев его наполнил, либо поле названо ниже
 * как «пустое по смыслу» — с причиной.
 *
 * Добавили доменное поле в `persistedState` — тест упадёт, пока вы не решили:
 * сеять его (правка в `seed*.ts`, при необходимости `DEMO_SEED_VERSION`) или
 * вписать сюда с причиной, почему пусто. Молча оставить демо без новой функции
 * нельзя — за этим тест и нужен.
 */

/** Поля, которые в только что собранном демо пусты по смыслу. */
const EMPTY_BY_DESIGN: Record<string, string> = {
  warehouseData: "работа НЕактивных складов: у демо-складов она общая с активным",
  seenHints: "подсказки показываются новому человеку, посев их не гасит",
  stationSession: "вход на стол по бейджу, живёт 12 часов, не данные склада",
  packSession: "незакрытая упаковка у стола, не данные склада",
  stationLock: "остановка стола до бейджа старшего, у каждого устройства своя",
  thisDeviceId: "привязка этого устройства к столу, у каждого браузера своя",
  layoutTemplates: "шаблоны раскладки сохраняет сам человек",
  integrations: "ключи площадок вводит сам человек; синтетику не показываем",
  chats: "переписку сеет `seedChatsOnce` при первом показе чата (ChatWatcher), не стор",
};

/**
 * ПРОБЕЛЫ демо, найденные тестом при первом запуске: поля есть в кабинете, а
 * посетителю показать нечего. Это долг, а не решение: закрывается отдельным
 * PR (посев + `DEMO_SEED_VERSION`, строка отсюда уходит). Короба отгрузки и
 * споры входят в книгу товара (`ledger.ts`), поэтому сеять их надо вместе с
 * остатками и проверкой `stock.invariant`, а не «для вида».
 */
const GAPS: Record<string, string> = {
  docRecords: "нет тронутых и подтверждённых документов: накладные только черновики",
  outboundBoxes: "нет коробов отгрузки: сортировка и погрузка пусты",
};
const KNOWN_EMPTY = { ...EMPTY_BY_DESIGN, ...GAPS };

function filled(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "string") return value !== "";
  return true;
}

async function freshStore() {
  vi.resetModules();
  return await import("../index");
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

describe("покрытие посева", () => {
  it("каждое сохраняемое поле либо посеяно, либо пусто по названной причине", async () => {
    const { useEditor, persistedState } = await freshStore();
    const state = persistedState(useEditor.getState()) as Record<string, unknown>;

    const empty = Object.keys(state).filter((k) => !filled(state[k]));
    const unexplained = empty.filter((k) => !(k in KNOWN_EMPTY));
    expect(unexplained, `посев не наполнил: ${unexplained.join(", ")}`).toEqual([]);

    // Обратное: названное пустым, но уже наполненное, — устаревшее исключение.
    const stale = Object.keys(KNOWN_EMPTY).filter((k) => filled(state[k]));
    expect(stale, `уже посеяно, уберите из исключений: ${stale.join(", ")}`).toEqual([]);

    // Все исключения указывают на существующее поле.
    expect(Object.keys(KNOWN_EMPTY).filter((k) => !(k in state))).toEqual([]);
  });

  it("у активного склада есть работа во всех её доменах", async () => {
    const { useEditor } = await freshStore();
    const s = useEditor.getState();
    const domains: Record<string, unknown> = {
      expectedShipments: s.expectedShipments,
      receivingEvents: s.receivingEvents,
      boxes: s.boxes,
      pallets: s.pallets,
      requests: s.requests,
      shipments: s.shipments,
      tasks: s.tasks,
      devices: s.devices,
      staffEvents: s.staffEvents,
    };
    // Документы и короба отгрузки — в `GAPS` выше.
    const blank = Object.keys(domains).filter((k) => !filled(domains[k]));
    expect(blank, `в демо пусто: ${blank.join(", ")}`).toEqual([]);
  });
});

describe("версия посева", () => {
  it("устарело только демо без сервера, у которого версия не совпала", () => {
    expect(isDemoStale(true, null, false)).toBe(true);
    expect(isDemoStale(true, String(DEMO_SEED_VERSION - 1), false)).toBe(true);
    expect(isDemoStale(true, String(DEMO_SEED_VERSION), false)).toBe(false);
    // Первый запуск: стирать нечего.
    expect(isDemoStale(false, null, false)).toBe(false);
    // Сервер: данные компании никакой посев не заменяет.
    expect(isDemoStale(true, null, true)).toBe(false);
  });

  it("даты демо относительные: через неделю демо собирается заново, раньше — нет", () => {
    const day = 86_400_000;
    const now = 100 * day;
    const v = String(DEMO_SEED_VERSION);
    expect(isDemoStale(true, v, false, String(now - (DEMO_MAX_AGE_DAYS - 1) * day), now)).toBe(
      false,
    );
    expect(isDemoStale(true, v, false, String(now - (DEMO_MAX_AGE_DAYS + 1) * day), now)).toBe(
      true,
    );
    // Метки нет — не гадаем, ключ запишется на этом запуске.
    expect(isDemoStale(true, v, false, null, now)).toBe(false);
    // Кабинет с сервером никакой посев не заменяет.
    expect(isDemoStale(true, v, true, String(now - 90 * day), now)).toBe(false);
  });

  /** Возвращает стор посетителя, у которого сохранено демо под номером `seedKey`. */
  async function visitorWith(seedKey: string | null) {
    const first = await freshStore();
    const base = first.persistedState(first.useEditor.getState());
    localStorage.clear();
    const blob = {
      state: { ...base, profile: { ...base.profile, name: "МАРКЕР ПОСЕТИТЕЛЯ" } },
      version: first.PERSIST_VERSION,
    };
    localStorage.setItem(PERSIST_KEY, packText(JSON.stringify(blob)));
    if (seedKey != null) localStorage.setItem(DEMO_SEED_KEY, seedKey);
    return (await freshStore()).useEditor.getState();
  }

  it("вернувшийся с прошлой версией получает свежее демо", async () => {
    const s = await visitorWith(String(DEMO_SEED_VERSION - 1));
    expect(s.profile.name).not.toBe("МАРКЕР ПОСЕТИТЕЛЯ");
    expect(s.requests.length).toBeGreaterThan(0);
    expect(localStorage.getItem(DEMO_SEED_KEY)).toBe(String(DEMO_SEED_VERSION));
  });

  it("с текущей версией свои правки в демо остаются", async () => {
    const s = await visitorWith(String(DEMO_SEED_VERSION));
    expect(s.profile.name).toBe("МАРКЕР ПОСЕТИТЕЛЯ");
  });

  it("новый посетитель получает посев и номер версии", async () => {
    const { useEditor } = await freshStore();
    expect(useEditor.getState().products.length).toBeGreaterThan(0);
    expect(localStorage.getItem(DEMO_SEED_KEY)).toBe(String(DEMO_SEED_VERSION));
  });
});
