// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fail, ok } from "@/lib/data/result";

/**
 * Удаление аккаунта — необратимое для человека действие, поэтому проверяется
 * поведение, а не вёрстка: без пароля кнопка не нажимается, неверный пароль
 * оставляет форму на месте с ошибкой, и только принятое сервером удаление
 * стирает копию кабинета на этом компьютере.
 */
const leave = vi.fn();
vi.mock("@/lib/store/leave", () => ({ leaveServerSession: (n?: string) => leave(n) }));
vi.mock("../backupDownload", () => ({ downloadBackup: vi.fn() }));
const repo = vi.hoisted(() => ({
  info: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  revokeOthers: vi.fn(),
}));
vi.mock("@/lib/data/accountRepository", () => ({ accountRepository: repo }));

const { AccountDataSection } = await import("../AccountDataSection");

beforeEach(() => {
  leave.mockReset();
  repo.info.mockResolvedValue(ok({ email: "a@b.ru", deleteAt: null, otherSessions: 2 }));
  repo.revokeOthers.mockResolvedValue(ok(2));
});

describe("Безопасность и данные", () => {
  test("неверный пароль: форма на месте, копия не стёрта", async () => {
    repo.remove.mockResolvedValue(fail("account.err.password"));
    render(<AccountDataSection />);
    await userEvent.click(screen.getByRole("button", { name: "Удалить…" }));
    const submit = screen.getByRole("button", { name: "Удалить аккаунт" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Пароль от аккаунта"), "не-тот");
    await userEvent.click(submit);
    expect(await screen.findByText("Пароль не подходит.")).toBeTruthy();
    expect(leave).not.toHaveBeenCalled();
  });

  test("удаление принято: выход с пометкой «удалён»", async () => {
    repo.remove.mockResolvedValue(ok("2026-12-01T00:00:00.000Z"));
    render(<AccountDataSection />);
    await userEvent.click(screen.getByRole("button", { name: "Удалить…" }));
    await userEvent.type(screen.getByLabelText("Пароль от аккаунта"), "верный-пароль");
    await userEvent.click(screen.getByRole("button", { name: "Удалить аккаунт" }));
    expect(repo.remove).toHaveBeenCalledWith("верный-пароль");
    expect(leave).toHaveBeenCalledWith("deleted");
  });

  test("выход на других устройствах показывает, сколько закрыто", async () => {
    render(<AccountDataSection />);
    expect(await screen.findByText("Вход открыт ещё на 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^Выйти/ }));
    expect(await screen.findByText("Вышли на других устройствах: 2")).toBeTruthy();
  });
});
