import { useState } from "react";
import { useEditor } from "@/lib/store";
import type { TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * «Вот это — ряд N» для всего выделения. Закреплённый ряд становится якорем:
 * остальные ряды пересчитываются вокруг него сами, без ручного запуска.
 */
export function AssignRow({ count, t }: { count: number; t: TFunc }) {
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
