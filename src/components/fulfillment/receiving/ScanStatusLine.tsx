import { Check, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScanStatus } from "../ScanField";

/**
 * Единственная строка состояния экрана: сюда попадает и «не тот штрихкод», и
 * «место занято», и отказ репозитория. Одна точка намеренно — учить кладовщика
 * смотреть в две значило бы гарантировать, что он не смотрит ни в одну.
 *
 * `role="status"` не случаен: скринридер должен произнести результат скана,
 * потому что глазами человек в этот момент смотрит на коробку, а не на экран.
 */
export function ScanStatusLine({ status, msg }: { status: ScanStatus; msg?: string }) {
  if (!msg) return null;
  const good = status === "ok";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
        good
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
      role="status"
    >
      {good ? <Check className="size-3.5 shrink-0" /> : <Package className="size-3.5 shrink-0" />}
      {msg}
    </div>
  );
}
