// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { WorkstationScreen } from "../WorkstationScreen";

/**
 * Спорное решает старший, не отходя от стола. Кнопка с числом открытых случаев
 * видна только ему: у рядового сотрудника её нет вовсе, а не просто отключена.
 */
function login(role: string) {
  const s = useEditor.getState();
  const staff = [{ id: "m1", name: "Тест", role }] as never;
  useEditor.setState({
    warehouse: { ...s.warehouse, staff },
    stationSession: {
      staffId: "m1",
      station: "pack",
      startedAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
    },
    disputes: [],
  });
  useEditor.getState().raiseDispute({
    kind: "shortage",
    toteCode: "UK-BOX-000007",
    productId: s.products[0].id,
    qty: 2,
    raisedBy: "other",
  });
}

describe("«Спорные» за столом", () => {
  beforeEach(() => {
    useEditor.setState({ stationSession: null, disputes: [] });
  });

  test("старший видит кнопку со счётчиком и решает в боковой панели", async () => {
    login("Старший смены");
    render(<WorkstationScreen />);

    await userEvent.click(screen.getByRole("button", { name: /Спорные\s*1/ }));
    await userEvent.click(screen.getByRole("button", { name: /Вернуть/ }));

    expect(useEditor.getState().disputes[0]).toMatchObject({
      resolution: "returned",
      resolvedBy: "m1",
    });
  });

  test("рядовой сотрудник кнопки «Спорные» не видит", () => {
    login("Упаковщик");
    render(<WorkstationScreen />);

    expect(screen.queryByRole("button", { name: /Спорные/ })).toBeNull();
  });
});
