import { ChevronLeft, Gauge, Layers, Printer, Table2, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/store";
import type { ViewMode } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { Segmented } from "@/components/ui/segmented";
import { SHOW_3D } from "./constants";
import { SaveStatus } from "./SaveStatus";

type ModeTab = { id: ViewMode; key: MsgKey; icon: typeof Layers };

const MODES: ModeTab[] = [
  { id: "table", key: "nav.mode.table", icon: Table2 },
  // 3D временно скрыт (SHOW_3D): визуализация ещё дорабатывается.
  // `satisfies` вместо приведения: внутри тернарника контекстного типа нет, и
  // без него строки расползаются до `string` — а тогда ни режим, ни ключ
  // словаря компилятор уже не проверит.
  ...(SHOW_3D ? ([{ id: "3d", key: "nav.mode.3d", icon: Box }] satisfies ModeTab[]) : []),
  { id: "2d", key: "nav.mode.2d", icon: Layers },
];

export function TopBar() {
  const warehouse = useEditor((s) => s.warehouse);
  const mode = useEditor((s) => s.mode);
  const setMode = useEditor((s) => s.setMode);
  const goToDashboard = useEditor((s) => s.goToDashboard);
  const setPrintPreview = useEditor((s) => s.setPrintPreview);
  const t = useT();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-3">
      {/* Слева: путь склад/этаж. Логотипа тут нет — он в боковом рельсе, а
          две «Уклад» подряд читались как дубль (п.1). */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={goToDashboard}
          title={t("nav.backToDashboard")}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-3.5 opacity-70" />
          <span className="font-medium text-foreground">{warehouse.name}</span>
        </button>
      </div>

      {/* Отмена / повтор живут на холсте, рядом с зумом (п.5) */}

      {/* По центру: режимы просмотра + тепловая карта отдельным окном (п.9) */}
      <div className="flex items-center gap-1.5">
        <Segmented
          value={mode}
          onChange={setMode}
          options={MODES.map((m) => ({
            value: m.id,
            label: t(m.key),
            icon: <m.icon />,
          }))}
        />
        <button
          // Без строки features window.open открывает обычную новую вкладку;
          // именованный target переиспользует уже открытую карту.
          onClick={() => window.open(`${window.location.pathname}?heatmap=1`, "uklad-heatmap")}
          title={t("heat.title")}
          className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Gauge className="size-3.5" />
          {t("heat.open")}
        </button>
      </div>

      {/* Справа: статус автосохранения + печать плана. Смена темы переехала в
          боковой рельс — здесь нужнее печатный план для сверки (п.9). */}
      <div className="flex items-center gap-1.5">
        <SaveStatus />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setPrintPreview(true)}
          aria-label={t("print.plan")}
          title={t("print.plan")}
        >
          <Printer className="size-4" />
        </Button>
      </div>
    </header>
  );
}
