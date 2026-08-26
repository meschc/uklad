import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Minus,
  Plus,
  RefreshCw,
  RotateCw,
  Trash2,
  MousePointerClick,
  Rows3,
  Check,
  Copy,
  CopyPlus,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import {
  CELLS_MAX,
  DEFAULT_PICK_PRIORITY,
  PICK_PRIORITY_MAX,
  PICK_PRIORITY_MIN,
  CELLS_MIN,
  DEFAULT_SHELF_CELLS,
  MODULE_SPECS,
  SHELF_MAX,
  SHELF_MIN,
  type Floor,
  type PlacedModule,
} from "@/lib/types";
import { clamp, cn } from "@/lib/utils";
import { useEditor } from "@/lib/store";
import { combo } from "@/lib/platform";
import { isOverlapConflict } from "@/lib/overlap";
import { rowOf, shelfNumber } from "@/lib/address";
import { rowSides, rowNumbers } from "@/lib/numbering";
import { useT, type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ModuleGlyph } from "./ModuleGlyph";
import { MODULE_STYLES } from "./constants";

/** Слова «ячейка/ячейки/ячеек» / «cell/cells». */
function cellsWord(t: TFunc, n: number): string {
  return t.plural(n, ["ячейка", "ячейки", "ячеек"], ["cell", "cells"]);
}
/** Дательное «секции/секциям» / «section/sections» — для «Применить к N». */
function sectionsWord(t: TFunc, n: number): string {
  return t.plural(n, ["секции", "секциям", "секциям"], ["section", "sections"]);
}

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const modules = useEditor((s) => s.activeFloor().modules);
  const selected = modules.filter((m) => selection.includes(m.id));
  const t = useT();

  return (
    <aside className="pointer-events-auto m-3 flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("insp.title")}
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto">
        {selected.length === 0 && <EmptyState t={t} />}
        {selected.length === 1 && <SingleInspector module={selected[0]} t={t} />}
        {selected.length > 1 && <MultiInspector selected={selected} t={t} />}
      </div>
    </aside>
  );
}

function EmptyState({ t }: { t: TFunc }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MousePointerClick className="size-5" />
      </div>
      <p className="text-sm font-medium">{t("insp.nothing")}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("insp.emptyHint")}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="shrink-0">{label}</Label>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        className="h-7 w-7"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1, min, max))}
      >
        <Minus className="size-3.5" />
      </Button>
      <span className="w-6 text-center text-sm font-medium tabular-nums">
        {value}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        className="h-7 w-7"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1, min, max))}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

