// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ok } from "@/lib/data/result";
import { useT } from "@/lib/i18n";
import type { StaffMember } from "@/lib/types";

/**
 * Разбор staging 22.11: «бейдж меняется при каждом нажатии» и «не пускает на
 * рабочее место». Каждое открытие панели выпускало новый бейдж, а выпуск на
 * сервере гасит прежний — напечатанный бейдж переставал пускать за стол.
 * Открытие панели теперь ничего не выпускает; выпуск — только кнопкой.
 */
const repo = vi.hoisted(() => ({
  revocable: vi.fn(() => true),
  shown: vi.fn((_id: string): string | null => null),
  issue: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/lib/data", async (orig) => ({
  ...(await orig<typeof import("@/lib/data")>()),
  badgeRepository: repo,
}));

const { BadgePanel } = await import("../BadgePanel");

const IVAN: StaffMember = { id: "stf-ivan", name: "Иван Петров", role: "Упаковщик" };

function Panel() {
  const t = useT();
  return <BadgePanel member={IVAN} onClose={() => {}} t={t} />;
}

beforeEach(() => {
  repo.revocable.mockReturnValue(true);
  repo.shown.mockReturnValue(null);
  repo.issue.mockReset();
  repo.revoke.mockReset();
});

describe("Бейдж сотрудника", () => {
  test("с сервером: открытие панели не выпускает и не гасит бейдж", () => {
    render(<Panel />);
    expect(repo.issue).not.toHaveBeenCalled();
    expect(repo.revoke).not.toHaveBeenCalled();
    expect(screen.getByText(/погасит прежний/)).toBeTruthy();
  });

  test("с сервером: новый бейдж — только по кнопке, один выпуск", async () => {
    repo.issue.mockResolvedValue(ok("UK-STF-CCCCCCCCCCCCCCCCCCCCCC"));
    render(<Panel />);
    await userEvent.click(screen.getByRole("button", { name: /Выпустить новый бейдж/ }));
    expect(repo.issue).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("UK-STF-CCCCCCCCCCCCCCCCCCCCCC")).toBeTruthy();
  });

  test("демо: код вечный — показан сразу, без выпуска", () => {
    repo.revocable.mockReturnValue(false);
    repo.shown.mockReturnValue("UK-STF-stf-ivan");
    render(<Panel />);
    expect(screen.getByText("UK-STF-stf-ivan")).toBeTruthy();
    expect(repo.issue).not.toHaveBeenCalled();
  });
});
