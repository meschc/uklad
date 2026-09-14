import { useState } from "react";
import { CopyPlus, RefreshCw } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { Floor } from "@/lib/types";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Row } from "./fields";
import { RowSidedControl } from "./RowSidedControl";

/**
 * Свойства РЯДА — обычная панель характеристик (как у секции), без особого
 * выделения (п.4): номер ряда, стороны прохода, «ещё такой же ряд» и
 * расформирование. Открывается выделением всего ряда (клик по ряду на плане).
 * Полки для секций ряда правятся в блоке ниже (общий редактор полок).
 */
export function RowInspector({ row, floor, t }: { row: number; floor: Floor; t: TFunc }) {
  const setRowForSelection = useEditor((s) => s.setRowForSelection);
  const cloneRow = useEditor((s) => s.cloneRow);
  const resetRowNumbers = useEditor((s) => s.resetRowNumbers);
  // Поле пересоздаётся при смене ряда (компонент монтируется с key={row}).
  const [value, setValue] = useState(String(row));

  const applyNumber = () => {
    const n = Math.round(+value);
    if (Number.isFinite(n) && n > 0 && n !== row) setRowForSelection(n);
  };

  return (
    <div className="flex flex-col gap-3">
      <Row label={t("insp.rowNo")}>
        <Input
          type="number"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={applyNumber}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyNumber();
          }}
          className="h-7 w-16 text-right"
        />
      </Row>

      <RowSidedControl row={row} floor={floor} t={t} />

      {/* Обновить адресацию ряда: сбрасывает ручные номера секций, чтобы они
          пересчитались по текущей схеме (стороннность/направление) — п.4. */}
      <Button size="sm" variant="outline" className="w-full" onClick={() => resetRowNumbers(row)}>
        <RefreshCw className="size-3.5" />
        {t("insp.rowRenumber")}
      </Button>

      <div className="flex flex-col gap-1">
        <Button size="sm" variant="outline" className="w-full" onClick={() => cloneRow(row)}>
          <CopyPlus className="size-3.5" />
          {t("insp.rowClone")}
        </Button>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t("insp.rowCloneHint")}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setRowForSelection(undefined)}
        className="self-start text-[11px] text-muted-foreground transition-colors hover:text-destructive"
      >
        {t("insp.rowUnpin")}
      </button>
    </div>
  );
}
