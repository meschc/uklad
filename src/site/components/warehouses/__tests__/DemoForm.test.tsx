// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const sent: unknown[] = [];
vi.mock("../../../lib/leads", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/leads")>();
  return {
    ...real,
    hasLeadsEndpoint: () => true,
    sendLead: async (lead: unknown) => {
      sent.push(lead);
      return { ok: true };
    },
  };
});

const { DemoForm } = await import("../DemoForm");

/**
 * Демо открывает только личная ссылка из письма, поэтому заявка на него
 * обязана нести почту: заявка без почты — это «спасибо» человеку, которому
 * ничего не придёт.
 */
describe("DemoForm", () => {
  test("без согласия заявка не уходит", async () => {
    sent.length = 0;
    const user = userEvent.setup();
    render(<DemoForm idPrefix="t" />);
    await user.type(screen.getByLabelText(/Почта/), "kir@example.ru");
    await user.click(screen.getByRole("button", { name: /Получить ссылку/ }));
    expect(sent).toHaveLength(0);
  });

  test("телефон вместо почты не принимается", async () => {
    sent.length = 0;
    const user = userEvent.setup();
    render(<DemoForm idPrefix="t" />);
    await user.type(screen.getByLabelText(/Почта/), "+7 900 123-45-67");
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /Получить ссылку/ }));
    expect(sent).toHaveLength(0);
    expect(screen.getByText(/Нужна почта/)).toBeInTheDocument();
  });

  test("почта с согласием уходит заявкой вида demo", async () => {
    sent.length = 0;
    const user = userEvent.setup();
    render(<DemoForm idPrefix="t" />);
    await user.type(screen.getByLabelText(/Почта/), "kir@example.ru");
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /Получить ссылку/ }));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: "demo",
      fields: [{ value: "kir@example.ru" }],
      consent: { data: true, ads: false },
    });
  });

  test("по устаревшей ссылке форма говорит об этом", () => {
    render(<DemoForm idPrefix="t" expired />);
    expect(screen.getByText(/Ссылка на демо устарела/)).toBeInTheDocument();
  });
});
