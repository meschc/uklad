import { useEffect } from "react";
import { Lightbulb, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { ALT_KEY } from "@/lib/platform";
import { useT } from "@/lib/i18n";

/**
 * Разовая контекстная подсказка: всплывает в момент первого столкновения с
 * неочевидной механикой (LOD-раскрытие полок по зуму, Alt-дублирование) и
 * больше не возвращается. Не тур в начале работы, а точечный намёк по месту.
 */
export function OnboardingHint() {
  const activeHint = useEditor((s) => s.activeHint);
  const dismissHint = useEditor((s) => s.dismissHint);
  const t = useT();

  // Сам исчезает, если пользователь не закрыл руками.
  useEffect(() => {
    if (!activeHint) return;
    const id = window.setTimeout(dismissHint, 9000);
    return () => window.clearTimeout(id);
  }, [activeHint, dismissHint]);

  if (!activeHint) return null;

  const text =
    activeHint === "dup"
      ? t("onb.dup", { alt: ALT_KEY })
      : t(`onb.${activeHint}`);

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex animate-pop items-center gap-2.5 rounded-lg border border-border bg-popover/95 py-2 pl-3 pr-2 shadow-lg backdrop-blur">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lightbulb className="size-3.5" />
        </span>
        <span className="text-xs text-foreground">{text}</span>
        <button
          onClick={dismissHint}
          title={t("onb.gotIt")}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
