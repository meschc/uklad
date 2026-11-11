// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { WorkstationScreen } from "../WorkstationScreen";

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
});
