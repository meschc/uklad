import { UkladLogoLive } from "@/components/brand/UkladLogoLive";
import { useT } from "../lib/copy";
import { BRAND } from "../data/brand";

/**
 * Логотип в шапке и подвале витрины — живые клетки «У К Л А Д»
 * (`UkladLogoLive`). Название уже в знаке, поэтому отдельной подписи рядом
 * нет: экранный диктор читает его из `label`.
 */
export function Logo({ className }: { className?: string }) {
  const t = useT();
  return <UkladLogoLive cell={18} className={className} label={t(BRAND)} />;
}
