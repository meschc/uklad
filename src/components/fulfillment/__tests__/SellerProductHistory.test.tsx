// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * История товара в карточке продавца: лента подписана «Склад», а не именем
 * сотрудника, и пустая история — понятной фразой, а не пустым местом.
 */
const productStory = vi.fn();
vi.mock("@/lib/data", async (orig) => ({
  ...(await orig<typeof import("@/lib/data")>()),
  journalRepository: { productStory: (...a: unknown[]) => productStory(...a) },
}));
vi.mock("../journalText", () => ({
  useEntryText: () => ({ what: () => "Мыло × 3", who: () => "Пётр", reason: () => "" }),
  actionKey: () => "journal.cabinetEdit",
}));

const { SellerProductHistory } = await import("../SellerProductHistory");

describe("история товара продавца", () => {
  it("показывает шаги с подписью «Склад», без имени сотрудника", async () => {
    productStory.mockResolvedValue({
      ok: true,
      data: {
        entries: [
          {
            id: "a",
            at: 1,
            receivedAt: 1,
            source: "desk",
            staffRef: null,
            kind: "recv_place",
            step: "receive",
            counted: false,
            flagged: false,
          },
        ],
        next: null,
      },
    });
    render(<SellerProductHistory productId="p-1" />);
    expect(await screen.findByText("Мыло × 3")).toBeTruthy();
    expect(screen.getByText(/Склад/)).toBeTruthy();
    expect(screen.queryByText(/Пётр/)).toBeNull();
    expect(productStory).toHaveBeenCalledWith("p-1");
  });

  it("пустая история — фраза, а не пустое место", async () => {
    productStory.mockResolvedValue({ ok: true, data: { entries: [], next: null } });
    render(<SellerProductHistory productId="p-2" />);
    expect(await screen.findByText("С этим товаром на складе ещё ничего не делали")).toBeTruthy();
  });
});
