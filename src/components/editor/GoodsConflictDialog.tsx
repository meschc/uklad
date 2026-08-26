import { useEffect } from "react";
import { AlertTriangle, ArrowRight, Check, PackageX } from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatAddress } from "@/lib/address";
import type { Product } from "@/lib/types";
import { useT, type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * «На полке товар, как поступить?» (ТЗ, разд. 4).
 * Это не геометрическая проверка, а предупреждение перед потерей размещений:
 * правку плана мы не запрещаем, а спрашиваем, что делать с товаром.
 */
export function GoodsConflictDialog() {
  const conflict = useEditor((s) => s.pendingConflict);
  const result = useEditor((s) => s.conflictResult);
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const resolve = useEditor((s) => s.resolveConflict);
  const cancel = useEditor((s) => s.cancelConflict);
  const t = useT();

  useEffect(() => {
    if (!conflict && !result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [conflict, result, cancel]);

  if (!conflict && !result) return null;

  const byId = (id: string) => products.find((p) => p.id === id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[1px]" />
      <div className="relative w-full max-w-md animate-scale-in overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {conflict ? (
          <>
            {/* Шапка в едином языке алертов: штриховка hazard-stripes + иконка.
                Список ниже оставляем на чистом фоне — не спорит с текстом. */}
            <div className="hazard-stripes flex gap-3 bg-amber-500/10 px-5 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t("conflict.title")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("conflict.subtitle", {
                    title: t(conflict.titleKey, conflict.titleVars),
                    phrase: lostPhrase(t, conflict.productIds.length),
                  })}
                </p>
              </div>
            </div>

            <ul className="scrollbar-thin max-h-52 overflow-y-auto border-y border-border bg-muted/30 px-5 py-2">
              {conflict.productIds.map((id) => {
                const p = byId(id);
                if (!p) return null;
                const addr = placements[id];
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 py-1 text-xs"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {(addr && formatAddress(warehouse, addr)) ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-2 px-5 py-4">
              <Button size="sm" onClick={() => resolve("relocate")}>
                <ArrowRight className="size-3.5" />
                {t("conflict.relocate")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolve("unplace")}
              >
                <PackageX className="size-3.5" />
                {t("conflict.unplace")}
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel}>
                {t("conflict.cancel")}
              </Button>
            </div>
          </>
        ) : (
          result && <ResultView result={result} byId={byId} onClose={cancel} />
        )}
      </div>
    </div>
  );
}

function ResultView({
  result,
  byId,
  onClose,
}: {
  result: { moved: string[]; failed: string[] };
  byId: (id: string) => Product | undefined;
  onClose: () => void;
}) {
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const t = useT();
  const ok = result.failed.length === 0;

  return (
    <>
      <div
        className={
          ok
            ? "flex gap-3 px-5 py-4"
            : "hazard-stripes flex gap-3 bg-amber-500/10 px-5 py-4"
        }
      >
        <div
          className={
            ok
              ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }
        >
          {ok ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {ok ? t("conflict.movedTitle") : t("conflict.partialTitle")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ok
              ? t("conflict.movedAll", { n: result.moved.length })
              : t("conflict.partial", {
                  moved: result.moved.length,
                  failed: result.failed.length,
                })}
          </p>
        </div>
      </div>

      <ul className="scrollbar-thin max-h-52 overflow-y-auto border-y border-border bg-muted/30 px-5 py-2">
        {[...result.moved, ...result.failed].map((id) => {
          const p = byId(id);
          if (!p) return null;
          const addr = placements[id];
          const place = addr ? formatAddress(warehouse, addr) : null;
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-2 py-1 text-xs"
            >
              <span className="truncate">{p.name}</span>
              {place ? (
                <span className="shrink-0 font-mono text-[11px] text-primary">
                  {place}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {t("conflict.noPlace")}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end px-5 py-3">
        <Button size="sm" onClick={onClose}>
          {t("conflict.done")}
        </Button>
      </div>
    </>
  );
}

/** «место потеряет 1 товар» / «N products will lose their spots» — с согласованием. */
function lostPhrase(t: TFunc, n: number): string {
  if (t.lang === "en") {
    return n === 1
      ? "1 product will lose its spot"
      : `${n} products will lose their spots`;
  }
  const d = n % 10;
  const dd = n % 100;
  const one = d === 1 && dd !== 11;
  const noun = t.plural(n, ["товар", "товара", "товаров"], ["", ""]);
  return `место ${one ? "потеряет" : "потеряют"} ${n} ${noun}`;
}
