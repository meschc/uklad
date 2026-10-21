import { Box as BoxIcon, Layers } from "lucide-react";
import type { SealedUnits } from "@/lib/cargo";
import { type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";

/**
 * Места поставки, принятые на грузовой приёмке и ещё не вскрытые. Нажать на
 * место — то же, что отсканировать его ярлык: ярлык мог отклеиться, а работу
 * это останавливать не должно.
 */
export function SealedList({
  units,
  onOpen,
  t,
}: {
  units: SealedUnits;
  onOpen: (code: string) => void;
  t: TFunc;
}) {
  if (units.pallets.length + units.boxes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className={eyebrow()}>{t("recv.sealed.title")}</p>
      <div className="flex flex-wrap gap-2">
        {units.pallets.map((p) => (
          <Button key={p.id} size="sm" variant="outline" onClick={() => onOpen(p.barcode)}>
            <Layers className="size-3.5" />
            <span className="font-mono text-xs">{p.barcode}</span>
          </Button>
        ))}
        {units.boxes.map((b) => (
          <Button key={b.id} size="sm" variant="outline" onClick={() => onOpen(b.barcode)}>
            <BoxIcon className="size-3.5" />
            <span className="font-mono text-xs">{b.barcode}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
