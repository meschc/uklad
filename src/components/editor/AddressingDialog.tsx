import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RefreshCw, Rows3, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { detectRows } from "@/lib/numbering";
import { formatAddress } from "@/lib/address";
import { useT, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { eyebrow } from "@/components/ui/eyebrow";

/**
 * Окно «Как устроена адресация» (ТЗ, разд. 2.1). Схема адресации у каждого
 * склада своя, поэтому вместо зашитого формата — несколько вопросов и живой
 * пример адреса. Ряды система предлагает сама, но применяет только по «да».
 */
export function AddressingDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const cfg = useEditor((s) => s.addressing);
  const updateAddressing = useEditor((s) => s.updateAddressing);
  const applyRows = useEditor((s) => s.applyRows);
  const select = useEditor((s) => s.select);
  const floor = useEditor((s) => s.activeFloor());
  const warehouse = useEditor((s) => s.warehouse);
  const [applied, setApplied] = useState(false);

  const rows = useMemo(() => detectRows(floor), [floor]);

  // Живой пример: первая реальная ячейка на этаже.
  const example = useMemo(() => {
    const sec = floor.modules.find((m) => m.type === "section" && (m.shelves?.length ?? 0) > 0);
    if (!sec) return null;
    return formatAddress(
      warehouse,
      { floorId: floor.id, moduleId: sec.id, shelfIndex: 0, cellIndex: 0 },
      cfg,
    );
  }, [floor, warehouse, cfg]);

  // Портал в body: иначе плавающая карточка сайдбара (её backdrop-filter/
  // трансформации могли бы) ловит position:fixed, и окно всплывало бы ВНУТРИ
  // левой панели, а не поверх всего экрана (п.9).
  return createPortal(
    <DialogShell scroll onClose={onClose}>
      <DialogHeader align="start">
        <div>
          <p className="text-sm font-semibold">{t("addr.title")}</p>
          <p className="text-xs text-muted-foreground">{t("addr.subtitle")}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {/* Пример адреса — сразу видно, что настраиваем */}
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className={eyebrow()}>{t("addr.preview")}</p>
          {example ? (
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{example}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t("addr.previewNone")}</p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {[
              cfg.useFloor !== false && t("addr.level.floor"),
              cfg.useRows && t("addr.level.row"),
              t("addr.level.section"),
              t("addr.level.shelf"),
              t("addr.level.cell"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* Уровни: участвует ли этаж и ряд */}
        <Block label={t("addr.levels")}>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- поле и подпись внутри label, но текст лежит на уровень глубже, чем ждёт правило по умолчанию; имя элемента браузер собирает верно */}
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={cfg.useFloor !== false}
              onChange={(e) =>
                updateAddressing({
                  useFloor: e.target.checked,
                  configured: true,
                })
              }
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="block text-sm">{t("addr.useFloor")}</span>
              <span className="block text-[11px] text-muted-foreground">
                {t("addr.useFloorHint")}
              </span>
            </span>
          </label>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- то же, что выше: текст на уровень глубже, чем ждёт правило */}
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={cfg.useRows}
              onChange={(e) => updateAddressing({ useRows: e.target.checked, configured: true })}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="block text-sm">{t("addr.useRows")}</span>
              <span className="block text-[11px] text-muted-foreground">
                {t("addr.useRowsHint")}
              </span>
            </span>
          </label>
        </Block>

        {/* Ряды: показываем найденное и спрашиваем */}
        {cfg.useRows && (
          <Block label={t("addr.rows")}>
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("addr.rowsNone")}</p>
            ) : (
              <>
                <p className="mb-2 text-xs">{t("addr.rowsFound", { n: rows.length })}</p>
                <div className="mb-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {rows.map((r, i) => (
                    <button
                      // Ряд опознаём по первой секции в нём, а не по номеру
                      // позиции: ряды пересчитываются от плана, и новый ряд
                      // сверху сдвинул бы номера у всех остальных.
                      key={r[0].id}
                      onClick={() => select(r.map((m) => m.id))}
                      title={t("addr.rowSelect")}
                      className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
                    >
                      <span className="flex items-center gap-1.5">
                        <Rows3 className="size-3 text-muted-foreground" />
                        {t("addr.rowN", { n: i + 1 })}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {t("addr.rowSections", { n: r.length })}
                      </span>
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    applyRows(rows.map((r) => r.map((m) => m.id)));
                    setApplied(true);
                    window.setTimeout(() => setApplied(false), 1800);
                  }}
                >
                  {applied ? (
                    <>
                      <Check className="size-3.5" />
                      {t("addr.rowsApplied")}
                    </>
                  ) : (
                    t("addr.rowsApply")
                  )}
                </Button>
              </>
            )}
          </Block>
        )}

        {/* Направление нумерации полок */}
        <Block label={t("addr.shelves")}>
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {(
              [
                ["bottomUp", t("addr.bottomUp")],
                ["topDown", t("addr.topDown")],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => updateAddressing({ shelfOrder: v, configured: true })}
                className={cn(
                  "flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  cfg.shelfOrder === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Block>

        {/* Разделитель уровней */}
        <Block label={t("addr.separator")}>
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {["-", ".", "/"].map((sep) => (
              <button
                key={sep}
                onClick={() => updateAddressing({ separator: sep, configured: true })}
                className={cn(
                  "flex-1 rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors",
                  cfg.separator === sep
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {sep}
              </button>
            ))}
          </div>
        </Block>
      </div>

      <DialogFooter spread>
        {/* Номера рядов закреплены в данных и переживают правки плана —
              отсюда «старая» нумерация. Кнопка раскладывает ряды заново по
              текущей геометрии этажа. */}
        <Button
          size="sm"
          variant="outline"
          title={t("addr.renumberRowsHint")}
          onClick={() => useEditor.getState().renumberFloorRows()}
        >
          <RefreshCw className="size-3.5" />
          {t("addr.renumberRows")}
        </Button>
        <Button size="sm" onClick={onClose}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </DialogShell>,
    document.body,
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Кнопка открытия настроек адресации — для панели структуры. */
export function AddressingButton({ t }: { t: TFunc }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
      >
        <Rows3 className="size-3" />
        {t("addr.open")}
      </button>
      {open && <AddressingDialog onClose={() => setOpen(false)} />}
    </>
  );
}
