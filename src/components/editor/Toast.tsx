import { useEffect, useState } from "react";
import { CheckCircle2, Undo2 } from "lucide-react";
import { UNDO_WINDOW_MS } from "@/lib/actionRisk";
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
  const undoable = Boolean(toast?.undo);

  useEffect(() => {
    if (!id) return;
    // Время — по длине: человек успевает прочитать текст трижды.
    // У отменяемого действия — ровно окно отмены, чтобы кнопка не исчезла раньше.
    const len = toastText.length;
    const ms = undoable ? UNDO_WINDOW_MS : Math.min(12_000, Math.max(4000, len * 150));
    const hide = setTimeout(() => setHiddenId(id), ms);
    return () => clearTimeout(hide);
  }, [id, toastText.length, undoable]);

  if (!toast) return null;

  // На телефоне тост — над нижней панелью рабочего места, иначе он закрывает смену.
  return (
    <div className="pointer-events-none fixed bottom-24 left-4 right-4 md:bottom-6 md:left-auto md:right-6 z-50 flex justify-center md:justify-end">
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
        <CheckCircle2 className="size-4 shrink-0 text-success" />
        {toastText}
        {toast.undo && toast.id !== hiddenId && (
          <button
            type="button"
            onClick={() => {
              toast.undo?.();
              setHiddenId(toast.id);
            }}
            className="pointer-events-auto -my-1 ml-2 inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 font-semibold text-background underline-offset-2 hover:bg-background/15"
          >
            <Undo2 className="size-3.5" />
            {t("common.undo")}
          </button>
        )}
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
