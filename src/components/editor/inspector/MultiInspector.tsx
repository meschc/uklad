import { useEffect, useState } from "react";
import { Check, Copy, CopyPlus, RotateCw, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { combo } from "@/lib/platform";
import { rowOfSelection } from "@/lib/planGeometry";
import {
  CELLS_MAX,
  CELLS_MIN,
  DEFAULT_SHELF_CELLS,
  SHELF_MAX,
  SHELF_MIN,
  type PlacedModule,
} from "@/lib/types";
import { clamp } from "@/lib/utils";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AssignRow } from "./AssignRow";
import { CellStrip, Stepper } from "./fields";
import { MultiSize } from "./MultiSize";
import { RowInspector } from "./RowInspector";
import { SaveTemplateButton } from "./SaveTemplateButton";
import { sectionsWord } from "./words";

/**
 * Групповое редактирование: строим раскладку полок/ячеек и применяем сразу
 * ко всем выделенным секциям (ТЗ, разд. 2.3 — массовое редактирование).
 */
export function MultiInspector({ selected, t }: { selected: PlacedModule[]; t: TFunc }) {
  const rotateSelection = useEditor((s) => s.rotateSelection);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const applyShelves = useEditor((s) => s.applyShelvesToSelection);
  const floor = useEditor((s) => s.activeFloor());
  const useRows = useEditor((s) => s.addressing.useRows);

  // Первое групповое выделение — намекаем про массовые правки полок (8.2.4).
  useEffect(() => {
    useEditor.getState().showHint("multi");
  }, []);

  // Выделен ровно один целый ряд — показываем редактор ряда вместо «назначить».
  // Тот же счёт, что у холста: рамка ряда и эта панель обязаны включаться вместе.
  const activeRow = useRows
    ? rowOfSelection(
        floor,
        selected.map((m) => m.id),
      )
    : null;

  const sections = selected.filter((m) => m.type === "section");
  const firstCells = () =>
    sections[0]?.shelves?.map((sh) => sh.cells) ?? [
      DEFAULT_SHELF_CELLS,
      DEFAULT_SHELF_CELLS,
      DEFAULT_SHELF_CELLS,
    ];

  // Локальная раскладка-шаблон, которую применяем ко всем секциям сразу.
  const [cfg, setCfg] = useState<number[]>(firstCells);
  const [applied, setApplied] = useState(false);

  const setShelfCount = (n: number) => {
    const count = clamp(Math.round(n), SHELF_MIN, SHELF_MAX);
    setCfg((prev) => {
      if (count === prev.length) return prev;
      if (count < prev.length) return prev.slice(0, count);
      const fill = prev[prev.length - 1] ?? DEFAULT_SHELF_CELLS;
      return [...prev, ...Array<number>(count - prev.length).fill(fill)];
    });
    setApplied(false);
  };
  const setCells = (i: number, c: number) => {
    setCfg((prev) =>
      prev.map((v, j) => (j === i ? clamp(Math.round(c), CELLS_MIN, CELLS_MAX) : v)),
    );
    setApplied(false);
  };
  const seedFromFirst = () => {
    setCfg(firstCells());
    setApplied(false);
  };
  const apply = () => {
    applyShelves(cfg);
    setApplied(true);
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="text-sm font-semibold">{t("insp.selected", { n: selected.length })}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {sections.length > 0
            ? t("insp.multiSections", { n: sections.length })
            : t("insp.multiNoSections")}
        </p>
      </div>

      {activeRow != null ? (
        <RowInspector key={activeRow} row={activeRow} floor={floor} t={t} />
      ) : (
        sections.length > 0 && <AssignRow count={sections.length} t={t} />
      )}

      <MultiSize selected={selected} t={t} />
      <Separator />

      {sections.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>{t("insp.shelvesLabel")}</Label>
              <Stepper
                value={cfg.length}
                min={SHELF_MIN}
                max={SHELF_MAX}
                onChange={setShelfCount}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              {cfg.map((cells, i) => (
                <div key={i} className="rounded-md border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{t("insp.shelf", { n: i + 1 })}</span>
                    <Stepper
                      value={cells}
                      min={CELLS_MIN}
                      max={CELLS_MAX}
                      onChange={(c) => setCells(i, c)}
                    />
                  </div>
                  <CellStrip cells={cells} className="mt-2" />
                </div>
              ))}
            </div>

            <Button size="sm" className="w-full" onClick={apply}>
              {applied ? (
                <>
                  <Check className="size-3.5" />
                  {t("insp.applied")} {sections.length} {sectionsWord(t, sections.length)}
                </>
              ) : (
                `${t("insp.apply")} ${sections.length} ${sectionsWord(t, sections.length)}`
              )}
            </Button>
            <SaveTemplateButton cells={cfg} t={t} />
            <button
              type="button"
              onClick={seedFromFirst}
              className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Copy className="size-3" />
              {t("insp.takeFromFirst")}
            </button>
          </div>

          <Separator />
        </>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" className="w-full" onClick={duplicateSelection}>
          <CopyPlus className="size-3.5" />
          {t("insp.duplicateSel")}
          <kbd className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground">
            {combo("D")}
          </kbd>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={rotateSelection}>
            <RotateCw className="size-3.5" />
            {t("insp.rotateAll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={deleteSelection}
          >
            <Trash2 className="size-3.5" />
            {t("common.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
