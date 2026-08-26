import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Lightbulb, Trash2, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  cellDimsCm,
  cm,
  formatAddress,
  parseAddress,
} from "@/lib/address";
import {
  buildOccupancy,
  checkFit,
  firstFreeCell,
  hasStorage,
  occupantsAt,
  suggestCell,
  tightestFittingCell,
  type FitAxis,
} from "@/lib/placement";
import type { CellAddress, PlacedModule, Product } from "@/lib/types";
import { catLabel, useT, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Назначение товара на ячейку (ТЗ, разд. 3.6 — только здесь, не в 3D).
 * Проверка габаритов — математическая (разд. 2.6), на план не влияет.
 * Конфликты разруливаются алертами с вариантами действий (разд. 4).
 */

function sectionsOf(modules: PlacedModule[]): PlacedModule[] {
  return modules.filter(
    (m) => m.type === "section" && (m.shelves?.length ?? 0) > 0,
  );
}

/** Слово «ячейка/ячейки/ячеек» / «cell/cells». */
function cellsWord(t: TFunc, n: number): string {
  return t.plural(n, ["ячейка", "ячейки", "ячеек"], ["cell", "cells"]);
}
/** Слово «полка/полки/полок» / «shelf/shelves». */
function shelvesWord(t: TFunc, n: number): string {
  return t.plural(n, ["полка", "полки", "полок"], ["shelf", "shelves"]);
}

/**
 * Стартовый выбор: текущее место товара; для нового — сразу подходящая
 * свободная ячейка, чтобы не открываться на конфликте. Если товар не влезает
 * никуда — первая секция, и диалог честно показывает алерт.
 */
function initialDraft(product: Product): CellAddress | null {
  const s = useEditor.getState();
  const cur = s.placements[product.id];
  if (cur && formatAddress(s.warehouse, cur)) return cur;

  const occ = buildOccupancy(s.placements, s.boxes);
  const suggested = suggestCell(s.warehouse, occ, product, {
    preferFloorId: s.activeFloorId,
  });
  if (suggested) return suggested.addr;

  // Не влезает никуда — открываемся хотя бы на свободной, без лишнего «занято».
  const free = firstFreeCell(s.warehouse, occ, s.activeFloorId);
  if (free) return free.addr;

  const ordered = [
    s.activeFloor(),
    ...s.warehouse.floors.filter((f) => f.id !== s.activeFloorId),
  ];
  for (const f of ordered) {
    const sec = sectionsOf(f.modules)[0];
    if (sec) {
      return { floorId: f.id, moduleId: sec.id, shelfIndex: 0, cellIndex: 0 };
    }
  }
  return null;
}

export function AssignDialog({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const warehouse = useEditor((s) => s.warehouse);
  const products = useEditor((s) => s.products);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const placeProduct = useEditor((s) => s.placeProduct);
  const clearPlacement = useEditor((s) => s.clearPlacement);
  const setMode = useEditor((s) => s.setMode);
  const t = useT();

  const [draft, setDraft] = useState<CellAddress | null>(() =>
    initialDraft(product),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Коробки приёмки — такая же занятость, как прямое размещение (см. 2.1).
  const occupancy = useMemo(
    () => buildOccupancy(placements, boxes),
    [placements, boxes],
  );

  const floor = warehouse.floors.find((f) => f.id === draft?.floorId);
  const sections = floor ? sectionsOf(floor.modules) : [];
  const mod = sections.find((m) => m.id === draft?.moduleId);
  const shelves = mod?.shelves ?? [];
  const shelf = draft ? shelves[draft.shelfIndex] : undefined;
  const dims = mod && draft ? cellDimsCm(mod, draft.shelfIndex) : null;
  const fit = dims ? checkFit(product, dims) : null;
  const address = draft ? formatAddress(warehouse, draft) : null;

  // Ручной ввод адреса. Пока поле в фокусе — не перетираем набранное; на выходе
  // (blur) синхронизируемся с каноничным адресом из selects (сбрасывает мусор).
  const [manualText, setManualText] = useState(address ?? "");
  const [manualFocused, setManualFocused] = useState(false);
  useEffect(() => {
    if (!manualFocused) setManualText(address ?? "");
  }, [address, manualFocused]);
  const manualErr = manualText.trim() !== "" && !parseAddress(warehouse, manualText);
  const onManualChange = (v: string) => {
    setManualText(v);
    const parsed = parseAddress(warehouse, v);
    if (parsed) setDraft(parsed);
  };

  // Ячейку может занимать как отдельный товар, так и коробка приёмки со своим
  // содержимым — обе ситуации приходят из buildOccupancy одним объектом.
  const occupantIds = draft ? occupantsAt(occupancy, draft) : [];
  const foreignIds = occupantIds.filter((id) => id !== product.id);
  const occupant = foreignIds.length
    ? products.find((p) => p.id === foreignIds[0])
    : undefined;
  /** Сколько ещё товаров в той же ячейке, кроме показанного. */
  const occupantMore = Math.max(0, foreignIds.length - 1);

  // Предложение свободной подходящей ячейки (ТЗ, разд. 4).
  const suggestion = useMemo(
    () =>
      suggestCell(warehouse, occupancy, product, {
        preferFloorId: draft?.floorId,
      }),
    [warehouse, occupancy, product, draft?.floorId],
  );

  // Свободной подходящей нет: ячейка нужного размера всё же существует, но занята?
  const blocked = useMemo(
    () => (suggestion ? null : tightestFittingCell(warehouse, product)),
    [suggestion, warehouse, product],
  );
  const blockedBy = blocked
    ? products.find((p) => p.id === occupantsAt(occupancy, blocked.addr)[0])
    : undefined;

  const placed = !!placements[product.id];
  const canPlace = !!draft && !!dims;
  const clean = !!fit?.fits && !occupant;

  const commit = () => {
    if (!draft || !dims) return;
    placeProduct(product.id, draft);
    onClose();
  };

  // ТЗ, разд. 4: назначение, когда плана ещё нет.
  if (!hasStorage(warehouse) || !draft) {
    return (
      <Shell product={product} onClose={onClose} t={t}>
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-5" />
          </div>
          <p className="text-sm font-medium">{t("assign.noPlan.title")}</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {t("assign.noPlan.body")}
          </p>
          <Button
            size="sm"
            className="mt-1"
            onClick={() => {
              setMode("2d");
              onClose();
            }}
          >
            {t("assign.goToPlan")}
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell product={product} onClose={onClose} t={t}>
      <div className="flex flex-col gap-3 px-5 py-4">
        {/* Ручной ввод адреса (ТЗ, разд. 3.6: вписать адрес на мезонине вручную) */}
        <Field label={t("assign.manualOrPick")}>
          <input
            value={manualText}
            onChange={(e) => onManualChange(e.target.value)}
            onFocus={() => setManualFocused(true)}
            onBlur={() => setManualFocused(false)}
            placeholder={t("assign.manualPlaceholder")}
            inputMode="numeric"
            className={cn(
              "h-8 w-full rounded-md border bg-background px-2 font-mono text-xs tracking-wide",
              manualErr ? "border-destructive" : "border-input",
            )}
          />
          <span
            className={cn(
              "text-[11px]",
              manualErr ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {manualErr ? t("assign.manualErr") : t("assign.manualHint")}
          </span>
        </Field>

        {/* Кнопка «подобрать место» — короткий путь: склад сам находит
            свободную подходящую ячейку, руками адрес набирать не обязательно. */}
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          disabled={!suggestion}
          onClick={() => suggestion && setDraft(suggestion.addr)}
        >
          <Lightbulb className="size-3.5" />
          {suggestion
            ? t("assign.pickFree", { addr: suggestion.address })
            : t("assign.pickFreeNone")}
        </Button>

        <div className="h-px bg-border" />

        {/* Выбор адреса: этаж → секция → полка */}
        <div className="grid grid-cols-3 gap-2">
          <Field label={t("assign.floor")}>
            <select
              value={draft.floorId}
              onChange={(e) => {
                const f = warehouse.floors.find((x) => x.id === e.target.value);
                const sec = f ? sectionsOf(f.modules)[0] : undefined;
                if (f && sec)
                  setDraft({
                    floorId: f.id,
                    moduleId: sec.id,
                    shelfIndex: 0,
                    cellIndex: 0,
                  });
              }}
              className={selectCls}
            >
              {warehouse.floors.map((f, i) => {
                const empty = sectionsOf(f.modules).length === 0;
                // Номер этажа — его поле `number`: он же стоит в адресе, и в
                // выпадающем списке должен совпадать с ним (п.7).
                const n = f.number ?? i + 1;
                return (
                  <option key={f.id} value={f.id} disabled={empty}>
                    {n} · {t("floor.n", { n })}
                    {empty ? t("assign.noSections") : ""}
                  </option>
                );
              })}
            </select>
          </Field>

          <Field label={t("assign.section")}>
            <select
              value={draft.moduleId}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  moduleId: e.target.value,
                  shelfIndex: 0,
                  cellIndex: 0,
                })
              }
              className={selectCls}
            >
              {sections.map((m, i) => {
                const n = m.shelves?.length ?? 0;
                return (
                  <option key={m.id} value={m.id}>
                    {i + 1} · {m.label ?? `${t("assign.section")} ${i + 1}`} ({n}{" "}
                    {shelvesWord(t, n)})
                  </option>
                );
              })}
            </select>
          </Field>

          <Field label={t("assign.shelf")}>
            <select
              value={draft.shelfIndex}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  shelfIndex: Number(e.target.value),
                  cellIndex: 0,
                })
              }
              className={selectCls}
            >
              {shelves.map((sh, i) => (
                <option key={sh.id} value={i}>
                  {i + 1} · {sh.cells} {cellsWord(t, sh.cells)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Ячейки полки — пропорциональная лента, как на плане */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("assign.cell")}
            </span>
            {shelf?.cells === 1 && (
              <span className="text-[11px] text-muted-foreground">
                {t("assign.oneCellNote")}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {Array.from({ length: shelf?.cells ?? 0 }, (_, i) => {
              const a = { ...draft, cellIndex: i };
              const ids = occupantsAt(occupancy, a);
              const isCurrent = ids.length === 1 && ids[0] === product.id;
              const busy = ids.some((id) => id !== product.id);
              const fits = !!fit?.fits;
              const selected = draft.cellIndex === i;
              const who = ids.length
                ? products.find((p) => p.id === ids[0])
                : undefined;
              return (
                <button
                  key={i}
                  onClick={() => setDraft(a)}
                  title={[
                    t("assign.cellN", { n: i + 1 }),
                    isCurrent
                      ? t("assign.cellCurrent")
                      : busy
                        ? t("assign.cellBusy", { name: who?.name ?? "" })
                        : t("assign.cellFree"),
                    fits ? t("assign.fits") : t("assign.notFits"),
                  ].join(" · ")}
                  className={cn(
                    "flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors",
                    isCurrent
                      ? "border-primary bg-primary/15 text-primary"
                      : !fits
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : busy
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    selected && "ring-2 ring-ring ring-offset-1",
                  )}
                >
                  {i + 1}
                  {ids.length > 0 && (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Математика: габариты ячейки против габаритов товара (ТЗ, разд. 2.6) */}
        {dims && fit && (
          <div className="rounded-md border border-border bg-muted/40 p-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("assign.rowCell")}{" "}
                <span className="font-mono font-medium text-foreground">
                  {address}
                </span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {cm(dims.widthCm)} × {cm(dims.heightCm)} × {cm(dims.depthCm)}{" "}
                {t("unit.cm")}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("assign.rowProduct")}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {cm(product.widthCm)} × {cm(product.heightCm)} ×{" "}
                {cm(product.depthCm)} {t("unit.cm")}
              </span>
            </div>
            <div
              className={cn(
                "mt-2 flex items-center gap-1.5 border-t border-border pt-2 font-medium",
                fit.fits
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive",
              )}
            >
              {fit.fits ? (
                <Check className="size-3.5" />
              ) : (
                <AlertTriangle className="size-3.5" />
              )}
              {fit.fits ? t("assign.fitsYes") : t("assign.fitsNo")}
            </div>
          </div>
        )}

        {/* ТЗ, разд. 4: ячейка уже занята */}
        {occupant && (
          <Alert tone="warn">
            <p>
              <span className="font-semibold">{t("assign.occupied.title")}</span>{" "}
              {occupant.name}{" "}
              <span className="font-mono text-[11px] opacity-70">
                {occupant.sku}
              </span>
              {occupantMore > 0 && ` ${t("assign.occupied.more", { n: occupantMore })}`}
              . {t("assign.occupied.body", { name: occupant.name })}
            </p>
            {suggestion && (
              <button
                onClick={() => setDraft(suggestion.addr)}
                className="mt-1.5 inline-flex items-center gap-1 font-medium underline underline-offset-2"
              >
                <Lightbulb className="size-3" />
                {t("assign.suggestReplace", { addr: suggestion.address })}
              </button>
            )}
          </Alert>
        )}

        {/* ТЗ, разд. 4: товар не помещается по габаритам */}
        {fit && !fit.fits && dims && (
          <Alert tone="danger">
            <p>
              <span className="font-semibold">{t("assign.notFit.title")}</span>{" "}
              {fit.failed
                .map(
                  (ax: FitAxis) =>
                    `${t(`axis.${ax}`)} ${cm(sizeOf(product, ax))} > ${cm(
                      cellSizeOf(dims, ax),
                    )} ${t("unit.cm")}`,
                )
                .join(", ")}
              .
            </p>
            {suggestion ? (
              <button
                onClick={() => setDraft(suggestion.addr)}
                className="mt-1.5 inline-flex items-center gap-1 font-medium underline underline-offset-2"
              >
                <Lightbulb className="size-3" />
                {t("assign.suggestion", { addr: suggestion.address })}
              </button>
            ) : blocked ? (
              <p className="mt-1.5 opacity-80">
                {t("assign.blocked", {
                  addr: blocked.address,
                  who: blockedBy
                    ? t("assign.blockedWho", { name: blockedBy.name })
                    : "",
                })}
              </p>
            ) : (
              <p className="mt-1.5 opacity-80">{t("assign.noCellSize")}</p>
            )}
          </Alert>
        )}
      </div>

      {/* Действия */}
      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3">
        {placed ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              clearPlacement(product.id);
              onClose();
            }}
          >
            <Trash2 className="size-3.5" />
            {t("assign.removeFromPlace")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!canPlace}
            variant={clean ? "default" : "destructive"}
            onClick={commit}
          >
            {clean ? t("assign.place") : t("assign.placeForce")}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

// --- оболочка модала ---------------------------------------------------------

function Shell({
  product,
  onClose,
  t,
  children,
}: {
  product: Product;
  onClose: () => void;
  t: TFunc;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("assign.header")}
            </p>
            <p className="truncate text-sm font-semibold">{product.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {product.sku} · {catLabel(t, product.category)}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const selectCls =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-xs";

function Alert({
  tone,
  children,
}: {
  tone: "warn" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border p-2.5 text-xs leading-relaxed",
        tone === "warn"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function sizeOf(p: Product, ax: FitAxis): number {
  return ax === "width" ? p.widthCm : ax === "height" ? p.heightCm : p.depthCm;
}

function cellSizeOf(
  d: { widthCm: number; heightCm: number; depthCm: number },
  ax: FitAxis,
): number {
  return ax === "width" ? d.widthCm : ax === "height" ? d.heightCm : d.depthCm;
}
