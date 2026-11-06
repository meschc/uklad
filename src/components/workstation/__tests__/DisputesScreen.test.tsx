// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { DisputesScreen } from "../DisputesScreen";

/**
 * Решает старший, а не тот, кто нашёл: рядовой сотрудник за столом видит спорное,
 * но кнопок решения у него нет. Руководитель из кабинета (без бейджа) решает.
 */
function raise() {
  return useEditor.getState().raiseDispute({
    kind: "not_in_tote",
    toteCode: "UK-BOX-000007",
    productId: useEditor.getState().products[0].id,
    raisedBy: "s1",
  });
}

describe("DisputesScreen", () => {
  beforeEach(() => {
    useEditor.setState({ disputes: [], stationSession: null });
  });

  test("пустой экран говорит, что спорного нет", () => {
    render(<DisputesScreen />);

    expect(screen.getByText("Спорного нет")).toBeTruthy();
  });

  test("руководитель из кабинета решает: запись уходит в «Решено»", async () => {
    const id = raise();
    render(<DisputesScreen />);

    await userEvent.click(screen.getByRole("button", { name: "Списать" }));

    const d = useEditor.getState().disputes.find((x) => x.id === id)!;
    expect(d).toMatchObject({ resolution: "written_off", resolvedBy: "manager" });
    expect(await screen.findByText("Решено")).toBeTruthy();
  });

  test("рядовому сотруднику по бейджу кнопки решения не показываются", () => {
    const worker = (useEditor.getState().warehouse.staff ?? []).find(
      (m) => !/старш|начальник|управляющ|руковод/i.test(m.role ?? ""),
    );
    expect(worker).toBeTruthy();
    useEditor.setState({
      stationSession: {
        staffId: worker!.id,
        station: "pack",
        startedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    });
    raise();
    render(<DisputesScreen />);

    expect(screen.getByText("Нет в таре")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Списать" })).toBeNull();
  });
});
