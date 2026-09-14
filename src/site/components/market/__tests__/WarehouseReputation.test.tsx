// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COMPLAINTS, WAREHOUSES, type Warehouse } from "../../../data/warehouses";
import { setLang } from "../../../lib/lang";
import { WarehouseReputation } from "../WarehouseReputation";

/**
 * Блок отзывов и жалоб на странице склада.
 *
 * Проверяется то, ради чего числа рейтинга убрали из данных: склад, с которым
 * ещё никто не работал, обязан выглядеть как склад без истории — без нуля, без
 * пустых звёзд и без «0 отзывов». Ноль в этом месте — утверждение о качестве,
 * которого никто не делал.
 */

const find = (ok: (w: Warehouse) => boolean, what: string): Warehouse => {
  const w = WAREHOUSES.find(ok);
  if (!w) throw new Error(`в наборе нет склада ${what}`);
  return w;
};

describe("WarehouseReputation", () => {
  beforeEach(() => setLang("ru"));

  test("склад без истории говорит об этом словами, а не нулём", () => {
    const w = find(
      (x) => x.reputation.reviews === 0 && x.reputation.openComplaints === 0,
      "без отзывов и жалоб",
    );

    render(<WarehouseReputation warehouse={w} />);

    expect(screen.getByText(/ещё не работали/)).toBeTruthy();
    expect(screen.queryByLabelText(/Оценка/)).toBeNull();
  });

  test("у склада с отзывами видна оценка каждого из них", () => {
    const w = find((x) => x.reputation.reviews > 0, "с отзывами");

    render(<WarehouseReputation warehouse={w} />);

    expect(screen.getAllByLabelText(/Оценка \d из 5/)).toHaveLength(w.reputation.reviews);
  });

  test("открытая жалоба показывает счёт дней молчания склада", () => {
    const id = COMPLAINTS.find((x) => x.answeredAt === undefined)?.warehouseId;
    const w = find((x) => x.id === id, "с открытой жалобой");

    render(<WarehouseReputation warehouse={w} />);

    expect(screen.getAllByText(/Склад не ответил/).length).toBeGreaterThan(0);
  });

  test("форма жалобы разворачивается и требует номер сделки", async () => {
    const w = find((x) => x.reputation.reviews > 0, "с отзывами");
    const user = userEvent.setup();

    render(<WarehouseReputation warehouse={w} />);
    // Свёрнутая форма — не экономия места: жалоба на виду у всех читателей
    // страницы выглядела бы приглашением её написать.
    expect(screen.queryByLabelText("Номер сделки")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Пожаловаться на склад" }));

    expect(screen.getByLabelText("Номер сделки")).toBeTruthy();
    expect(screen.getByText(/жалоба без сделки не публикуется/)).toBeTruthy();
  });
});
