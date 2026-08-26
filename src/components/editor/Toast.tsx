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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(hide);
  }, [toast?.id]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <div
        className={cnVisible(
          visible,
          "flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background shadow-lg",
        )}
      >
        <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
        {t(toast.key, toast.vars)}
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
