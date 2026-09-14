import { useMemo, useState } from "react";
import { ChevronRight, Layers } from "lucide-react";
import type { Floor, PlacedModule } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { rowNumbers } from "@/lib/numbering";
import { sectionNumber } from "@/lib/address";
import { type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { eyebrow } from "@/components/ui/eyebrow";
import { ModuleGlyph } from "./ModuleGlyph";

/**
 * Дерево слоёв: этаж → ряды → секции, плюс группа конструкций (лестницы/лифты).
 * Аналог панели слоёв в Figma — быстрый обзор и выделение по структуре плана,
 * а не по случайному порядку создания. Ряд берётся действующий (закреплённый
 * или вычисленный), поэтому дерево совпадает с адресацией.
 */
export function LayersTree({ floor, t }: { floor: Floor; t: TFunc }) {
  const selection = useEditor((s) => s.selection);
  // Заголовок дерева — «Этаж N» по номеру этажа в адресе, а не сохранённое имя:
  // имя задаётся при создании и после смены номера врало (п.1).
  const floorNum = useEditor((s) => {
    const i = s.warehouse.floors.findIndex((f) => f.id === floor.id);
    return s.warehouse.floors[i]?.number ?? (i < 0 ? 0 : i) + 1;
  });
  const toggleSelect = useEditor((s) => s.toggleSelect);
  const select = useEditor((s) => s.select);
  const clearSelection = useEditor((s) => s.clearSelection);

  const { rows, structural } = useMemo(() => {
    const rowMap = rowNumbers(floor);
    // Ряд включает и лестницы своей линии (п.13). Конструкции вне рядов —
    // в отдельную группу «Конструкции».
    const members = floor.modules.filter(
      (m) => m.type === "section" || m.type === "stairs" || m.type === "elevator",
    );
    const byRow = new Map<number, PlacedModule[]>();
    const structural: PlacedModule[] = [];
    for (const m of members) {
      const r = rowMap.get(m.id);
      if (r == null) {
        if (m.type !== "section") structural.push(m);
        continue;
      }
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r)!.push(m);
    }
    const rows = [...byRow.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([row, mods]) => ({
        row,
        // Секции — по номеру; лестницы (номера нет) уходят в конец ряда.
        mods: mods.sort(
          (a, b) =>
            (a.type === "section" ? sectionNumber(floor, a.id) : 1e6) -
            (b.type === "section" ? sectionNumber(floor, b.id) : 1e6),
        ),
      }));
    return { rows, structural };
  }, [floor]);

  // По умолчанию раскрыт ряд с выделением; остальные свёрнуты — иначе длинно.
  const selectedRow = useMemo(() => {
    const map = rowNumbers(floor);
    for (const id of selection) {
      const r = map.get(id);
      if (r != null) return r;
    }
    return null;
  }, [floor, selection]);

  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const isOpen = (r: number) => open.has(r) || r === selectedRow;
  const toggleOpen = (r: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      // Учитываем «раскрыт из-за выделения»: первый клик — свернуть явно.
      if (next.has(r)) next.delete(r);
      else if (r === selectedRow) next.delete(r);
      else next.add(r);
      return next;
    });

  if (rows.length === 0 && structural.length === 0) {
    return <p className="px-1 py-4 text-xs text-muted-foreground">{t("struct.empty")}</p>;
  }

  const leaf = (m: PlacedModule, label: React.ReactNode) => {
    const sel = selection.includes(m.id);
    return (
      <button
        key={m.id}
        onClick={(e) => toggleSelect(m.id, e.shiftKey)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md py-1 pl-6 pr-2 text-left text-[13px] transition-colors",
          sel
            ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/30"
            : "text-muted-foreground hover:bg-accent/60",
        )}
      >
        <ModuleGlyph type={m.type} className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
          {m.w}×{m.h}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-0.5">
      {/* Корень — этаж */}
      <div className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium text-foreground">
        <Layers className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">
          {t("floor.word")} {floorNum}
        </span>
      </div>

      {rows.map(({ row, mods }) => {
        const rowSel = mods.filter((m) => selection.includes(m.id)).length;
        return (
          <div key={row}>
            {/* Chevron сворачивает; клик по названию ряда выделяет ВЕСЬ ряд
                (п.6 — без отдельной кнопки «весь ряд»). */}
            <div className="group flex items-center rounded-md hover:bg-accent/60">
              <button
                onClick={() => toggleOpen(row)}
                title={t(isOpen(row) ? "layers.collapse" : "layers.expand")}
                className="flex shrink-0 items-center rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronRight
                  className={cn("size-3.5 transition-transform", isOpen(row) && "rotate-90")}
                />
              </button>
              <button
                onClick={(e) => {
                  const ids = mods.map((m) => m.id);
                  // Shift копит ряды в выделении — так же, как с секциями (п.4).
                  if (e.shiftKey) {
                    const whole = ids.every((id) => selection.includes(id));
                    select(
                      whole
                        ? selection.filter((id) => !ids.includes(id))
                        : [...new Set([...selection, ...ids])],
                    );
                    return;
                  }
                  if (rowSel === mods.length && selection.length === mods.length) clearSelection();
                  else select(ids);
                }}
                title={t("layers.selectRow")}
                className="flex min-w-0 flex-1 items-center gap-1 rounded-md py-1 pr-1 text-left text-[13px]"
              >
                <span
                  className={cn(
                    "flex-1 truncate font-medium",
                    rowSel > 0 ? "text-primary" : "text-foreground/90",
                  )}
                >
                  {t("canvas.rowFrame", { n: row })}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
                  {mods.length}
                </span>
              </button>
            </div>
            {isOpen(row) && (
              <div className="flex flex-col gap-0.5">
                {mods.map((m) =>
                  leaf(
                    m,
                    m.type === "section" ? (
                      <>
                        {t("module.section.title")}{" "}
                        <span className="tabular-nums text-muted-foreground/70">
                          {sectionNumber(floor, m.id)}
                        </span>
                      </>
                    ) : (
                      t(`module.${m.type}.title`)
                    ),
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}

      {structural.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          <div className={eyebrow({ size: "xs", className: "px-2 py-1 opacity-70" })}>
            {t("layers.structures")}
          </div>
          {structural.map((m) => leaf(m, t(`module.${m.type}.title`)))}
        </div>
      )}
    </div>
  );
}
