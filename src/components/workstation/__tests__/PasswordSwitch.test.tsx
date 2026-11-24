// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditor } from "@/lib/store";
import { workstationRepository } from "@/lib/data";
import { BindDeviceForm } from "../BindDeviceForm";

/**
 * Кирилл 22.11 и 24.11: бейдж руководителя — поле сразу под «Рабочим местом»,
 * под ним мелкая ссылка «Нет бейджа? Ввести пароль», которая меняет поле на
 * пароль, и одна кнопка «Привязать» внизу — без отдельного шага ниже формы.
 */
describe("Бейдж руководителя в форме привязки", () => {
  const session = useEditor.getState().session;
  afterEach(() => {
    useEditor.setState({ session });
    vi.restoreAllMocks();
  });

  test("поле бейджа сразу, ссылка меняет его на пароль, кнопка одна", async () => {
    useEditor.setState({ session: { ...session, source: "server", permissions: undefined } });
    const add = vi
      .spyOn(workstationRepository, "addDevice")
      .mockResolvedValue({ ok: true, data: undefined } as never);
    render(<BindDeviceForm stacked />);

    expect(screen.getByPlaceholderText("UK-STF-…")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Привязать/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Нет бейджа? Ввести пароль" }));
    const pass = screen.getByLabelText(/Пароль руководителя/);
    expect(pass.getAttribute("type")).toBe("password");
    await userEvent.type(pass, "secret{Enter}");
    expect(add).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ password: "secret" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Есть бейдж? Отсканировать" }));
    expect(screen.queryByLabelText(/Пароль руководителя/)).toBeNull();
  });
});
