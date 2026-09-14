import { useEditor } from "@/lib/store";
import { rowSides } from "@/lib/numbering";
import type { Floor } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TFunc } from "@/lib/i18n";

/**
 * Стороннность ряда: авто / односторонний / двусторонний, и на какой стороне
 * прохода нечётные номера. Пишется в RowConfig этажа (переживает рехайдрацию).
 */
export function RowSidedControl({ row, floor, t }: { row: number; floor: Floor; t: TFunc }) {
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
          <span className="text-[11px] text-muted-foreground">{t("insp.rowSided.oddSide")}</span>
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
