import { MousePointerClick } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT, type TFunc } from "@/lib/i18n";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import { MultiInspector } from "./inspector/MultiInspector";
import { SingleInspector } from "./inspector/SingleInspector";

/**
 * Правая панель свойств. Сама она — только рамка и развилка по размеру
 * выделения; всё содержимое живёт в `inspector/` отдельными файлами: панель
 * одной секции, групповая панель, свойства ряда, редактор полок.
 */
export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const modules = useEditor((s) => s.activeFloor().modules);
  const selected = modules.filter((m) => selection.includes(m.id));
  const t = useT();

  return (
    <aside
      className={card({
        pad: "none",
        className: "pointer-events-auto m-3 flex w-64 shrink-0 flex-col overflow-hidden shadow-lg",
      })}
    >
      <div
        className={eyebrow({
          size: "base",
          className: "flex h-10 shrink-0 items-center border-b border-border px-3",
        })}
      >
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
      <p className="text-xs leading-relaxed text-muted-foreground">{t("insp.emptyHint")}</p>
    </div>
  );
}
