import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Кнопка одна на весь продукт. Действия круглые (Кирилл 16.11: «квадратные
 * выглядят странно»): круглое читается как «нажимается», а поля и карточки
 * остаются с мягкими углами — так кнопку не спутать с полем. ADR 0007.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // На синей заливке (первый экран, выбранный тариф витрины): белая
        // кнопка и белая обводка. Цвета те же токены, что у основной.
        inverse: "bg-primary-foreground text-primary shadow-sm hover:bg-primary-foreground/90",
        "inverse-outline":
          "text-primary-foreground ring-1 ring-inset ring-primary-foreground hover:bg-primary-foreground/10",
      },
      // На телефоне (уже `md`) любая кнопка — 44 px, под палец: минимум у
      // Apple 44 pt, у Material 48 dp (Кирилл 17.11: «размеры кнопок на
      // мобилке удобные?»). На компьютере сетка 32 / 36 / 40 как была.
      size: {
        default: "h-9 px-4 py-2 max-md:min-h-11",
        sm: "h-8 px-3 text-xs max-md:min-h-11 max-md:px-4 max-md:text-sm",
        lg: "h-10 px-6 max-md:min-h-11",
        icon: "h-9 w-9 max-md:min-h-11 max-md:min-w-11",
        "icon-sm": "h-8 w-8 max-md:min-h-11 max-md:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

// Наружу уходит только компонент. Таблица классов (`buttonVariants`) — его
// внутреннее устройство: тот, кому нужен вид кнопки, ставит кнопку, а не
// приклеивает её классы к своему элементу. Заодно файл экспортирует только
// компоненты, и горячая перезагрузка при правке не роняет состояние экрана.
export { Button };
