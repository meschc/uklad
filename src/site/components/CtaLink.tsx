import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Главный призыв страницы — переход со стрелкой: первый экран, финальный блок,
 * шапки страниц «Складам» и «Селлерам».
 *
 * Раньше здесь была своя форма — «пилюля в пилюле» высотой 48 с тёмной
 * заливкой и синим кружком со стрелкой внутри. Она жила мимо обеих шкал:
 * высоты 48 нет в ряду 32 / 36 / 40, а тёмная заливка спорила с синей
 * основной кнопкой за роль «главного действия». Теперь это та же основная
 * кнопка, что и везде (ADR 0007), с характером витрины — круглой формой — и
 * стрелкой, которая говорит «переход», а не «действие на месте».
 *
 * Ссылка, а не кнопка: переход на страницу обязан открываться в новой вкладке
 * по Cmd-клику. Ширину (`w-full sm:w-auto`) задаёт место вызова.
 */
export function CtaLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Button asChild size="lg" shape="pill" className={cn("group", className)}>
      <a href={href}>
        {children}
        <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
      </a>
    </Button>
  );
}
