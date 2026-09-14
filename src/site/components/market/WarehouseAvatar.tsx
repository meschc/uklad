import { cn } from "@/lib/utils";
import { useT } from "../../lib/copy";
import { warehouseTint } from "../../lib/warehouseTint";
import type { Warehouse } from "../../data/warehouses";

/**
 * Знак склада. Настоящих логотипов у сгенерированных компаний нет, а
 * одинаковые серые заглушки превратили бы список в кашу — поэтому плитка берёт
 * собственный оттенок склада (`hue`) и держит первую букву названия.
 *
 * Оттенок приглушён намеренно. Плитка тёмная, буква — тот же тон, поднятый по
 * светлоте: двадцать знаков подряд читаются как ряд ровных квадратов с едва
 * уловимым подтоном, а не как рассыпанные леденцы. Различить два склада в
 * списке этого хватает, а перетягивать внимание с цены и занятости знаку
 * незачем — он не бренд, он якорь для глаза.
 *
 * Насыщенность и светлота фиксированы, меняется только тон: свободный подбор
 * всех трёх координат снова дал бы и кислотные плитки, и нечитаемые.
 */
export function WarehouseAvatar({
  warehouse,
  className,
}: {
  warehouse: Warehouse;
  className?: string;
}) {
  const t = useT();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "r-inset flex size-11 shrink-0 items-center justify-center font-display text-lg font-medium",
        className,
      )}
      style={warehouseTint(warehouse.hue)}
    >
      {t(warehouse.name).slice(0, 1)}
    </span>
  );
}
