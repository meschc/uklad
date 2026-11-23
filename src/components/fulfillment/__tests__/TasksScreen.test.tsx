// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import type { WarehouseTask } from "@/lib/types";
import { TasksScreen } from "../TasksScreen";

/**
 * «Задания» — один модуль: одна таблица, чипы, карточка в панели справа.
 * Пробуем сломать: пустой склад, фильтр без результата, двойное нажатие на
 * кнопку карточки, завершённое задание не в «активных».
 */
const work = (over: Partial<WarehouseTask>): WarehouseTask => ({
  id: "w-" + Math.random().toString(36).slice(2),
  kind: "marking",
  qty: 7,
  status: "open",
  createdAt: Date.now() - 3_600_000,
  ...over,
});

beforeEach(() => {
  useEditor.setState({
    requests: [],
    tasks: [],
    expectedShipments: [],
    boxes: [],
    outboundBoxes: [],
    disputes: [],
  });
});

describe("TasksScreen — единый модуль", () => {
  test("пустой склад: объяснение, а не пустая таблица", () => {
    render(<TasksScreen />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Заданий пока нет")).toBeTruthy();
  });

  test("работа склада в той же таблице; клик открывает карточку справа", async () => {
    useEditor.setState({ tasks: [work({})] });
    render(<TasksScreen />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(2); // шапка + задание
    await userEvent.click(within(table).getByRole("button", { name: /Маркировка штрихкодом/ }));
    const card = screen.getByRole("dialog");
    expect(within(card).getByRole("button", { name: /В\sработу/ })).toBeTruthy();
  });

  test("двойное нажатие «Закончить» не ломает запись: задание остаётся одно, статус done", async () => {
    const task = work({});
    useEditor.setState({ tasks: [task] });
    render(<TasksScreen />);
    await userEvent.click(screen.getByRole("button", { name: /Маркировка штрихкодом/ }));
    const done = within(screen.getByRole("dialog")).getByRole("button", {
      name: /Готово/,
    });
    await userEvent.dblClick(done);
    const tasks = useEditor.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe("done");
  });

  test("завершённое — не в «Все активные», а в «Завершённые»", async () => {
    useEditor.setState({ tasks: [work({ status: "done", doneAt: Date.now() })] });
    render(<TasksScreen />);
    // По умолчанию активных нет: таблицы нет, но не «склад пуст» — есть кнопка сброса.
    expect(screen.queryByRole("table")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Завершённые/ }));
    expect(screen.getByRole("table")).toBeTruthy();
  });

  test("фильтр без результата: говорит почему и возвращает все активные", async () => {
    useEditor.setState({ tasks: [work({})] });
    render(<TasksScreen />);
    await userEvent.click(screen.getByRole("button", { name: /Завершённые/ }));
    expect(screen.getByText("Заданий по этому фильтру нет")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Сбросить фильтр" }));
    expect(screen.getByRole("table")).toBeTruthy();
  });
});
