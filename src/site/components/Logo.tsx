import { UkladWordmark } from "@/components/brand/UkladLogo";
import { cn } from "@/lib/utils";
import { useT } from "../lib/copy";
import { BRAND } from "../data/brand";

/**
 * Логотип в шапке и подвале витрины — слово «Уклад» из клеток
 * (`UkladWordmark`, общий с кабинетом). Название уже нарисовано в знаке,
 * поэтому отдельной подписи рядом нет: экранный диктор читает его из `label`.
 */
export function Logo({ className }: { className?: string }) {
  const t = useT();
  return <UkladWordmark className={cn("h-9", className)} label={t(BRAND)} />;
}
