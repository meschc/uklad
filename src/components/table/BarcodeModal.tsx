import { useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { printLabels } from "@/lib/printLabels";
import type { LabelTemplate, Product } from "@/lib/types";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelCard } from "@/components/fulfillment/LabelCard";
import { LabelPrint } from "@/components/fulfillment/LabelPrint";
import { FitToWidth } from "@/components/fulfillment/FitToWidth";

/** Сколько ярлыков товара можно отправить на печать за раз. */
const MAX_COPIES = 500;

/**
 * Ярлык товара из таблицы — печать, а не картинка (Кирилл 12 ноя: «странно
 * что штрихкод, а по факту QR; тогда не скачать PNG, а напечатать, и шаблон
 * такой же, как на странице ярлыков»).
 *
 * Вид у ярлыка товара свой и постоянный: 58×40 горизонтально, название,
 * штрихкод, цифры (Кирилл 24.11). Раньше брался первый шаблон со страницы
 * «Ярлыки», и у склада, где первым стоит короб 58×60 с маркировкой, товар
 * печатался коробом. Код на ярлыке товара — всегда штрихкод:
 * это номер из каталога, его читает и наш сканер, и сканер маркетплейса.
 * Порядкового номера «1/12» у товара нет — это не тара.
 */
const PRODUCT_LABEL: LabelTemplate = {
  id: "product-default",
  name: "58×40",
  widthMm: 58,
  heightMm: 40,
  layout: "horizontal",
  codeType: "barcode",
  elements: ["title", "code"],
  codeScale: 0.6,
  createdAt: 0,
};

export function BarcodeModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const t = useT();
  const warehouseName = useEditor((s) => s.warehouse.name);
  const [copies, setCopies] = useState(1);
  // На ярлык — тот же код, что в карточке: по нему сканер и найдёт товар.
  // Раньше код не из 13 цифр печатался «исправленным» EAN, и напечатанный
  // ярлык товар не находил. Нет штрихкода — артикул.
  const code = product.barcode.trim() || product.sku;
  const tpl = PRODUCT_LABEL;
  const n = Math.max(1, Math.min(MAX_COPIES, Math.round(copies) || 1));

  return createPortal(
    <DialogShell size="md" onClose={onClose}>
      <DialogHeader>
        <p className="text-sm font-semibold">{t("barcode.title")}</p>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("support.close")}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex flex-col gap-4 px-5 py-5">
        <FitToWidth widthMm={tpl.widthMm} heightMm={tpl.heightMm}>
          <LabelCard
            tpl={tpl}
            code={code}
            kind="custom"
            headline={product.name}
            warehouseName={warehouseName}
            index={1}
            total={n}
          />
        </FitToWidth>
        <p className="text-xs text-muted-foreground">{t("barcode.template", { name: tpl.name })}</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="barcode-copies">{t("barcode.copies")}</Label>
          <Input
            id="barcode-copies"
            type="number"
            min={1}
            max={MAX_COPIES}
            value={copies}
            onChange={(e) => setCopies(+e.target.value)}
            className="w-28 text-right tabular-nums"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={() => printLabels()}>
          <Printer className="size-4" />
          {t("labels.printN", { n })}
        </Button>
      </DialogFooter>
      <LabelPrint
        tpl={tpl}
        items={Array.from({ length: n }, () => ({ code, headline: product.name }))}
        kind="custom"
        warehouseName={warehouseName}
      />
    </DialogShell>,
    document.body,
  );
}
