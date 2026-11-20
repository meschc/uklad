// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";

// Сборка с сервером: тариф назначает Уклад, панель только просит.
vi.mock("@/lib/data/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/api")>()),
  hasCabinetServer: true,
}));
const request = vi.fn();
vi.mock("@/lib/data/planRepository", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/planRepository")>()),
  planRepository: { get: vi.fn(), request: (...a: unknown[]) => request(...a) },
}));

const { TariffLock } = await import("../TariffLock");

/**
 * Замок закрытой функции (Кирилл 19.11): видно, в каком тарифе она есть,
 * по нажатию — панель с ценой и оффером; с сервером кнопка отправляет
 * просьбу, а не переключает тариф в браузере.
 */
describe("TariffLock с сервером", () => {
  beforeEach(() => {
    request.mockReset();
    useEditor.getState().setTariff("start");
  });

  test("замок называет самый младший тариф с функцией и открывает панель с оффером", async () => {
    render(<TariffLock feature="fullAnalytics" />);
    await userEvent.click(screen.getByRole("button", { name: "«Склад»" }));

    expect(screen.getByText("Доступно в тарифе «Склад»")).toBeTruthy();
    expect(screen.getByText("Сейчас у вас «Старт»")).toBeTruthy();
    expect(screen.getByText(/Первым 10 складам/)).toBeTruthy();
  });

  test("«Попросить» отправляет просьбу на сервер, тариф в браузере не меняется", async () => {
    request.mockResolvedValue({ ok: true, data: null });
    render(<TariffLock feature="personalManager" />);
    await userEvent.click(screen.getByRole("button", { name: "«Оператор»" }));
    await userEvent.click(screen.getByRole("button", { name: "Попросить «Оператор»" }));

    expect(request).toHaveBeenCalledWith("operator");
    expect(await screen.findByText(/Просьба перейти на «Оператор» отправлена/)).toBeTruthy();
    expect(useEditor.getState().subscription.tariff).toBe("start");
    // Оффер первым складам — только про «Склад».
    expect(screen.queryByText(/Первым 10 складам/)).toBeNull();
  });

  test("отказ сервера остаётся в панели текстом", async () => {
    request.mockResolvedValue({ ok: false, error: "plan.err.forbidden" });
    render(<TariffLock feature="weeklyEmailBackup" />);
    await userEvent.click(screen.getByRole("button", { name: "«Склад»" }));
    await userEvent.click(screen.getByRole("button", { name: "Попросить «Склад»" }));

    expect(await screen.findByText("Тариф и оплату видит владелец компании.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
