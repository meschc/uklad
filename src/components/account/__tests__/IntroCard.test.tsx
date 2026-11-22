// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEditor } from "@/lib/store";
import { IntroCard } from "../IntroCard";

/**
 * Обход столов 15.11: на новом компьютере владелец снова видел «Давайте
 * познакомимся», хотя компания уже названа. Имя профиля живёт в браузере,
 * название компании — в снимке компании.
 */
beforeEach(() => {
  useEditor.setState((s) => ({
    profile: { ...s.profile, name: "" },
    session: { ...s.session, readOnly: false },
  }));
});

describe("Давайте познакомимся", () => {
  test("компания названа — карточки нет, даже без имени в этом браузере", () => {
    useEditor.setState({ account: { type: "company", org: "ООО Ромашка" } as never });
    const { container } = render(<IntroCard />);
    expect(container.textContent).toBe("");
  });

  test("ни имени, ни названия — карточка есть", () => {
    useEditor.setState({ account: { type: "company", org: "" } as never });
    render(<IntroCard />);
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });
});
