import { describe, expect, it } from "vitest";
import { COMPARE, YES } from "../../site/components/warehouses/tariffsData";
import { cheapestWith, isBackupDue, TARIFF_FEATURES, TARIFF_IDS } from "../tariff";

/**
 * Кабинет обязан делать ровно то, что обещает таблица тарифов на сайте.
 * Расхождение молчаливое: сайт рисует галочку, а кабинет функцию прячет, и
 * узнаёт об этом клиент. Поэтому сверяем таблицу и кабинет напрямую.
 */

const DAY = 24 * 60 * 60 * 1000;

function siteRow(label: string) {
  const row = COMPARE.flatMap((g) => g.rows).find((r) => r.label.ru === label);
  if (!row) throw new Error(`на сайте нет строки «${label}»`);
  // Колонки таблицы — Оператор, Склад, Старт, как и TARIFF_IDS.
  return row.cells.map((c) => (typeof c === "string" ? c : c.ru));
}

describe("тарифы кабинета совпадают с сайтом", () => {
  it("персональный менеджер", () => {
    const site = siteRow("Персональный менеджер").map((c) => c === YES);
    expect(TARIFF_IDS.map((id) => TARIFF_FEATURES[id].personalManager)).toEqual(site);
  });

  it("копия на почту каждую неделю", () => {
    const site = siteRow("Автоматическая копия каждую неделю на почту").map((c) => c === YES);
    expect(TARIFF_IDS.map((id) => TARIFF_FEATURES[id].weeklyEmailBackup)).toEqual(site);
  });

  it("полная аналитика", () => {
    const site = siteRow("Аналитика").map((c) => c === "полная");
    expect(TARIFF_IDS.map((id) => TARIFF_FEATURES[id].fullAnalytics)).toEqual(site);
  });

  it("архив и напоминание есть во всех тарифах", () => {
    expect(siteRow("Резервная копия: скачать архив и восстановить из него")).toEqual([
      YES,
      YES,
      YES,
    ]);
    expect(siteRow("Напоминание сделать копию, срок выбираете сами")).toEqual([YES, YES, YES]);
  });

  it("младший тариф с функцией", () => {
    expect(cheapestWith("personalManager")).toBe("operator");
    expect(cheapestWith("weeklyEmailBackup")).toBe("warehouse");
  });
});

describe("isBackupDue", () => {
  const now = 100 * DAY;

  it("без единой копии — пора сразу", () => {
    expect(isBackupDue({ remindEveryDays: 7, emailWeekly: false }, now)).toBe(true);
  });

  it("срок не вышел — молчит, вышел — напоминает", () => {
    const b = { remindEveryDays: 7, emailWeekly: false };
    expect(isBackupDue({ ...b, lastBackupAt: now - 6 * DAY }, now)).toBe(false);
    expect(isBackupDue({ ...b, lastBackupAt: now - 7 * DAY }, now)).toBe(true);
  });

  it("«напомнить позже» откладывает, но не отменяет", () => {
    const b = { remindEveryDays: 7, emailWeekly: false, snoozedUntil: now + DAY };
    expect(isBackupDue(b, now)).toBe(false);
    expect(isBackupDue(b, now + DAY)).toBe(true);
  });

  it("выключенное напоминание не срабатывает никогда", () => {
    expect(isBackupDue({ remindEveryDays: 0, emailWeekly: false }, now)).toBe(false);
  });
});
