import { Layers } from "lucide-react";

/**
 * Плашка «сейчас открыто»: паллета или тара, в которую идёт приёмка.
 *
 * Держится на экране всё время шага, а не мигает подтверждением: кладовщик
 * отвлекается на физическую работу и возвращается к экрану с вопросом «куда я
 * сейчас кладу», а не «что я нажал минуту назад».
 */
export function ActiveTag({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 self-start rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
      <Layers className="size-3.5" />
      {label}
    </div>
  );
}
