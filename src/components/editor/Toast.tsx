import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";

/**
 * Транзиентное уведомление внизу экрана: подтверждает действие (назначен ряд и
 * т.п.). Живёт ~2.6 с, затем плавно уходит. Источник — `store.toast` (ключ +
 * переменные), локализуется здесь. Не перехватывает клики.
 */
export function Toast() {
  const toast = useEditor((s) => s.toast);
  const t = useT();
  // Храним не «показан», а «какой тост уже отжил своё». Разница
  // принципиальная: «показан» пришлось бы включать эффектом сразу после
  // появления тоста — лишний прогон рендера ради того, что и так следует из
  // `store.toast`. Гасит тост таймер, и только его результат нужен в памяти.
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  const id = toast?.id;
  const toastText = toast ? t(toast.key, toast.vars) : "";

  useEffect(() => {
    if (!id) return;
    // Время — по длине: человек успевает прочитать текст трижды.
    const len = toastText.length;
    const hide = setTimeout(() => setHiddenId(id), Math.min(12_000, Math.max(4000, len * 150)));
    return () => clearTimeout(hide);
  }, [id, toastText.length]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex justify-end">
      {/*
        `key` по идентификатору тоста: следующий тост — это новый элемент, и
        появление проигрывается заново. Появление на анимации, а не на
        переходе, ровно поэтому: переход требует смены значения уже после
        монтирования, а значит и лишнего состояния «уже показан».
      */}
      <div
        key={toast.id}
        className={cnVisible(
          toast.id !== hiddenId,
          "flex max-w-[70ch] animate-scale-in items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background shadow-lg",
        )}
      >
        <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
        {toastText}
      </div>
    </div>
  );
}

/** Классы появления/ухода тоста (без внешней зависимости на cn для ясности). */
function cnVisible(visible: boolean, base: string): string {
  return `${base} transition-all duration-200 ${
    visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
  }`;
}
