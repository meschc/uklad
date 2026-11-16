// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanField } from "../ScanField";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ScanField: фокус всегда в поле", () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = ((q: string) => ({ matches: q === "(pointer: fine)" })) as never;
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(() => {
    vi.useRealTimers();
    host.remove();
  });

  const mount = () => {
    const root = createRoot(host);
    act(() =>
      root.render(
        <div>
          <ScanField label="Скан" onSubmit={() => {}} />
          <button type="button">Журнал</button>
          <input aria-label="Количество" />
        </div>,
      ),
    );
    return host.querySelector<HTMLInputElement>("#scan-input")!;
  };

  it("клик по кнопке или мимо — фокус возвращается в поле скана", () => {
    const scan = mount();
    expect(document.activeElement).toBe(scan);
    act(() => host.querySelector("button")!.focus());
    act(() => vi.runAllTimers());
    expect(document.activeElement).toBe(scan);
    act(() => scan.blur());
    act(() => vi.runAllTimers());
    expect(document.activeElement).toBe(scan);
  });

  it("другое поле ввода фокус не теряет", () => {
    const scan = mount();
    const qty = host.querySelector<HTMLInputElement>('[aria-label="Количество"]')!;
    act(() => qty.focus());
    act(() => vi.runAllTimers());
    expect(document.activeElement).toBe(qty);
    expect(document.activeElement).not.toBe(scan);
  });
});
