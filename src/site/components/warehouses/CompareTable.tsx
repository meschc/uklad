import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan } from "../../data/plans";
import { ru, useT, type Copy } from "../../lib/copy";
import { scrollPageTo } from "../../lib/useSmoothScroll";
import { Reveal } from "../Reveal";
import { STICKY_NAV_H } from "./StickyNav";
import { COMPARE, NO, SHORT_COMPARE, YES, type Row } from "./tariffsData";

const T = {
  head: ru("Что входит"),
  showAll: ru("Показать все различия"),
  hideAll: ru("Свернуть"),
};

const MS = 450;

/**
 * Таблица отличий тарифов (Кирилл, 20 окт): свёрнута до главных строк и
 * раскрывается плавно — высота едет от свёрнутой к полной и обратно. Шапка
 * таблицы закрепляется под шапкой сайта. При «Свернуть» страница
 * возвращается туда, где была, когда таблицу раскрыли: кнопка встаёт на то
 * же место на экране, а не остаётся висеть далеко внизу.
 *
 * Ширины колонок заданы явно (`table-fixed`): иначе при смене набора строк
 * колонки пересчитывались по содержимому и таблица дёргалась.
 */
export function CompareTable({ plans }: { plans: Plan[] }) {
  const t = useT();
  const [full, setFull] = useState(false);
  const [height, setHeight] = useState<number | "auto">("auto");
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const shortH = useRef(0);
  const btnOffset = useRef<number | null>(null);
  const pending = useRef<"open" | null>(null);

  useLayoutEffect(() => {
    if (!full && box.current) shortH.current = box.current.offsetHeight;
  }, [full]);

  // Раскрытие: строки уже полные, высота едет от свёрнутой к полной.
  useLayoutEffect(() => {
    if (pending.current !== "open" || !box.current) return;
    pending.current = null;
    const to = box.current.scrollHeight;
    requestAnimationFrame(() => setHeight(to));
  }, [full]);

  const toggle = () => {
    if (!box.current || !btn.current) return;
    if (!full) {
      btnOffset.current = btn.current.getBoundingClientRect().top;
      setHeight(box.current.offsetHeight);
      pending.current = "open";
      setFull(true);
      return;
    }
    // Свёртывание: строки остаются полными, пока высота не доедет, а
    // страница одновременно уезжает так, чтобы кнопка встала на прежнее место.
    const fullH = box.current.offsetHeight;
    setHeight(fullH);
    const shrink = fullH - shortH.current;
    const btnTop = btn.current.getBoundingClientRect().top + window.scrollY - shrink;
    const offset = btnOffset.current ?? window.innerHeight / 2;
    requestAnimationFrame(() => {
      setHeight(shortH.current);
      scrollPageTo(Math.max(0, btnTop - offset));
    });
    window.setTimeout(() => {
      setFull(false);
      setHeight("auto");
    }, MS);
  };

  const rows: { title?: Copy; row: Row }[] = full
    ? COMPARE.flatMap((g) => [
        { title: g.title, row: g.rows[0] },
        ...g.rows.slice(1).map((row) => ({ row })),
      ])
    : SHORT_COMPARE.map((row) => ({ row }));

  const animating = height !== "auto";

  return (
    <>
      {/* Таблица шире телефона: прокручивается внутри себя, страница не едет.
          С ноутбука прокрутки нет — иначе шапка таблицы не закрепится. */}
      <Reveal className="mt-12">
        <div
          ref={box}
          onTransitionEnd={(e) => {
            if (e.target === box.current && full) setHeight("auto");
          }}
          style={{
            height: animating ? height : undefined,
            transition: animating ? `height ${MS}ms cubic-bezier(0.16,1,0.3,1)` : undefined,
          }}
          className={cn(
            "motion-reduce:!transition-none",
            animating ? "overflow-hidden" : "overflow-x-auto lg:overflow-visible",
          )}
        >
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[15px]">
            <colgroup>
              <col className="w-[40%]" />
              {plans.map((p) => (
                <col key={p.id} className="w-[20%]" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  className="sticky z-10 border-y border-[var(--wh-line)] bg-[var(--wh-ground)] px-4 py-3.5 font-medium"
                  style={{ top: STICKY_NAV_H }}
                >
                  {t(T.head)}
                </th>
                {plans.map((p) => (
                  <th
                    key={p.id}
                    style={{ top: STICKY_NAV_H }}
                    className={cn(
                      "sticky z-10 border-y border-[var(--wh-line)] px-4 py-3.5 font-medium",
                      p.featured
                        ? "bg-[var(--wh-soft)] text-[var(--wh-blue)]"
                        : "bg-[var(--wh-ground)]",
                    )}
                  >
                    {t(p.title)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ title, row }) => (
                <Fragment key={row.label.ru}>
                  {title && (
                    <tr className="border-b border-[var(--wh-line)]">
                      <th colSpan={plans.length + 1} className="px-4 pb-2.5 pt-6 font-medium">
                        {t(title)}
                      </th>
                    </tr>
                  )}
                  <tr className="border-b border-[var(--wh-line)]">
                    <th scope="row" className="wh-muted px-4 py-3.5 font-normal">
                      {t(row.label)}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-4 py-3.5",
                          plans[i]?.featured && "bg-[var(--wh-soft)]",
                          cell === YES && "text-[var(--wh-blue)]",
                          cell === NO && "wh-muted",
                        )}
                      >
                        {typeof cell === "string" ? cell : t(cell)}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
      <div className="mt-5 flex justify-center">
        <button
          ref={btn}
          type="button"
          aria-expanded={full}
          onClick={toggle}
          className="wh-btn wh-btn--soft"
        >
          {t(full ? T.hideAll : T.showAll)}
          <ChevronDown
            className={cn("size-4 transition-transform duration-300", full && "rotate-180")}
          />
        </button>
      </div>
    </>
  );
}
