/**
 * Печать ярлыка площадки со стола упаковки: файл — в скрытый кадр, печать
 * кадра. В профиле «Уклад — упаковка» (`--kiosk-printing`, `silentPrint.ts`)
 * лента выходит без окна, в обычном браузере — окно печати.
 *
 * Ozon и Маркет отдают PDF — он и идёт в кадр. WB отдаёт картинку 58×40 мм
 * (PDF у WB нет): кадр получает страницу ровно под ленту с этой картинкой.
 * Кадр с `blob:` разрешает `frame-src` в `deploy/Caddyfile`.
 */
export function printLabelFile(base64: string, mime = "application/pdf"): void {
  const blob =
    mime === "application/pdf"
      ? new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: mime })
      : new Blob([imagePage(base64, mime)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
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

/** Страница под ленту 58×40 мм с картинкой ярлыка; mime — только картинка. */
function imagePage(base64: string, mime: string): string {
  const type = /^image\/(png|svg\+xml)$/.test(mime) ? mime : "image/png";
  return (
    "<!doctype html><meta charset=utf-8><style>@page{size:58mm 40mm;margin:0}" +
    "html,body{margin:0}img{display:block;width:58mm;height:40mm;object-fit:contain}</style>" +
    `<img alt="" src="data:${type};base64,${base64.replace(/[^A-Za-z0-9+/=]/g, "")}">`
  );
}
