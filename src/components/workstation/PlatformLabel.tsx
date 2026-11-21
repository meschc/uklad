import { useEffect, useRef, useState } from "react";
import { Printer, TriangleAlert } from "lucide-react";
import { useT, type MsgKey } from "@/lib/i18n";
import { platformLabelRepository } from "@/lib/data/platformLabelRepository";
import { printPdf } from "@/lib/printPdf";
import { Button } from "@/components/ui/button";

const PLATFORM_NAME: Record<string, MsgKey> = {
  ozon: "ws.plabel.name.ozon",
  "yandex-market": "ws.plabel.name.ym",
};

/**
 * Ярлык площадки посылки (шаг 6 `docs/domain/fbs.md`): без него площадка
 * посылку не примет. Печатается сам, как только посылка готова; ярлык дают
 * после «собран» на площадке, поэтому «ещё не готов» — с кнопкой повторить.
 * Своя этикетка UK- остаётся: по ней стол сверяет посылку.
 */
export function PlatformLabel({ requestId, source }: { requestId: string; source: string }) {
  const t = useT();
  const [state, setState] = useState<
    { kind: "idle" | "loading" | "printed" } | { kind: "failed"; text: string }
  >({ kind: "idle" });
  const asked = useRef<string | null>(null);
  const key = PLATFORM_NAME[source];
  const name = key ? t(key) : source;

  const run = async () => {
    setState({ kind: "loading" });
    const res = await platformLabelRepository.fetch(requestId);
    if (!res.ok) {
      const text = t(res.error, { platform: name });
      return setState({ kind: "failed", text: res.detail ? `${text} (${res.detail})` : text });
    }
    printPdf(res.file);
    setState({ kind: "printed" });
  };

  useEffect(() => {
    if (asked.current === requestId) return;
    asked.current = requestId;
    void run();
    // Один раз на посылку: повтор — кнопкой.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {state.kind === "failed" ? (
        <TriangleAlert className="size-4 shrink-0 text-warning" />
      ) : (
        <Printer className="size-4 shrink-0 text-primary" />
      )}
      <span className={state.kind === "failed" ? "text-warning-foreground" : "font-medium"}>
        {state.kind === "failed"
          ? state.text
          : t(state.kind === "printed" ? "ws.plabel.printed" : "ws.plabel.loading", {
              platform: name,
            })}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={state.kind === "loading"}
        onClick={() => void run()}
      >
        <Printer />
        {t(state.kind === "failed" ? "ws.plabel.retry" : "ws.plabel.reprint", { platform: name })}
      </Button>
    </div>
  );
}
