import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/store";
import { noticeDuration, type Notice } from "@/lib/notice";
import { useT } from "@/lib/i18n";
import { ToastCard } from "@/components/ui/toast";

/** Сколько длится уход: столько же, сколько `duration-base`. */
const LEAVE_MS = 200;

/**
 * Стопка уведомлений: справа внизу на компьютере, на телефоне — во всю ширину
 * над нижней панелью рабочего места (иначе закрывает смену). Самое свежее —
 * снизу, не больше трёх (`lib/notice`). Сама область кликов не ловит, только
 * карточки.
 */
export function Toaster() {
  const toasts = useEditor((s) => s.toasts);
  const t = useT();
  return (
    <section
      aria-label={t("notice.region")}
      className="pointer-events-none fixed bottom-24 left-4 right-4 z-50 flex flex-col items-stretch gap-2 md:bottom-6 md:left-auto md:right-6 md:w-[26rem]"
    >
      {toasts.map((n) => (
        <ToastItem key={n.id} notice={n} />
      ))}
    </section>
  );
}

/**
 * Одно уведомление со своим таймером. Наведение и фокус ставят таймер на
 * паузу и отдают остаток, а не начинают заново: прочитал — ушло.
 */
function ToastItem({ notice }: { notice: Notice }) {
  const t = useT();
  const dismiss = useEditor((s) => s.dismissToast);
  const text = t(notice.key, notice.vars);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const left = useRef(noticeDuration(notice.tone, text.length, Boolean(notice.undo)));

  useEffect(() => {
    if (leaving) {
      const gone = setTimeout(() => dismiss(notice.id), LEAVE_MS);
      return () => clearTimeout(gone);
    }
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => setLeaving(true), left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(0, left.current - (Date.now() - started));
    };
  }, [leaving, paused, dismiss, notice.id]);

  return (
    <ToastCard
      tone={notice.tone}
      text={text}
      leaving={leaving}
      repeat={{ n: notice.count, label: t("notice.repeat", { n: notice.count }) }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      undo={
        notice.undo
          ? {
              label: t("common.undo"),
              onClick: () => {
                notice.undo?.();
                setLeaving(true);
              },
            }
          : undefined
      }
      close={{ label: t("notice.close"), onClick: () => setLeaving(true) }}
    />
  );
}
