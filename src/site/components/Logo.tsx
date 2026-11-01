import { UkladLockup } from "@/components/brand/UkladLockup";
import { useT } from "../lib/copy";
import { BRAND } from "../data/brand";

/** Логотип витрины — общий с кабинетом знак с подписью (`UkladLockup`). */
export function Logo({
  tone = "blue",
  className,
}: {
  tone?: "blue" | "white";
  className?: string;
}) {
  const t = useT();
  return <UkladLockup tone={tone} label={t(BRAND)} className={className} />;
}
