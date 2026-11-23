// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEditor } from "@/lib/store";
import type { FulfillmentRequest } from "@/lib/types";

/**
 * Без связи отмены заказов с площадки не приходят (23.11): машину не
 * отправляют вслепую — кнопка закрыта и сказано, что делать.
 */
const net = vi.hoisted(() => ({ state: "offline" as "ok" | "weak" | "offline" }));
vi.mock("@/lib/useNetwork", () => ({ useNetwork: () => net.state }));

const { ShipStation } = await import("../ShipStation");

const R1 = {
  id: "r1",
  productId: "p1",
  qty: 1,
  status: "done",
  note: "Тула",
  vehicle: "А123ВС77",
} as unknown as FulfillmentRequest;

describe("Погрузка без связи", () => {
  test("нет связи — машину не отправить, на экране что делать", () => {
    useEditor.setState({ requests: [R1], outboundBoxes: [] });
    net.state = "offline";
    render(<ShipStation staffId="stf-ivan" />);
    expect(screen.getByText(/Нет связи: отмены заказов не сверены/)).toBeTruthy();
  });

  test("связь есть — подсказки нет", () => {
    useEditor.setState({ requests: [R1], outboundBoxes: [] });
    net.state = "ok";
    render(<ShipStation staffId="stf-ivan" />);
    expect(screen.queryByText(/Нет связи: отмены заказов не сверены/)).toBeNull();
  });
});
