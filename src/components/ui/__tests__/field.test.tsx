// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "../field";
import { ToastCard } from "../toast";

describe("Field", () => {
  it("ошибка стоит под полем и связана с ним", () => {
    render(
      <Field label="Почта" error="Нужна почта">
        <input />
      </Field>,
    );
    const input = screen.getByLabelText("Почта");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const note = screen.getByRole("alert");
    expect(note.textContent).toContain("Нужна почта");
    expect(input.getAttribute("aria-describedby")).toBe(note.id);
  });

  it("без ошибки — подсказка, поле не помечено", () => {
    render(
      <Field label="Почта" hint="На неё придёт счёт">
        <input />
      </Field>,
    );
    const input = screen.getByLabelText("Почта");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe(
      "На неё придёт счёт",
    );
  });
});

describe("ToastCard", () => {
  const close = { label: "Закрыть", onClick: () => {} };
  it("отказ читается сразу и без зелёной галочки", () => {
    render(<ToastCard tone="error" text="Сервер не принял" close={close} />);
    expect(screen.getByRole("alert").dataset.tone).toBe("error");
  });
  it("успех — вежливо, с крестиком", () => {
    render(<ToastCard tone="success" text="Скопировано" close={close} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeTruthy();
  });
});
