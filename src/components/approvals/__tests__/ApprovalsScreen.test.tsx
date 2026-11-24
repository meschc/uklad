// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { ApprovalsScreen } from "../ApprovalsScreen";

/**
 * «Подтверждения» — одно место всех решений старшего (Кирилл 16.11):
 * спорный товар со столов здесь же, рядом со сменой процесса, и фильтр
 * по виду сужает список.
 */
function raise(kind: "shortage" | "not_packable", productIndex: number) {
  const p = useEditor.getState().products[productIndex];
  useEditor.getState().raiseDispute({ kind, productId: p.id, raisedBy: "s1" });
  return p.name;
}

describe("ApprovalsScreen", () => {
  beforeEach(() => {
    useEditor.setState({ disputes: [], switchRequests: [], stationSession: null });
  });

  test("пусто — одна подпись, без фильтра", async () => {
    render(<ApprovalsScreen />);
    expect(await screen.findByText("Ждущих решения нет")).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
  });

  test("недостача и брак видны на странице, фильтр оставляет один вид", async () => {
    const short = raise("shortage", 0);
    const defect = raise("not_packable", 1);
    render(<ApprovalsScreen />);

    expect(await screen.findByText(short)).toBeTruthy();
    expect(screen.getByText(defect)).toBeTruthy();

    const filter = screen.getByRole("group", { name: "Вид заявки" });
    await userEvent.click(within(filter).getByText(/Брак/));
    expect(screen.queryByText(short)).toBeNull();
    expect(screen.getByText(defect)).toBeTruthy();
  });

  test("руководитель решает спорное прямо здесь", async () => {
    const name = raise("shortage", 0);
    render(<ApprovalsScreen />);
    await screen.findByText(name);
    await userEvent.click(screen.getByText("Вернуть на место"));
    expect(useEditor.getState().disputes[0].resolution).toBe("returned");
  });

  test("решённое — во вкладке «Решённые» таблицей, строка открывает панель", async () => {
    const name = raise("shortage", 0);
    render(<ApprovalsScreen />);
    await screen.findByText(name);
    await userEvent.click(screen.getByText("Вернуть на место"));

    // Во «Ждут решения» решённого больше нет.
    expect(screen.queryByText(name)).toBeNull();
    const tabs = screen.getByRole("group", { name: "Заявки" });
    await userEvent.click(within(tabs).getByText(/Решённые/));
    await userEvent.click(screen.getByRole("button", { name }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText("Решение")).toBeTruthy();
    expect(within(panel).getByText(/Вернули/)).toBeTruthy();
  });
});
