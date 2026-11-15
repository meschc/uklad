// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { WorkstationScreen } from "../WorkstationScreen";
import { formatAddress } from "@/lib/address";
import type { CellAddress } from "@/lib/types";

/**
 * Слепой пересчёт: сколько должно быть по учёту, экран не показывает ни до
 * скана тары, ни после пересчёта. Иначе число подгоняют под учёт.
 */
const BOOK_QTY = 4242;

function setup() {
  const s = useEditor.getState();
  const product = s.products[0];
  useEditor.setState({
    warehouse: {
      ...s.warehouse,
      staff: [{ id: "m1", name: "Тест", role: "Кладовщик" }] as never,
    },
    stationSession: {
      staffId: "m1",
      station: "inventory",
      startedAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
    },
    boxes: [
      {
        id: "b1",
        barcode: "UK-BOX-000137",
        createdAt: 1,
        address: { floorId: "f", moduleId: "m", shelfIndex: 0, cellIndex: 0 },
        lines: [{ productId: product.id, qty: BOOK_QTY }],
      },
    ],
    disputes: [],
    // Задание видно только на смене (ShiftGate).
    staffEvents: [{ id: "e0", staffId: "m1", type: "shift_start", at: Date.now() - 1000 }],
  });
  return product;
}

describe("Инвентаризация у стола", () => {
  beforeEach(() => {
    useEditor.setState({ stationSession: null, boxes: [], disputes: [] });
  });

  test("не сошлось: число учёта нигде не видно, старшему уходит спорное", async () => {
    const product = setup();
    render(<WorkstationScreen />);
    expect(screen.queryByText(new RegExp(String(BOOK_QTY)))).toBeNull();

    await userEvent.type(screen.getByRole("textbox"), "UK-BOX-000137{enter}");
    await screen.findByText(/Сканируйте каждый товар/);
    // Товар из тары заранее не подсказывается: считают то, что видят.
    expect(screen.queryByText(product.name)).toBeNull();

    await userEvent.type(screen.getAllByRole("textbox")[0], `${product.barcode}{enter}`);
    await screen.findByText(product.name);
    await userEvent.click(screen.getByRole("button", { name: /Завершить пересчёт/ }));

    await screen.findByText(/Расхождение передано старшему/);
    // Учёт не показан и после пересчёта.
    expect(screen.queryByText(new RegExp(String(BOOK_QTY - 1)))).toBeNull();
    const st = useEditor.getState();
    expect(st.disputes).toHaveLength(1);
    expect(st.disputes[0]).toMatchObject({
      kind: "inventory_short",
      qty: BOOK_QTY - 1,
      raisedBy: "m1",
      boxId: "b1",
    });
    // Остаток пересчёт не двигает.
    expect(st.boxes[0].lines[0].qty).toBe(BOOK_QTY);
  });

  test("сошлось: тара отмечена пересчитанной, спорного нет", async () => {
    const product = setup();
    useEditor.setState((s) => ({
      boxes: s.boxes.map((b) => ({ ...b, lines: [{ productId: product.id, qty: 1 }] })),
    }));
    render(<WorkstationScreen />);

    await userEvent.type(screen.getByRole("textbox"), "UK-BOX-000137{enter}");
    await screen.findByText(/Сканируйте каждый товар/);
    await userEvent.type(screen.getAllByRole("textbox")[0], `${product.barcode}{enter}`);
    await userEvent.click(await screen.findByRole("button", { name: /Завершить пересчёт/ }));

    await screen.findByText(/Сошлось/);
    await waitFor(() => expect(useEditor.getState().boxes[0].countedBy).toBe("m1"));
    expect(useEditor.getState().disputes).toEqual([]);
  });

  test("неизвестная тара не открывает пересчёт", async () => {
    setup();
    render(<WorkstationScreen />);
    await userEvent.type(screen.getByRole("textbox"), "UK-BOX-999999{enter}");
    await screen.findByText(/Не нашли такую тару/);
  });

  test("пустая ячейка: «пусто» записывается, найденное уходит излишком на свободную тару", async () => {
    const product = setup();
    const w = useEditor.getState().warehouse;
    const floor = w.floors[0];
    const m = floor.modules.find((x) => x.type === "section" && x.shelves?.length);
    if (!m) throw new Error("в демо нет секции с полками");
    const cell: CellAddress = { floorId: floor.id, moduleId: m.id, shelfIndex: 0, cellIndex: 0 };
    const label = formatAddress(w, cell);
    useEditor.setState((s) => ({
      boxes: [...s.boxes, { id: "t1", barcode: "UK-BOX-000500", createdAt: 1, lines: [] }],
      placements: {},
    }));
    render(<WorkstationScreen />);

    await userEvent.type(screen.getByRole("textbox"), `${label}{enter}`);
    await userEvent.click(await screen.findByRole("button", { name: /Ячейка пуста/ }));
    await screen.findByText(/Записали: ячейка пуста/);
    expect(useEditor.getState().disputes).toEqual([]);

    await userEvent.type(screen.getByRole("textbox"), `${label}{enter}`);
    await screen.findByText(/Сканируйте каждый товар, найденный/);
    await userEvent.type(screen.getAllByRole("textbox")[0], `${product.barcode}{enter}`);
    const finish = await screen.findByRole("button", { name: /Передать излишек старшему/ });
    expect((finish as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getAllByRole("textbox").at(-1)!, "UK-BOX-000500{enter}");
    await screen.findByText(/Найденное — в таре/);
    await userEvent.click(finish);
    await screen.findByText(/Расхождение передано старшему/);
    const st = useEditor.getState();
    expect(st.boxes.find((b) => b.id === "t1")?.address).toEqual(cell);
    expect(st.disputes).toMatchObject([
      { kind: "inventory_over", boxId: "t1", productId: product.id, qty: 1 },
    ]);
  });
});
