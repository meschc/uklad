// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fetchLabel = vi.fn();
const printPdf = vi.fn();
vi.mock("@/lib/data/platformLabelRepository", () => ({
  platformLabelRepository: { available: () => true, fetch: (id: string) => fetchLabel(id) },
}));
vi.mock("@/lib/printLabelFile", () => ({
  printLabelFile: (f: string, m: string) => printPdf(f, m),
}));

const { PlatformLabel } = await import("../PlatformLabel");

/** Ярлык площадки печатается сам, раз на посылку; «не готов» — с причиной и повтором. */
describe("PlatformLabel", () => {
  beforeEach(() => {
    fetchLabel.mockReset();
    printPdf.mockReset();
  });

  test("готовый ярлык печатается сам один раз", async () => {
    fetchLabel.mockResolvedValue({ ok: true, file: "UERG", mime: "application/pdf" });
    const { rerender } = render(<PlatformLabel requestId="r1" source="ozon" />);
    await screen.findByText(/Ярлык Ozon напечатан/);
    rerender(<PlatformLabel requestId="r1" source="ozon" />);
    expect(fetchLabel).toHaveBeenCalledTimes(1);
    expect(printPdf).toHaveBeenCalledWith("UERG", "application/pdf");
  });

  test("площадка ещё не дала ярлык — причина и повтор кнопкой", async () => {
    fetchLabel.mockResolvedValueOnce({
      ok: false,
      error: "ws.plabel.err.platform",
      detail: "POSTING_NOT_AWAITING_DELIVER",
    });
    render(<PlatformLabel requestId="r2" source="ozon" />);
    await screen.findByText(/ещё не выдала ярлык.*POSTING_NOT_AWAITING_DELIVER/);
    expect(printPdf).not.toHaveBeenCalled();
    fetchLabel.mockResolvedValueOnce({ ok: true, file: "QQ", mime: "application/pdf" });
    await userEvent.click(screen.getByRole("button", { name: /Ярлык Ozon ещё раз/ }));
    await waitFor(() => expect(printPdf).toHaveBeenCalledWith("QQ", "application/pdf"));
  });

  test("стикер WB — картинкой, а не PDF", async () => {
    fetchLabel.mockResolvedValueOnce({ ok: true, file: "iVBO", mime: "image/png" });
    render(<PlatformLabel requestId="r3" source="wildberries" />);
    await screen.findByText(/Ярлык WB напечатан/);
    expect(printPdf).toHaveBeenCalledWith("iVBO", "image/png");
  });
});
