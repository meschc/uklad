/**
 * Печать PDF ярлыка площадки со стола упаковки: PDF — в скрытый кадр, печать
 * кадра. В профиле «Уклад — упаковка» (`--kiosk-printing`, `silentPrint.ts`)
 * лента выходит без окна, в обычном браузере — окно печати.
 */
export function printPdf(base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Кадр живёт, пока печать не ушла; минуты хватает с запасом.
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(frame);
}
