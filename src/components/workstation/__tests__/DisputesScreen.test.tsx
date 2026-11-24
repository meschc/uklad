// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { navFor } from "@/components/nav/navItems";
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
    // Списание в один клик не уходит: сначала причина и подтверждение.
    expect(useEditor.getState().disputes[0].resolution).toBeUndefined();
    const confirm = screen.getByRole("button", { name: "Списать безвозвратно" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByPlaceholderText("Причина списания"), "пересчитали, нет");
    await userEvent.click(confirm);

    const d = useEditor.getState().disputes.find((x) => x.id === id)!;
    expect(d).toMatchObject({
      resolution: "written_off",
      resolvedBy: "manager",
      note: "пересчитали, нет",
    });
    expect(await screen.findByText("Решено")).toBeTruthy();
  });

  test("просроченный вход по бейджу не превращается в права руководителя", () => {
    useEditor.setState({
      stationSession: { staffId: "s1", station: "pack", startedAt: 0, expiresAt: 1 },
    });
    raise();
    render(<DisputesScreen />);

    expect(screen.queryByRole("button", { name: "Списать" })).toBeNull();
  });

  test("продавцу кнопки решения не показываются, даже если экран открыт", () => {
    const user = useEditor.getState().session.user;
    useEditor.setState({
      session: { ...useEditor.getState().session, user: { ...user, role: "seller" } },
    });
    raise();
    render(<DisputesScreen />);

    expect(screen.queryByRole("button", { name: "Списать" })).toBeNull();
    useEditor.setState({
      session: { ...useEditor.getState().session, user: { ...user, role: "warehouse" } },
    });
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

describe("доступ к экрану по роли", () => {
  test("«Подтверждения» — чип «Заданий»: своего пункта в меню нет, продавцу нет и страницы", () => {
    const views = navFor("warehouse").map((n) => n.view);
    expect(views).not.toContain("disputes");
    expect(views).not.toContain("approvals");
    expect(views).toContain("tasks");
    expect(navFor("seller").some((n) => n.view === "tasks")).toBe(false);
  });

  test("с правом смотреть спорное открыты «Задания», где подтверждения", () => {
    const views = navFor("warehouse", ["goods.view"]).map((n) => n.view);
    expect(views).toContain("tasks");
  });
});
