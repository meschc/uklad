import { Scale, X } from "lucide-react";
import { COMPARE_LIMIT } from "../../lib/compare";
import { useCookieBannerOpen } from "../../lib/cookieConsent";
import { c, useT } from "../../lib/copy";
import type { Warehouse } from "../../data/warehouses";

const T = {
  heading: c("К сравнению", "To compare"),
  of: c("{n} из {max}", "{n} of {max}"),
  alone: c(
    "Отметьте ещё один — одному складу не с чем сравниваться.",
    "Mark one more — a single warehouse has nothing to compare against.",
  ),
  remove: c("Убрать из сравнения: {name}", "Remove from comparison: {name}"),
  clear: c("Очистить", "Clear"),
  open: c("Сравнить", "Compare"),
};

/**
 * Полоса отмеченных складов — внизу экрана, поверх каталога.
 *
 * Отметки ставят по одной, листая длинный список, и между первой и последней
 * проходит полторы страницы прокрутки. Без полосы человек к этому моменту уже
 * не помнит, кого отметил, и единственный способ проверить — уехать наверх.
 * Поэтому набор виден всегда и из него можно вычёркивать прямо здесь: убрать
 * склад проще там, где видно всех четверых, а не там, где лежит его карточка.
 *
 * Пока баннер cookie не убран, полосы нет вовсе — и это не про порядок слоёв.
 * Низ экрана один, и две наложенные друг на друга плашки читаются как
 * поломка: у баннера своя ширина, у полосы своя, и на пересечении пропадают
 * ровно названия складов. Полоса подождёт: она про удобство, баннер про закон,
 * а отметки на карточках видны и без неё.
 */
export function CompareBar({
  list,
  onRemove,
  onClear,
  onOpen,
}: {
  /** Отмеченные склады в порядке отметки. Пустой набор полосы не рисует. */
  list: Warehouse[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  const cookieBanner = useCookieBannerOpen();

  if (list.length === 0 || cookieBanner) return null;
  const alone = list.length < 2;

  return (
    <div data-print="hide" className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-4 sm:pb-4">
      {/* Полоса названа своим заголовком: крестик «Убрать из сравнения» есть и
          здесь, и на самой карточке, и на колонке таблицы — без имени области
          непонятно, который из трёх читает голос и который нажимает тест. */}
      <section
        aria-labelledby="compare-bar-title"
        className="r-window mx-auto flex max-w-[1400px] animate-slide-up flex-col gap-3 border border-border bg-card/95 p-3 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:p-4"
      >
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <Scale className="size-4 shrink-0 text-primary" />
          <span id="compare-bar-title" className="text-[13px] font-medium">
            {t(T.heading)}
          </span>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {t(T.of, { n: list.length, max: COMPARE_LIMIT })}
          </span>
        </div>

        {/* Названия едут внутри своей полосы, а не переносятся: четыре длинных
            имени в две строки поднимают полосу на треть экрана телефона —
            ровно над тем каталогом, ради которого её и открыли. */}
        <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-0.5">
          {list.map((w) => (
            <span
              key={w.id}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-background pl-3 pr-1 text-[12px]"
            >
              <span className="max-w-[10rem] truncate">{t(w.name)}</span>
              <button
                type="button"
                onClick={() => onRemove(w.id)}
                aria-label={t(T.remove, { name: t(w.name) })}
                className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Объяснение стоит рядом с погасшей кнопкой, а не прячется в
              подсказке при наведении: на телефоне наводить нечем. */}
          {alone && (
            <span className="hidden max-w-[16rem] text-[12px] leading-snug text-muted-foreground lg:block">
              {t(T.alone)}
            </span>
          )}
          <button
            type="button"
            onClick={onClear}
            className="h-10 rounded-full border border-border px-4 text-[13px] font-medium transition-colors hover:bg-muted"
          >
            {t(T.clear)}
          </button>
          <button
            type="button"
            onClick={onOpen}
            disabled={alone}
            className="h-10 rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-colors enabled:hover:bg-primary/90 disabled:opacity-45"
          >
            {t(T.open)}
          </button>
        </div>
      </section>
    </div>
  );
}
