import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Главное действие экрана на телефоне — плавающей кнопкой внизу справа, над
 * нижней панелью кабинета (Кирилл 27.11: «главные кнопки можно плавающие вниз
 * перенести»). Палец до неё достаёт одной рукой, а панель над таблицей не
 * разъезжается на три строки. На компьютере кнопки нет: там то же действие
 * стоит в шапке экрана, и экран прячет ту копию на телефоне (`max-md:hidden`).
 *
 * Одна на экран: два «главных» действия — уже не главное.
 */
export function FloatingAction({
  icon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // Нижняя панель — 3.5rem плюс вырез экрана; ещё 1rem зазора.
        "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 h-12 rounded-full px-5 shadow-lg md:hidden",
        className,
      )}
    >
      {icon}
      {label}
    </Button>
  );
}
