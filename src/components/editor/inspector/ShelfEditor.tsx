import { Rows3 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { shelfNumber } from "@/lib/address";
import {
  CELLS_MAX,
  CELLS_MIN,
  DEFAULT_PICK_PRIORITY,
  PICK_PRIORITY_MAX,
  PICK_PRIORITY_MIN,
  SHELF_MAX,
  SHELF_MIN,
  type PlacedModule,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TFunc } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eyebrow } from "@/components/ui/eyebrow";
import { CellStrip, Stepper } from "./fields";
import { SaveTemplateButton } from "./SaveTemplateButton";
import { cellsWord } from "./words";

/** Редактор полок/ячеек секции + раскрытый 2D-вид выбранной полки (ТЗ 2.3). */
export function ShelfEditor({ module: m, t }: { module: PlacedModule; t: TFunc }) {
  const shelves = m.shelves ?? [];
  const setShelfCount = useEditor((s) => s.setShelfCount);
  const setShelfCells = useEditor((s) => s.setShelfCells);
  const setShelfNumber = useEditor((s) => s.setShelfNumber);
  const setShelfPicking = useEditor((s) => s.setShelfPicking);
  const activeShelf = useEditor((s) => s.activeShelf);
  const setActiveShelf = useEditor((s) => s.setActiveShelf);
  const clearActiveShelf = useEditor((s) => s.clearActiveShelf);
  const activeIndex = activeShelf?.moduleId === m.id ? activeShelf.index : null;

  const toggle = (i: number) => (i === activeIndex ? clearActiveShelf() : setActiveShelf(m.id, i));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>{t("insp.shelvesLabel")}</Label>
        <Stepper
          value={shelves.length}
          min={SHELF_MIN}
          max={SHELF_MAX}
          onChange={(n) => setShelfCount(m.id, n)}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("insp.shelvesHint")}</p>

      <div className="flex flex-col gap-1.5">
        {shelves.map((sh, i) => {
          const active = i === activeIndex;
          return (
            <div
              key={sh.id}
              className={cn(
                "rounded-md border p-2 transition-colors",
                active ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    active ? "text-primary" : "text-foreground",
                  )}
                >
                  {t("insp.shelf", { n: i + 1 })}
                </button>
                <Stepper
                  value={sh.cells}
                  min={CELLS_MIN}
                  max={CELLS_MAX}
                  onChange={(c) => setShelfCells(m.id, i, c)}
                />
              </div>
              {/* Номер полки в адресе: не задан — считается по направлению */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className={eyebrow({ size: "xs", weight: "normal" })}>
                  {t("insp.shelfNo")}
                </span>
                <Input
                  type="number"
                  min={1}
                  className={cn(
                    "h-6 w-12 text-right text-xs",
                    sh.number != null && "border-primary/50",
                  )}
                  value={shelfNumber(m, i)}
                  onChange={(e) => {
                    const v = Math.round(+e.target.value);
                    setShelfNumber(m.id, i, Number.isFinite(v) && v > 0 ? v : undefined);
                  }}
                />
                {sh.number != null && (
                  <button
                    type="button"
                    onClick={() => setShelfNumber(m.id, i, undefined)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {t("insp.numberReset")}
                  </button>
                )}
              </div>
              {/* Приоритет отбора (п.10.2): ходовой товар — из ближних ячеек,
                  запас — с верхних ярусов; отдельные полки можно закрыть от
                  автоподбора, не снимая с них товар. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={eyebrow({ size: "xs", weight: "normal" })}>
                  {t("insp.pickPriority")}
                </span>
                <Input
                  type="number"
                  min={PICK_PRIORITY_MIN}
                  max={PICK_PRIORITY_MAX}
                  className={cn(
                    "h-6 w-12 text-right text-xs",
                    sh.pickPriority != null && "border-primary/50",
                  )}
                  value={sh.pickPriority ?? DEFAULT_PICK_PRIORITY}
                  onChange={(e) => {
                    const v = Math.round(+e.target.value);
                    setShelfPicking(m.id, i, {
                      pickPriority: Number.isFinite(v) ? v : undefined,
                    });
                  }}
                />
                <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={sh.pickable === false}
                    onChange={(e) => setShelfPicking(m.id, i, { pickable: !e.target.checked })}
                    className="size-3 accent-[hsl(var(--primary))]"
                  />
                  {t("insp.notPickable")}
                </label>
              </div>
              <button
                type="button"
                onClick={() => toggle(i)}
                title={`${sh.cells} ${cellsWord(t, sh.cells)}`}
                className="mt-2 block w-full"
              >
                <CellStrip cells={sh.cells} />
              </button>
            </div>
          );
        })}
      </div>

      {activeIndex !== null && shelves[activeIndex] && (
        <ShelfDetail index={activeIndex} cells={shelves[activeIndex].cells} t={t} />
      )}

      <SaveTemplateButton cells={shelves.map((sh) => sh.cells)} t={t} />
    </div>
  );
}

/** Раскрытый вид одной полки: ячейки, пронумерованные слева направо. */
function ShelfDetail({ index, cells, t }: { index: number; cells: number; t: TFunc }) {
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Rows3 className="size-3.5" />
        {t("insp.shelf", { n: index + 1 })} · {cells} {cellsWord(t, cells)}
      </div>
      <div className="flex h-12 w-full overflow-hidden rounded-md border border-border bg-card">
        {Array.from({ length: cells }).map((_, j) => (
          <div
            key={j}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center bg-module-section/60 text-[10px] font-semibold text-module-section-fg",
              j > 0 && "border-l border-black/15 dark:border-white/20",
            )}
          >
            {j + 1}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {t("insp.shelfDetailNote")}
      </p>
    </div>
  );
}
