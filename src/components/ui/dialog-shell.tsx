import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { card } from "./card";
import { Backdrop } from "./backdrop";

/**
 * Каркас модального окна: слой поверх страницы, затемнение и сама карточка.
 *
 * Окон в проекте одиннадцать, и до этого файла каждое повторяло одну и ту же
 * пару строк — «на весь экран, по центру, отступ» и «карточка со скруглением,
 * рамкой и тенью». Строки успели разойтись: высота окна была то 85, то 86, то
 * 88, то 90 процентов экрана. Разницу в два процента не видит никто, а
 * повторённая одиннадцать раз она означает, что следующее окно напишут
 * двенадцатым способом.
 *
 * Что осталось снаружи — размер и прокрутка, потому что это выбор про
 * содержимое, а не про оформление:
 *
 *   <DialogShell size="lg" onClose={onClose}>…</DialogShell>
 *   <DialogShell size="2xl" scroll onClose={onClose}>…</DialogShell>
 *
 * `onClose` управляет и подложкой: с ним окно закрывается кликом мимо и Escape,
 * без него — только кнопкой внутри. Второе нужно алертам, которые требуют
 * решения: закрыть расхождение при приёмке «мимо» значит потерять выбор.
 *
 * Внутри — шапка, тело и подвал; для первой и третьего есть `DialogHeader` и
 * `DialogFooter` ниже. Тело осталось без компонента намеренно: у окон разное
 * нутро — мастер с шагами, форма, таблица, — и общая обёртка на все случаи
 * обросла бы десятком флагов. Готовое «окно целиком» есть отдельно,
 * `fulfillment/Modal`, и оно построено на этом же каркасе.
 */

// Поверхность окна — та же карточка, что и везде (`card`), только без
// внутреннего отступа: поля рисуют шапка, тело и подвал по отдельности.
const panel = cva(
  card({ pad: "none", className: "relative w-full animate-scale-in overflow-hidden shadow-2xl" }),
  {
    variants: {
      size: {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
        xl: "max-w-xl",
        "2xl": "max-w-2xl",
        "3xl": "max-w-3xl",
      },
      /**
       * Окно с прокруткой внутри: карточка упирается в высоту экрана, а
       * скроллится тело. Без него карточка растёт по содержимому — так удобнее
       * коротким окнам, где ограничение только мешало бы.
       */
      scroll: {
        true: "flex max-h-[88vh] flex-col",
        false: "",
      },
    },
    defaultVariants: { size: "md", scroll: false },
  },
);

export function DialogShell({
  size,
  scroll,
  onClose,
  className,
  children,
}: VariantProps<typeof panel> & {
  /** Закрытие кликом мимо и по Escape. Без него окно закрывают только изнутри. */
  onClose?: () => void;
  /** Классы внешнего слоя — нужны редко (например, спрятать окно при печати). */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4", className)}>
      <Backdrop onClose={onClose} />
      <div className={panel({ size, scroll })}>{children}</div>
    </div>
  );
}

const header = cva("flex gap-3 border-b border-border px-5 py-3", {
  variants: {
    align: { start: "items-start justify-between", center: "items-center justify-between" },
  },
  defaultVariants: { align: "center" },
});

/**
 * Шапка окна. `align` — про то, в одну ли строку заголовок и кнопка закрытия:
 * при заголовке из двух строк кнопка должна встать по верхнему краю, иначе она
 * уезжает к середине текста.
 */
export function DialogHeader({
  align,
  children,
}: VariantProps<typeof header> & { children: React.ReactNode }) {
  return <div className={header({ align })}>{children}</div>;
}

const footer = cva(
  "flex shrink-0 items-center gap-2 border-t border-border bg-muted/30 px-5 py-3",
  {
    variants: { spread: { true: "justify-between", false: "justify-end" } },
    defaultVariants: { spread: false },
  },
);

/**
 * Подвал окна с кнопками. `spread` — когда слева стоит что-то ещё (счётчик
 * выбранного, кнопка «Удалить»), а действия жмутся вправо.
 */
export function DialogFooter({
  spread,
  children,
}: VariantProps<typeof footer> & { children: React.ReactNode }) {
  return <div className={footer({ spread })}>{children}</div>;
}
