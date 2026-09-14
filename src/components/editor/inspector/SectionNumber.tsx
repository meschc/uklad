import { useEditor } from "@/lib/store";
import { rowOf } from "@/lib/address";
import { rowNumbers } from "@/lib/numbering";
import type { PlacedModule } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TFunc } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { eyebrow } from "@/components/ui/eyebrow";
import { Row } from "./fields";
import { RowSidedControl } from "./RowSidedControl";

/**
 * Адрес секции: этаж, ряд, номер. Показываем ДЕЙСТВУЮЩИЙ номер — свой, если
 * задан, иначе порядковый. Правка делает номер «ручным», и автонумерация его
 * больше не трогает.
 */
export function SectionNumber({
  module: m,
  siblings,
  t,
}: {
  module: PlacedModule;
  siblings: PlacedModule[];
  t: TFunc;
}) {
  const setModuleNumber = useEditor((s) => s.setModuleNumber);
  const setModuleRow = useEditor((s) => s.setModuleRow);
  const cfg = useEditor((s) => s.addressing);
  const floor = useEditor((s) => s.activeFloor());
  const effectiveRow = rowOf(floor, m.id);
  const rowPinned = m.row != null;
  // Номер этажа в адресе — это его поле `number`, а не позиция в списке:
  // этаж можно назвать «вторым», оставив первым по порядку.
  const floorNum = useEditor((s) => {
    const i = s.warehouse.floors.findIndex((f) => f.id === s.activeFloorId);
    return s.warehouse.floors[i]?.number ?? (i < 0 ? 0 : i) + 1;
  });
  const sections = siblings.filter((x) => x.type === "section");
  const ordinal = sections.findIndex((x) => x.id === m.id) + 1;
  const effective = m.number ?? ordinal;
  const manual = m.number != null;
  // Дубль номера — беда только ВНУТРИ одного ряда: адрес включает ряд, поэтому
  // «секция 4» в ряду 18 и «секция 4» в ряду 19 — разные адреса (п.11).
  const rowMap = cfg.useRows ? rowNumbers(floor) : null;
  const duplicate = sections.some(
    (x) =>
      x.id !== m.id &&
      (x.number ?? sections.indexOf(x) + 1) === effective &&
      (!rowMap || rowMap.get(x.id) === effectiveRow),
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Полный адрес секции: видно и правится целиком, а не одним числом */}
      <div className="rounded-md border border-border bg-muted/40 p-2">
        <p className={eyebrow()}>{t("insp.fullAddress")}</p>
        <p className="mt-0.5 font-mono text-base font-semibold tabular-nums">
          {[floorNum, ...(cfg.useRows ? [effectiveRow] : []), effective].join(cfg.separator)}
          <span className="text-muted-foreground/50">
            {cfg.separator}…{cfg.separator}…
          </span>
        </p>
      </div>

      {cfg.useRows && (
        <>
          <Row label={t("insp.rowNo")}>
            <Input
              type="number"
              min={1}
              className={cn("h-7 w-16 text-right", rowPinned && "border-primary/50")}
              value={effectiveRow}
              onChange={(e) => {
                const v = Math.round(+e.target.value);
                setModuleRow(m.id, Number.isFinite(v) && v > 0 ? v : undefined);
              }}
            />
          </Row>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {rowPinned ? t("insp.rowPinned") : t("insp.numberAuto")}
            </span>
            {rowPinned && (
              <button
                type="button"
                onClick={() => setModuleRow(m.id, undefined)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                {t("insp.numberReset")}
              </button>
            )}
          </div>
          <RowSidedControl row={effectiveRow} floor={floor} t={t} />
        </>
      )}

      <Row label={t("insp.number")}>
        <Input
          type="number"
          min={1}
          className={cn("h-7 w-16 text-right", duplicate && "border-destructive")}
          value={effective}
          onChange={(e) => {
            const v = Math.round(+e.target.value);
            setModuleNumber(m.id, Number.isFinite(v) && v > 0 ? v : undefined);
          }}
        />
      </Row>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {manual ? t("insp.numberManual") : t("insp.numberAuto")}
        </span>
        {manual && (
          <button
            type="button"
            onClick={() => setModuleNumber(m.id, undefined)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {t("insp.numberReset")}
          </button>
        )}
      </div>
      {duplicate && <span className="text-[11px] text-destructive">{t("insp.numberDup")}</span>}
    </div>
  );
}
