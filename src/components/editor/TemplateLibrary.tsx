import { Group, Library, Stamp, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { LayoutTemplate } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MODULE_STYLES } from "./constants";
import { PanelSection } from "./PanelSection";

/** Мини-превью раскладки: полки (строки) × ячейки (столбцы). */
function TemplateThumb({ cells }: { cells: number[] }) {
  return (
    <div className="flex h-9 w-9 shrink-0 flex-col overflow-hidden rounded border border-module-section-fg/30 bg-module-section">
      {cells.map((c, i) => (
        <div
          key={i}
          className={cn(
            "flex min-h-0 flex-1",
            i > 0 && "border-t border-black/25 dark:border-white/25",
          )}
        >
          {Array.from({ length: c }).map((_, j) => (
            <span
              key={j}
              className={cn(
                "min-w-0 flex-1",
                j > 0 && "border-l border-black/15 dark:border-white/15",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Мини-превью раскладки модулей: клетки габарита группы в цветах типов. */
function LayoutThumb({ tpl }: { tpl: LayoutTemplate }) {
  const w = Math.max(1, ...tpl.modules.map((m) => m.dx + m.w));
  const h = Math.max(1, ...tpl.modules.map((m) => m.dy + m.h));
  return (
    <div
      className="grid h-9 w-9 shrink-0 gap-px overflow-hidden rounded border border-border bg-muted/40"
      style={{
        gridTemplateColumns: `repeat(${w}, 1fr)`,
        gridTemplateRows: `repeat(${h}, 1fr)`,
      }}
    >
      {tpl.modules.map((m, i) => (
        <span
          key={i}
          className={cn("rounded-[1px]", MODULE_STYLES[m.type].fill)}
          style={{
            gridColumn: `${m.dx + 1} / span ${m.w}`,
            gridRow: `${m.dy + 1} / span ${m.h}`,
          }}
        />
      ))}
    </div>
  );
}

/** Блок «Шаблоны раскладки модулей» (#38): сохранить группу и штамповать. */
function LayoutTemplateList() {
  const templates = useEditor((s) => s.layoutTemplates);
  const selection = useEditor((s) => s.selection);
  const stampId = useEditor((s) => s.stampTemplateId);
  const addLayout = useEditor((s) => s.addLayoutTemplate);
  const removeLayout = useEditor((s) => s.removeLayoutTemplate);
  const setStamp = useEditor((s) => s.setStampTemplate);
  const t = useT();

  const canSave = selection.length > 0;

  return (
    <PanelSection
      storageKey="tpl-layout"
      defaultCollapsed
      title={t("layout.title")}
      count={templates.length}
      icon={<Group className="size-3.5" />}
      grow
      bodyClassName="flex flex-col gap-1.5 px-2 pb-2"
    >
        <button
          type="button"
          disabled={!canSave}
          onClick={() => addLayout()}
          className={cn(
            "rounded-md border border-dashed py-1.5 text-[11px] font-medium transition-colors",
            canSave
              ? "border-primary/40 text-primary hover:bg-primary/10"
              : "cursor-not-allowed border-border text-muted-foreground/50",
          )}
        >
          {canSave ? t("layout.saveN", { n: selection.length }) : t("layout.selectFirst")}
        </button>

        {templates.length === 0 && (
          <p className="px-1 py-1 text-xs leading-relaxed text-muted-foreground">
            {t("layout.empty")}
          </p>
        )}

        {templates.map((tpl) => {
          const active = stampId === tpl.id;
          const sec = tpl.modules.filter((m) => m.type === "section").length;
          return (
            <div
              key={tpl.id}
              className={cn(
                "group rounded-md border p-2 transition-colors",
                active ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div className="flex items-center gap-2">
                <LayoutThumb tpl={tpl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{tpl.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {tpl.modules.length}{" "}
                    {t.plural(
                      tpl.modules.length,
                      ["модуль", "модуля", "модулей"],
                      ["module", "modules"],
                    )}
                    {sec > 0 && ` · ${sec} ${t.plural(sec, ["секц.", "секц.", "секц."], ["sec.", "sec."])}`}
                  </div>
                </div>
                <button
                  type="button"
                  title={t("tpl.remove")}
                  onClick={() => removeLayout(tpl.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setStamp(active ? null : tpl.id)}
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/10 text-primary hover:bg-primary/15",
                )}
              >
                <Stamp className="size-3" />
                {active ? t("layout.stamping") : t("layout.stamp")}
              </button>
            </div>
          );
        })}
    </PanelSection>
  );
}

/**
 * Библиотека шаблонов раскладок полок/ячеек — как панель компонентов в Figma
 * (ТЗ, разд. 2.3). Применяется к выделенным секциям.
 */
export function TemplateLibrary() {
  const templates = useEditor((s) => s.templates);
  const selection = useEditor((s) => s.selection);
  const modules = useEditor((s) => s.activeFloor().modules);
  const applyTemplate = useEditor((s) => s.applyTemplateToSelection);
  const removeTemplate = useEditor((s) => s.removeTemplate);
  const t = useT();

  const selSections = modules.filter(
    (m) => selection.includes(m.id) && m.type === "section",
  ).length;

  return (
    <>
    <PanelSection
      storageKey="tpl-shelves"
      defaultCollapsed
      title={t("tpl.title")}
      count={templates.length}
      icon={<Library className="size-3.5" />}
      grow
      bodyClassName="flex flex-col gap-1.5 px-2 pb-2"
    >
        {templates.length === 0 && (
          <p className="px-1 py-2 text-xs leading-relaxed text-muted-foreground">
            {t("tpl.empty")}
          </p>
        )}

        {templates.map((tpl) => {
          const cellSum = tpl.cells.reduce((a, b) => a + b, 0);
          const canApply = selSections > 0;
          const seedName = t(`tpl.seed.${tpl.name}`);
          const name = seedName.startsWith("tpl.seed.") ? tpl.name : seedName;
          return (
            <div
              key={tpl.id}
              className={cn(
                "group rounded-md border p-2 transition-colors",
                canApply
                  ? "border-border hover:border-primary/50"
                  : "border-border",
              )}
            >
              <div className="flex items-center gap-2">
                <TemplateThumb cells={tpl.cells} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {tpl.cells.length}{" "}
                    {t.plural(
                      tpl.cells.length,
                      ["полка", "полки", "полок"],
                      ["shelf", "shelves"],
                    )}{" "}
                    · {cellSum}{" "}
                    {t.plural(
                      cellSum,
                      ["ячейка", "ячейки", "ячеек"],
                      ["cell", "cells"],
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  title={t("tpl.remove")}
                  onClick={() => removeTemplate(tpl.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <button
                type="button"
                disabled={!canApply}
                onClick={() => applyTemplate(tpl.id)}
                className={cn(
                  "mt-2 w-full rounded-md py-1 text-[11px] font-medium transition-colors",
                  canApply
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "cursor-not-allowed bg-muted/60 text-muted-foreground/60",
                )}
              >
                {canApply
                  ? t("tpl.applyToN", { n: selSections })
                  : t("tpl.selectSections")}
              </button>
            </div>
          );
        })}
    </PanelSection>
    <LayoutTemplateList />
    </>
  );
}