function SingleInspector({ module: m, t }: { module: PlacedModule; t: TFunc }) {
  const spec = MODULE_SPECS[m.type];
  const style = MODULE_STYLES[m.type];
  const siblings = useEditor((s) => s.activeFloor().modules);
  // Позицию можно ввести числом — предупреждаем, если модуль лёг на соседа.
  const overlapping = siblings.some(
    (o) => o.id !== m.id && isOverlapConflict(m, o),
  );
  const setModuleRect = useEditor((s) => s.setModuleRect);
  const updateModule = useEditor((s) => s.updateModule);
  const rotateModule = useEditor((s) => s.rotateModule);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const isFixed = !!spec.fixed;

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Заголовок типа */}
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-md border ${style.fill} ${style.text} ${style.border}`}
        >
          <ModuleGlyph type={m.type} className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            {t(`module.${m.type}.title`)}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {isFixed
              ? t("insp.fixed", { w: spec.fixed!.w, h: spec.fixed!.h })
              : t("insp.sizeRange", { min: spec.min, max: spec.max })}
          </div>
        </div>
      </div>

      <Separator />

      {/* Размер */}
      <div className="flex flex-col gap-2.5">
        <Row label={t("insp.width")}>
          <Stepper
            value={m.w}
            min={spec.min}
            max={spec.max}
            disabled={isFixed}
            onChange={(w) => setModuleRect(m.id, { x: m.x, y: m.y, w, h: m.h })}
          />
        </Row>
        <Row label={t("insp.height")}>
          <Stepper
            value={m.h}
            min={spec.min}
            max={spec.max}
            disabled={isFixed}
            onChange={(h) => setModuleRect(m.id, { x: m.x, y: m.y, w: m.w, h })}
          />
        </Row>
      </div>

      {m.type === "section" && (
        <>
          <Separator />
          {/* Секция без закреплённого ряда — сразу предлагаем назначить ряд (п.5). */}
          {m.row == null && <AssignRow count={1} t={t} />}
          <SectionNumber module={m} siblings={siblings} t={t} />
          <Separator />
          <ShelfEditor module={m} t={t} />
        </>
      )}

      <Separator />

      {/* Позиция */}
      <div className="flex flex-col gap-2.5">
        <Row label={t("insp.xCell")}>
          <Input
            type="number"
            className="h-7 w-16 text-right"
            value={m.x}
            onChange={(e) =>
              updateModule(m.id, { x: Math.round(+e.target.value || 0) })
            }
          />
        </Row>
        <Row label={t("insp.yCell")}>
          <Input
            type="number"
            className="h-7 w-16 text-right"
            value={m.y}
            onChange={(e) =>
              updateModule(m.id, { y: Math.round(+e.target.value || 0) })
            }
          />
        </Row>
        {overlapping && (
          <div className="flex gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <span>{t("insp.overlap")}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Реальные габариты (только данные) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <Label>{t("insp.dims")}</Label>
          <span className="text-[10px] text-muted-foreground/70">
            {t("insp.noScale")}
          </span>
        </div>
        <Row label={t("insp.width")}>
          <Input
            type="number"
            className="h-7 w-20 text-right"
            value={m.realWidthCm ?? ""}
            onChange={(e) =>
              updateModule(m.id, { realWidthCm: +e.target.value || 0 })
            }
          />
        </Row>
        <Row label={t("insp.depth")}>
          <Input
            type="number"
            className="h-7 w-20 text-right"
            value={m.realDepthCm ?? ""}
            onChange={(e) =>
              updateModule(m.id, { realDepthCm: +e.target.value || 0 })
            }
          />
        </Row>
        {m.type === "section" && (
          <Row label={t("insp.height")}>
            <Input
              type="number"
              className="h-7 w-20 text-right"
              value={m.realHeightCm ?? ""}
              onChange={(e) =>
                updateModule(m.id, { realHeightCm: +e.target.value || 0 })
              }
            />
          </Row>
        )}
      </div>

      <Separator />

      {/* Действия */}
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={duplicateSelection}
        >
          <CopyPlus className="size-3.5" />
          {t("insp.duplicate")}
          <kbd className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground">
            {combo("D")}
          </kbd>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={isFixed}
            onClick={() => rotateModule(m.id)}
          >
            <RotateCw className="size-3.5" />
            {t("insp.rotate")}
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

/**
 * Номер секции в адресе. Показываем действующий номер: свой, если задан, иначе
 * порядковый. Правка делает номер «ручным» — автонумерация его не тронет.
 */
/**
 * Стороннность ряда: авто / односторонний / двусторонний, и на какой стороне
 * прохода нечётные номера. Пишется в RowConfig этажа (переживает рехайдрацию).
 */
function RowSidedControl({
  row,
  floor,
  t,
}: {
  row: number;
  floor: Floor;
  t: TFunc;
}) {
  const setRowConfig = useEditor((s) => s.setRowConfig);
  const config = floor.rows?.find((r) => r.number === row);
  const { sides, vertical } = rowSides(floor, row);
  const autoTwo = sides.length === 2;
  const sided = config?.sided ?? "auto";
  const effectiveTwo = sided === "two" || (sided === "auto" && autoTwo);
  const oddSide = config?.oddSide ?? "near";

  const opts = [
    { v: "auto", label: t("insp.rowSided.auto") },
    { v: "one", label: t("insp.rowSided.one") },
    { v: "two", label: t("insp.rowSided.two") },
  ] as const;

  // Стороны прохода называем по ориентации ряда (п.12): вертикальный ряд —
  // «слева/справа», горизонтальный — «сверху/снизу». Данные хранятся как
  // near/far (ближняя/дальняя по поперечной координате), а подпись — понятная.
  const sideLabel = (sd: "near" | "far") =>
    vertical
      ? t(sd === "near" ? "insp.side.left" : "insp.side.right")
      : t(sd === "near" ? "insp.side.top" : "insp.side.bottom");

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-2">
      <span className="text-[11px] font-medium text-muted-foreground">
        {t("insp.rowSided.label")}
      </span>
      <div className="flex rounded-md border border-border p-0.5">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setRowConfig(row, { sided: o.v })}
            className={cn(
              // Вложение: контейнер rounded-md (8) − p-0.5 (2) = 6 → sm.
              "flex-1 rounded-sm px-1 py-1 text-[11px] font-medium transition-colors",
              sided === o.v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {effectiveTwo && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {t("insp.rowSided.oddSide")}
          </span>
          <div className="flex rounded-md border border-border p-0.5">
            {(["near", "far"] as const).map((sd) => (
              <button
                key={sd}
                type="button"
                onClick={() => setRowConfig(row, { oddSide: sd })}
                className={cn(
                  "rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors",
                  oddSide === sd
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {sideLabel(sd)}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {sided === "auto"
          ? t("insp.rowSided.autoNote", {
              kind: autoTwo ? t("insp.rowSided.two") : t("insp.rowSided.one"),
            })
          : t("insp.rowSided.hint")}
      </p>
    </div>
  );
}

function SectionNumber({
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
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("insp.fullAddress")}
        </p>
        <p className="mt-0.5 font-mono text-base font-semibold tabular-nums">
          {[floorNum, ...(cfg.useRows ? [effectiveRow] : []), effective].join(
            cfg.separator,
          )}
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
              className={cn(
                "h-7 w-16 text-right",
                rowPinned && "border-primary/50",
              )}
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
          className={cn(
            "h-7 w-16 text-right",
            duplicate && "border-destructive",
          )}
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
      {duplicate && (
        <span className="text-[11px] text-destructive">
          {t("insp.numberDup")}
        </span>
      )}
    </div>
  );
}

/** Редактор полок/ячеек секции + раскрытый 2D-вид выбранной полки (ТЗ 2.3). */
function ShelfEditor({ module: m, t }: { module: PlacedModule; t: TFunc }) {
  const shelves = m.shelves ?? [];
  const setShelfCount = useEditor((s) => s.setShelfCount);
  const setShelfCells = useEditor((s) => s.setShelfCells);
  const setShelfNumber = useEditor((s) => s.setShelfNumber);
  const setShelfPicking = useEditor((s) => s.setShelfPicking);
  const activeShelf = useEditor((s) => s.activeShelf);
  const setActiveShelf = useEditor((s) => s.setActiveShelf);
  const clearActiveShelf = useEditor((s) => s.clearActiveShelf);
  const addTemplate = useEditor((s) => s.addTemplate);
  const [saved, setSaved] = useState(false);
  const activeIndex =
    activeShelf?.moduleId === m.id ? activeShelf.index : null;

  const toggle = (i: number) =>
    i === activeIndex ? clearActiveShelf() : setActiveShelf(m.id, i);
  const saveTemplate = () => {
    addTemplate(shelves.map((sh) => sh.cells));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

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
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("insp.shelvesHint")}
      </p>

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
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
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
                    setShelfNumber(
                      m.id,
                      i,
                      Number.isFinite(v) && v > 0 ? v : undefined,
                    );
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
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
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
                    onChange={(e) =>
                      setShelfPicking(m.id, i, { pickable: !e.target.checked })
                    }
                    className="size-3 accent-[hsl(var(--primary))]"
                  />
                  {t("insp.notPickable")}
                </label>
              </div>
              <button
                type="button"
                onClick={() => toggle(i)}
                title={`${sh.cells} ${cellsWord(t, sh.cells)}`}
                className="mt-2 flex h-4 w-full overflow-hidden rounded-sm border border-border"
              >
                {Array.from({ length: sh.cells }).map((_, j) => (
                  <span
                    key={j}
                    className={cn(
                      "min-w-0 flex-1 bg-module-section",
                      j > 0 && "border-l border-black/15 dark:border-white/15",
                    )}
                  />
                ))}
              </button>
            </div>
          );
        })}
      </div>

      {activeIndex !== null && shelves[activeIndex] && (
        <ShelfDetail index={activeIndex} cells={shelves[activeIndex].cells} t={t} />
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={saveTemplate}
      >
        {saved ? (
          <>
            <BookmarkCheck className="size-3.5" />
            {t("insp.savedToLibrary")}
          </>
        ) : (
          <>
            <Bookmark className="size-3.5" />
            {t("insp.saveTemplate")}
          </>
        )}
      </Button>
    </div>
  );
}

/** Раскрытый вид одной полки: ячейки, пронумерованные слева направо. */
function ShelfDetail({
  index,
  cells,
  t,
}: {
  index: number;
  cells: number;
  t: TFunc;
}) {
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

/**
 * «Вот это — ряд N» для всего выделения. Закреплённый ряд становится якорем:
 * остальные ряды пересчитываются вокруг него сами, без ручного запуска.
 */
function AssignRow({ count, t }: { count: number; t: TFunc }) {
  const setRowForSelection = useEditor((s) => s.setRowForSelection);
  const useRows = useEditor((s) => s.addressing.useRows);
  const updateAddressing = useEditor((s) => s.updateAddressing);
  const [value, setValue] = useState("");

  const apply = () => {
    const n = Math.round(+value);
    if (!Number.isFinite(n) || n < 1) return;
    // Назначая ряд, пользователь явно хочет ряды в адресе — включаем сразу.
    if (!useRows) updateAddressing({ useRows: true, configured: true });
    setRowForSelection(n);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <Label>{t("insp.assignRow")}</Label>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t("insp.assignRowHint", { n: count })}
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          value={value}
          placeholder="1"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          className="h-7 w-16 text-right"
        />
        <Button size="sm" className="flex-1" disabled={!value} onClick={apply}>
          {t("insp.assignRowApply")}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => setRowForSelection(undefined)}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        {t("insp.assignRowClear")}
      </button>
    </div>
  );
}

/**
 * Если выделение — это РОВНО весь один ряд (все его секции и ничего лишнего),
 * возвращаем номер ряда. Тогда показываем полноценный редактор ряда, а не
 * общую панель нескольких секций.
 */
function fullRowOf(floor: Floor, selected: PlacedModule[]): number | null {
  if (!selected.length) return null;
  const map = rowNumbers(floor);
  // Ряд включает и лестницы (п.13): считаем ВСЕ члены ряда, а не только секции.
  const rows = new Set(selected.map((m) => map.get(m.id)));
  if (rows.size !== 1) return null;
  const r = [...rows][0];
  if (r == null) return null;
  const total = [...map.values()].filter((v) => v === r).length;
  return selected.length === total ? r : null;
}

/**
 * Размер сразу для всего выделения (п.8): растянуть двадцать секций по одной —
 * не работа, а мучение. Общее значение показываем числом, разнобой — прочерком;
 * применяется введённое число ко ВСЕМ выделенным модулям.
 */
function MultiSize({ selected, t }: { selected: PlacedModule[]; t: TFunc }) {
  const setModuleRect = useEditor((s) => s.setModuleRect);
  const updateModule = useEditor((s) => s.updateModule);

  // Границы — пересечение допусков по типам выделения: нельзя растянуть лифт
  // шире его максимума только потому, что рядом выделена секция.
  const specs = [...new Set(selected.map((m) => m.type))].map(
    (type) => MODULE_SPECS[type],
  );
  const min = Math.max(...specs.map((sp) => sp.min));
  const max = Math.min(...specs.map((sp) => sp.max));
  const fixed = specs.some((sp) => sp.fixed);

  const common = (pick: (m: PlacedModule) => number | undefined) => {
    const first = pick(selected[0]);
    return selected.every((m) => pick(m) === first) ? first : undefined;
  };
  const applyRect = (patch: { w?: number; h?: number }) => {
    for (const m of selected) {
      setModuleRect(m.id, { x: m.x, y: m.y, w: patch.w ?? m.w, h: patch.h ?? m.h });
    }
  };
  const applyReal = (patch: Partial<PlacedModule>) => {
    for (const m of selected) updateModule(m.id, patch);
  };

  const w = common((m) => m.w);
  const h = common((m) => m.h);
  const hasSections = selected.some((m) => m.type === "section");

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label>{t("insp.multiSize")}</Label>
        <span className="text-[10px] text-muted-foreground/70">
          {t("insp.multiSizeHint", { n: selected.length })}
        </span>
      </div>
      <Row label={t("insp.width")}>
        <Stepper
          value={w ?? min}
          min={min}
          max={max}
          disabled={fixed}
          onChange={(v) => applyRect({ w: v })}
        />
      </Row>
      <Row label={t("insp.height")}>
        <Stepper
          value={h ?? min}
          min={min}
          max={max}
          disabled={fixed}
          onChange={(v) => applyRect({ h: v })}
        />
      </Row>
      <Row label={t("insp.realWidth")}>
        <Input
          type="number"
          className="h-7 w-20 text-right"
          placeholder={common((m) => m.realWidthCm) == null ? "—" : undefined}
          value={common((m) => m.realWidthCm) ?? ""}
          onChange={(e) => applyReal({ realWidthCm: +e.target.value || 0 })}
        />
      </Row>
      <Row label={t("insp.depth")}>
        <Input
          type="number"
          className="h-7 w-20 text-right"
          placeholder={common((m) => m.realDepthCm) == null ? "—" : undefined}
          value={common((m) => m.realDepthCm) ?? ""}
          onChange={(e) => applyReal({ realDepthCm: +e.target.value || 0 })}
        />
      </Row>
      {hasSections && (
        <Row label={t("insp.height")}>
          <Input
            type="number"
            className="h-7 w-20 text-right"
            placeholder={common((m) => m.realHeightCm) == null ? "—" : undefined}
            value={common((m) => m.realHeightCm) ?? ""}
            onChange={(e) => applyReal({ realHeightCm: +e.target.value || 0 })}
          />
        </Row>
      )}
    </div>
  );
}

/**
 * Свойства РЯДА — обычная панель характеристик (как у секции), без особого
 * выделения (п.4): номер ряда, стороны прохода, «ещё такой же ряд» и
 * расформирование. Открывается выделением всего ряда (клик по ряду на плане).
 * Полки для секций ряда правятся в блоке ниже (общий редактор полок).
 */
function RowInspector({
  row,
  floor,
  t,
}: {
  row: number;
  floor: Floor;
  t: TFunc;
}) {
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
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => resetRowNumbers(row)}
      >
        <RefreshCw className="size-3.5" />
        {t("insp.rowRenumber")}
      </Button>

      <div className="flex flex-col gap-1">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => cloneRow(row)}
        >
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

/**
 * Групповое редактирование: строим раскладку полок/ячеек и применяем сразу
 * ко всем выделенным секциям (ТЗ, разд. 2.3 — массовое редактирование).
 */
function MultiInspector({
  selected,
  t,
}: {
  selected: PlacedModule[];
  t: TFunc;
}) {
  const rotateSelection = useEditor((s) => s.rotateSelection);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const applyShelves = useEditor((s) => s.applyShelvesToSelection);
  const addTemplate = useEditor((s) => s.addTemplate);
  const floor = useEditor((s) => s.activeFloor());
  const useRows = useEditor((s) => s.addressing.useRows);
  const [saved, setSaved] = useState(false);

  // Первое групповое выделение — намекаем про массовые правки полок (8.2.4).
  useEffect(() => {
    useEditor.getState().showHint("multi");
  }, []);

  // Выделен ровно один целый ряд — показываем редактор ряда вместо «назначить».
  const activeRow = useRows ? fullRowOf(floor, selected) : null;

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
      prev.map((v, j) =>
        j === i ? clamp(Math.round(c), CELLS_MIN, CELLS_MAX) : v,
      ),
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
  const saveTemplate = () => {
    addTemplate(cfg);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="text-sm font-semibold">
          {t("insp.selected", { n: selected.length })}
        </div>
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
                <div
                  key={i}
                  className="rounded-md border border-border p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">
                      {t("insp.shelf", { n: i + 1 })}
                    </span>
                    <Stepper
                      value={cells}
                      min={CELLS_MIN}
                      max={CELLS_MAX}
                      onChange={(c) => setCells(i, c)}
                    />
                  </div>
                  <div className="mt-2 flex h-4 w-full overflow-hidden rounded-sm border border-border">
                    {Array.from({ length: cells }).map((_, j) => (
                      <span
                        key={j}
                        className={cn(
                          "min-w-0 flex-1 bg-module-section",
                          j > 0 &&
                            "border-l border-black/15 dark:border-white/15",
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Button size="sm" className="w-full" onClick={apply}>
              {applied ? (
                <>
                  <Check className="size-3.5" />
                  {t("insp.applied")} {sections.length}{" "}
                  {sectionsWord(t, sections.length)}
                </>
              ) : (
                `${t("insp.apply")} ${sections.length} ${sectionsWord(t, sections.length)}`
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={saveTemplate}
            >
              {saved ? (
                <>
                  <BookmarkCheck className="size-3.5" />
                  {t("insp.savedToLibrary")}
                </>
              ) : (
                <>
                  <Bookmark className="size-3.5" />
                  {t("insp.saveTemplate")}
                </>
              )}
            </Button>
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
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={duplicateSelection}
        >
          <CopyPlus className="size-3.5" />
          {t("insp.duplicateSel")}
          <kbd className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground">
            {combo("D")}
          </kbd>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={rotateSelection}
          >
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
