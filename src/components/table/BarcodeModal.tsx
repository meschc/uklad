import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { isValidEan13, toEan13 } from "@/lib/barcode";
import { QR_QUIET_ZONE, qrMatrix } from "@/lib/qr";
import { useT } from "@/lib/i18n";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { QrSvg } from "./QrSvg";

/**
 * Модальное окно кода товара с экспортом в PNG (белый фон). В QR уходит тот же
 * EAN-13, что и в карточке товара: номер остаётся стандартным GS1, меняется
 * только носитель — печатаем и клеим мы уже один тип кода на весь склад (п.5).
 *
 * Рисуем на canvas прямо из матрицы модулей — растеризация не зависит от SVG и
 * всегда даёт чёткий PNG без «мыла» на границах модулей.
 */
export function BarcodeModal({ code, onClose }: { code: string; onClose: () => void }) {
  const t = useT();
  const normalized = isValidEan13(code) ? code : toEan13(code);

  const exportPng = () => {
    const matrix = qrMatrix(normalized);
    const scale = 8;
    const span = matrix.length + QR_QUIET_ZONE * 2;
    const textH = 34;
    const w = span * scale;
    const h = w + textH;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        ctx.fillRect((c + QR_QUIET_ZONE) * scale, (r + QR_QUIET_ZONE) * scale, scale, scale);
      }
    }
    ctx.font = `${textH - 12}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText(normalized, w / 2, h - 8);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-${normalized}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return createPortal(
    <DialogShell size="sm" onClose={onClose}>
      <DialogHeader>
        <p className="text-sm font-semibold">{t("barcode.title")}</p>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4 px-5 py-5">
        <div className="w-full rounded-md border border-border bg-white p-4">
          <QrSvg code={normalized} size={180} className="w-full" />
        </div>
        <Button size="sm" className="w-full" onClick={exportPng}>
          <Download className="size-4" />
          {t("barcode.exportPng")}
        </Button>
      </div>
    </DialogShell>,
    document.body,
  );
}
