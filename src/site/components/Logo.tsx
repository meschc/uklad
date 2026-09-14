import { cn } from "@/lib/utils";
import { useT } from "../lib/copy";
import { BRAND } from "../data/brand";

/**
 * Знак «Уклада»: стеллаж в три полки и коробка, которая лежит на средней.
 *
 * Смысл ровно в этом — не «облако» и не абстрактная стрелка. Продукт обещает
 * одну вещь: товар не «где-то на складе», а на конкретном месте, и это место
 * видно. Коробка на полке — самая короткая запись этого обещания, и она же
 * единственная деталь, которая держит знак узнаваемым в 16 px: три белые
 * полосы одинаковы у всех, жёлтый прямоугольник — нет.
 *
 * `currentColor` не используется намеренно: знак фирменный, он должен
 * оставаться синим и на выделенной секции витрины, и в фавиконе.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden focusable="false">
      <defs>
        {/* Градиент знака взят из тех же двух токенов, что и весь акцент
            страницы: светлый край — `--brand`, глубокий — `--primary`. Раньше
            здесь стояли два жёстких hex-а, и при смене синего знак остался бы
            в прежнем тоне — единственным местом на странице, которое помнит
            старую палитру. */}
        <linearGradient id="uklad-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(var(--brand))" />
          <stop offset="1" stopColor="hsl(var(--primary))" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#uklad-mark-grad)" />
      <rect x="7" y="8" width="18" height="2" rx="1" fill="#fff" opacity=".5" />
      <rect x="7" y="16.5" width="18" height="2" rx="1" fill="#fff" opacity=".92" />
      <rect x="7" y="25" width="18" height="2" rx="1" fill="#fff" opacity=".5" />
      <rect x="15" y="10.5" width="6.5" height="6" rx="1.5" fill="#FBBF24" />
    </svg>
  );
}

/**
 * Знак с названием.
 *
 * Светлого варианта у названия больше нет: витрина тёмная целиком, и
 * `text-foreground` уже светлый. Отдельный «инвертированный» тон означал бы
 * второй источник правды о цвете текста — с ним логотип однажды разъедется с
 * остальной страницей.
 */
export function Logo({ className }: { className?: string }) {
  const t = useT();

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {/* Единственное место, где начертание тяжелее 500 оставлено намеренно.
          Заголовки на странице ушли на 500, но название рядом со знаком — не
          заголовок, а марка: на 500 оно читается как обычная строка в шапке и
          перестаёт быть логотипом. 600 — минимум, на котором слово всё ещё
          держится как знак. */}
      <span className="font-display text-[19px] font-semibold leading-none tracking-tight text-foreground">
        {t(BRAND)}
      </span>
    </span>
  );
}
