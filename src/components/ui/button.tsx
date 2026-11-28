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
        // Сплошные — с тонкой обводкой внутрь чуть светлее заливки (Кирилл
        // 28.11: «к акцентным кнопкам тонкую обводку чуть светлее»): кнопка
        // читается объёмной, размер не меняется. При наведении обводка ярче.
        default:
          "bg-primary text-primary-foreground shadow-sm ring-1 ring-inset ring-white/25 hover:bg-primary/90 hover:ring-white/40",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm ring-1 ring-inset ring-white/25 hover:bg-destructive/90 hover:ring-white/40",
        // «Брак» и «Проверить» — средняя опасность, жёлтая заливка, текст тёмный.
        warning:
          "bg-warning-fill text-warning-foreground shadow-sm ring-1 ring-inset ring-white/40 hover:bg-warning-fill/90 hover:ring-white/60",
        // Неон при наведении (Кирилл 27.11, «все кнопки»): полупрозрачная
        // заливка, тонкая обводка внутрь и текст цвета роли — как у активного
        // пункта меню и строки таблицы. Цвет роли задаёт `tone` (ниже).
        outline: "border border-input bg-background shadow-sm",
        secondary: "bg-secondary text-secondary-foreground hover:ring-1 hover:ring-inset",
        // Без фона — всё равно с тонкой обводкой (Кирилл 28.11: «иначе висят в
        // воздухе»). Обводка внутрь: размер тот же, что у остальных.
        ghost: "ring-1 ring-inset ring-border",
        link: "text-primary underline-offset-4 hover:underline",
        // На синей заливке (первый экран, выбранный тариф витрины): белая
        // кнопка и белая обводка. Цвета те же токены, что у основной.
        inverse: "bg-primary-foreground text-primary shadow-sm hover:bg-primary-foreground/90",
        "inverse-outline":
          "text-primary-foreground ring-1 ring-inset ring-primary-foreground hover:bg-primary-foreground/10",
      },
      // Цвет неона у тихих кнопок (Кирилл 28.11: «к другим цветам также»).
      // Синий — по умолчанию; красный — удалить, отменить, отозвать (текст
      // красный и в покое); зелёный — принять; жёлтый — внимание. Сплошным
      // кнопкам `tone` не нужен: их цвет — сам `variant`.
      tone: {
        primary: "",
        destructive: "",
        success: "",
        warning: "",
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
    compoundVariants: [
      {
        variant: ["outline", "secondary", "ghost"],
        tone: "primary",
        class:
          "hover:border-primary/40 hover:bg-primary/10 hover:text-primary hover:ring-primary/30",
      },
      {
        variant: ["outline", "secondary", "ghost"],
        tone: "destructive",
        class:
          "text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive hover:ring-destructive/30",
      },
      {
        variant: ["outline", "secondary", "ghost"],
        tone: "success",
        class:
          "text-success hover:border-success/40 hover:bg-success/10 hover:text-success hover:ring-success/30",
      },
      {
        // Жёлтый один на всё (Кирилл 28.11: «избавься от песочного»); тихая
        // кнопка — жёлтая плашка с тёмным текстом (вариант 2, 28.11):
        // жёлтый текст на белом не читается. В тёмной теме текст жёлтый.
        variant: ["secondary", "ghost"],
        tone: "warning",
        class:
          "bg-warning/25 text-warning-ink ring-1 ring-inset ring-warning/70 hover:bg-warning/45 hover:text-warning-ink hover:ring-warning",
      },
      {
        variant: "outline",
        tone: "warning",
        class:
          "border-warning/70 bg-warning/25 text-warning-ink hover:border-warning hover:bg-warning/45 hover:text-warning-ink",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      tone: "primary",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, tone, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, tone, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

// Наружу уходит только компонент. Таблица классов (`buttonVariants`) — его
// внутреннее устройство: тот, кому нужен вид кнопки, ставит кнопку, а не
// приклеивает её классы к своему элементу. Заодно файл экспортирует только
// компоненты, и горячая перезагрузка при правке не роняет состояние экрана.
export { Button };
