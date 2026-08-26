import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Индикатор автосохранения. Изменения и так пишутся в хранилище на каждое
 * действие, но без обратной связи это не очевидно — показываем состояние и
 * время последней записи. Клик форсирует запись прямо сейчас.
 *
 * Пульс «Сохранение…» вызывают только ДАННЫЕ: выделение, зум и панорама
 * не персистятся и статус не дёргают.
 */
export function SaveStatus() {
  const t = useT();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(() => Date.now());
  // Тик, чтобы «только что» со временем превращалось в «N мин назад».
  const [, setTick] = useState(0);

  useEffect(() => {
    let timer: number | undefined;
    const pulse = () => {
      setSaving(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setSaving(false);
        setSavedAt(Date.now());
      }, 500);
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (
        s.warehouse !== prev.warehouse ||
        s.otherWarehouses !== prev.otherWarehouses ||
        s.products !== prev.products ||
        s.placements !== prev.placements ||
        s.categoryFields !== prev.categoryFields ||
        s.fieldValues !== prev.fieldValues ||
        s.templates !== prev.templates ||
        s.account !== prev.account ||
        s.profile !== prev.profile
      ) {
        pulse();
      }
    });
    const iv = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => {
      unsub();
      window.clearTimeout(timer);
      window.clearInterval(iv);
    };
  }, []);

  const mins = Math.floor((Date.now() - savedAt) / 60_000);
  const when = mins < 1 ? t("save.justNow") : t("save.minsAgo", { n: mins });

  return (
    <button
      title={t("save.title")}
      onClick={() => {
        // Принудительная запись: любой set прогоняет persist в хранилище.
        setSaving(true);
        useEditor.setState({});
        window.setTimeout(() => {
          setSaving(false);
          setSavedAt(Date.now());
        }, 400);
      }}
      className={cn(
        // Подложка при наведении — той же высоты, что у соседей в шапке
        // («Загруженность», переключатель темы): px-2.5 py-1.5 = 28px.
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
        "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {saving ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      )}
      <span className="hidden sm:inline">
        {saving ? t("save.saving") : `${t("save.saved")} · ${when}`}
      </span>
    </button>
  );
}
