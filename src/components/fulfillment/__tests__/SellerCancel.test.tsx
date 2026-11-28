// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FulfillmentRequest } from "@/lib/types";

/**
 * Отмена своей заявки продавцом: кнопка только у своей новой заявки, и
 * отменяет второе нажатие, а не первое — без окна, но и не случайным кликом.
 */
const setStatus = vi.fn(async () => ({ ok: true as const, data: undefined }));
vi.mock("@/lib/data", () => ({ requestsRepository: { setStatus: () => setStatus() } }));

const { SellerCancel } = await import("../SellerCancel");

const req = (over: Partial<FulfillmentRequest> = {}): FulfillmentRequest => ({
  id: "req_s1",
  productId: "p-1",
  qty: 2,
  by: "seller",
  status: "new",
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe("отмена заявки продавцом", () => {
  test("своя новая: первое нажатие спрашивает, второе отменяет", async () => {
    render(<SellerCancel request={req()} />);
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(setStatus).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Да, отменить" }));
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledOnce());
  });

  test("заведённую складом, начатую и с бронью — кнопки нет", () => {
    for (const r of [
      req({ by: undefined }),
      req({ status: "in_progress" }),
      req({ pickedQty: 1 }),
      req({ reservedShipmentId: "exp-1" }),
      req({ toteId: "box-1" }),
    ]) {
      const { container, unmount } = render(<SellerCancel request={r} />);
      expect(container.textContent).toBe("");
      unmount();
    }
  });
});
