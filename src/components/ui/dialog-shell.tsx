import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Backdrop } from "./backdrop";

/**
 * Каркас окна-сайдбара: слой поверх страницы, затемнение и панель, которая
 * выезжает справа на всю высоту (правило Кирилла: никаких окон по центру).
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

// Поверхность панели — по образцу «Сообщить о проблеме» (Кирилл 12 ноя:
// «сайдбар везде разный, образец — как у сообщить о проблеме»): на всю
// высоту, без скруглений, одна рамка слева. Скругление у края экрана читалось
// как карточка, которая выпала из сетки, и у части панелей его не было.
const panel = cva(
  "relative flex h-full w-full animate-slide-in-right flex-col overflow-hidden border-l border-border bg-card shadow-2xl",
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
        true: "",
        false: "overflow-y-auto",
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
    <div className={cn("fixed inset-0 z-50 flex items-stretch justify-end", className)}>
      <Backdrop onClose={onClose} />
      <div role="dialog" aria-modal="true" className={panel({ size, scroll })}>
        {children}
      </div>
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
