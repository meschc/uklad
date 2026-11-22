// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BindConfirmStep } from "../BindConfirmStep";

/**
 * Кирилл 22.11: пароль руководителя — не отдельный блок, а мелкая ссылка
 * «Нет бейджа? Ввести пароль» под полем бейджа; по нажатию поле меняется на
 * пароль, и можно вернуться к скану.
 */
describe("Пароль руководителя под полем бейджа", () => {
  test("ссылка меняет поле бейджа на пароль и обратно", async () => {
    const onConfirm = vi.fn();
    render(<BindConfirmStep pending={false} error={null} onConfirm={onConfirm} />);
    expect(screen.queryByLabelText(/Пароль руководителя/)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Нет бейджа? Ввести пароль" }));
    const pass = screen.getByLabelText(/Пароль руководителя/);
    expect(pass.getAttribute("type")).toBe("password");
    await userEvent.type(pass, "secret{Enter}");
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ password: "secret" }));

    await userEvent.click(screen.getByRole("button", { name: "Есть бейдж? Отсканировать" }));
    expect(screen.queryByLabelText(/Пароль руководителя/)).toBeNull();
  });
});
