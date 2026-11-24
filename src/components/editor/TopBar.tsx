import { Gauge, Layers, Printer, Table2, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectRole, useEditor } from "@/lib/store";
import type { ViewMode } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { Segmented } from "@/components/ui/segmented";
import { SHOW_3D } from "./constants";
import { SaveStatus } from "./SaveStatus";
import { cn } from "@/lib/utils";

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
  const mode = useEditor((s) => s.mode);
  const setMode = useEditor((s) => s.setMode);
  // Продавцу печать плана не нужна: это инструмент склада.
  const isSeller = useEditor((s) => selectRole(s) === "seller");
  const setPrintPreview = useEditor((s) => s.setPrintPreview);
  // «Сохранить» и «Распечатать план» — про план: в таблице товаров их нет (Кирилл 23.11).
  const onPlan = mode !== "table";
  const t = useT();

  return (
    // Три колонки 1fr · auto · 1fr: переключатель стоит ровно по центру и не
    // уезжает, когда справа появляются «Сохранено» и печать (Кирилл 24.11).
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-card px-3">
      {/* Слева: путь склад/этаж. Логотипа тут нет — он в боковом рельсе, а
          две «Уклад» подряд читались как дубль (п.1). */}
      <div className="flex items-center gap-2.5"></div>

      {/* Отмена / повтор живут на холсте, рядом с зумом (п.5) */}

      {/* По центру: режимы просмотра + тепловая карта отдельным окном (п.9) */}
      {/* Кнопка загруженности висит справа от переключателя (absolute), а не
          в общей строке: иначе на «Плане» она расширяет середину и сдвигает
          «Таблица / План» влево. */}
      <div className="relative flex items-center">
        {/* План — только на компьютере: на телефоне один режим, таблица. */}
        <Segmented
          className="max-md:hidden"
          value={mode}
          onChange={setMode}
          options={MODES.map((m) => ({
            value: m.id,
            label: t(m.key),
            icon: <m.icon />,
          }))}
        />
        {/* Та же высота и тот же угол, что у переключателя рядом: две
            соседние плашки с разным скруглением видно сразу (Кирилл 12 ноя). */}
        <Button
          variant="ghost"
          size="sm"
          // Загруженность — про план: на компьютере только на «Плане» (Кирилл
          // 24.11). На телефоне плана нет, там кнопка остаётся (Кирилл 18.11).
          // Без строки features window.open открывает обычную новую вкладку;
          // именованный target переиспользует уже открытую карту.
          onClick={() => window.open(`${window.location.pathname}?heatmap=1`, "uklad-heatmap")}
          title={t("heat.title")}
          // Загруженность остаётся и на телефоне (Кирилл 18.11) — единственное
          // из плана, что там нужно; печать плана — только за компьютером.
          className={cn(
            "gap-1.5 rounded-lg bg-muted px-2.5 text-muted-foreground hover:text-foreground md:absolute md:left-full md:ml-1.5 [&_svg]:size-3.5",
            !onPlan && "md:hidden",
          )}
        >
          <Gauge />
          {t("heat.open")}
        </Button>
      </div>

      {/* Справа: статус автосохранения + печать плана. Смена темы переехала в
          боковой рельс — здесь нужнее печатный план для сверки (п.9). */}
      <div className="flex items-center justify-end gap-1.5">
        {onPlan && <SaveStatus />}
        {onPlan && !isSeller && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden md:inline-flex"
            onClick={() => setPrintPreview(true)}
            aria-label={t("print.plan")}
            title={t("print.plan")}
          >
            <Printer className="size-4" />
          </Button>
        )}
      </div>
    </header>
  );
}
