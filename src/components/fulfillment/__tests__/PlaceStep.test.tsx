// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { translate, type MsgKey, type TFunc } from "@/lib/i18n";
import { EmbeddedShell } from "../embeddedShell";
import { PlaceStep } from "../receiving/PlaceStep";

/**
 * Загруженность на телефоне — только на рабочем месте, в шаге размещения
 * (Кирилл 28.11). В кабинете на «Приёмке» кнопки нет.
 */
const t = ((key: MsgKey, vars?: Record<string, string | number>) =>
  translate("ru", key, vars)) as TFunc;
const box = { id: "b1", barcode: "UK-BOX-1", createdAt: 1, lines: [] };
const heat = translate("ru", "heat.open");

describe("шаг размещения", () => {
  test("на рабочем месте есть кнопка загруженности", () => {
    render(
      <EmbeddedShell.Provider value={true}>
        <PlaceStep box={box} status="idle" onScan={() => {}} t={t} />
      </EmbeddedShell.Provider>,
    );
    expect(screen.getByRole("button", { name: heat })).toBeTruthy();
  });

  test("в кабинете кнопки нет", () => {
    render(<PlaceStep box={box} status="idle" onScan={() => {}} t={t} />);
    expect(screen.queryByRole("button", { name: heat })).toBeNull();
  });
});
