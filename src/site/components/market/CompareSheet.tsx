import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RequestForm } from "./RequestForm";
import { money, type Warehouse } from "../../data/warehouses";
import { bestIndexes, compareRows, type CompareRow } from "../../lib/compare";
import { isVolumeSet, type SellerVolume } from "../../lib/estimate";
import { warehouseHref } from "../../lib/route";
import { c, useT } from "../../lib/copy";
import { useOverlay } from "../../lib/useOverlay";

const T = {
  title: c("Сравнение складов", "Warehouse comparison"),
  close: c("Закрыть", "Close"),
  remove: c("Убрать из сравнения: {name}", "Remove from comparison: {name}"),
  best: c("лучшее в строке", "best in the row"),
  noVolume: c(
    "Впишите объём в панели над списком — в таблице появится первой строкой месяц по прайсу каждого склада.",
    "Enter your volume in the panel above the list — the table will then open with a month at each warehouse’s rates.",
  ),
  dash: c(
    "Прочерк в строке месяца — склад такой объём не возьмёт: у него либо не хватает мест, либо выше порог входа.",
    "A dash in the month row means the warehouse will not take that volume: too few slots, or its minimum is higher.",
  ),
  requestTitle: c("Заявка сразу во все отмеченные", "One request to every marked warehouse"),
  requestNote: c(
    "Каждый склад отвечает сам и видит только вашу заявку, а не то, с кем вы его сравнивали. Заявка бесплатна и ни к чему не обязывает: условия и договор — следующим шагом.",
    "Each warehouse replies on its own and sees only your request, not who you compared it with. The request is free and commits you to nothing: terms and contract come next.",
  ),
  send: c("Отправить заявку в {n} {word}", "Send the request to {n} {word}"),
  // Пока приёмник заявок не настроен, кнопка открывает письмо — и число
  // складов обязано остаться на ней: охват действия человек должен видеть в
  // момент нажатия, а не вспоминать по колонкам таблицы.
  mailSend: c("Написать письмо в {n} {word}", "Write to {n} {word}"),
  requestSubject: c("Заявка в {n} {word}: {names}", "Request to {n} {word}: {names}"),
};

/**
 * Таблица сравнения отмеченных складов.
 *
 * Слоем поверх каталога, а не отдельной страницей. Сравнение — это шаг внутри
 * отбора, а не место, куда уходят: из таблицы половина возвращается доотмечать
 * склады, и адрес, который надо закрывать кнопкой «назад», ломал бы именно это
 * движение. Отсюда же и вычёркивание прямо из шапки колонки.
 *
 * Что в таблице сравнивается — решает `lib/compare`: только числа с понятным
 * направлением. Площадки, схемы работы и отметка проверки в строки не
 * превращаются, потому что «лучше» для них не определено.
 */
export function CompareSheet({
  list,
  volume,
  onRemove,
  onClose,
}: {
  /** Отмеченные склады в порядке отметки; порядок задаёт колонки. */
  list: Warehouse[];
  volume: SellerVolume;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();

  useOverlay(true, onClose);

  const rows = compareRows(list, volume);
  const monthRow = rows.find((r) => r.key === "month");
  const hasDash = monthRow?.values.some((v) => v === null) ?? false;

  // Число складов стоит и на кнопке, и в теме письма — согласование считается
  // один раз, чтобы два места не разошлись падежом.
  const count = {
    n: list.length,
    word: t.plural(list.length, ["склад", "склада", "складов"], ["warehouse", "warehouses"]),
  };

  return (
    <div data-print="hide" className="fixed inset-0 z-[90] flex flex-col">
      {/* Затемнение — фон, а не элемент управления: для читалки оно скрыто, а
          закрыть слой с клавиатуры дают Escape (useOverlay) и крестик. */}
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        className="relative mx-auto mt-auto flex max-h-[92vh] w-full max-w-[1100px] animate-slide-up flex-col border-t border-border bg-background sm:my-auto sm:max-h-[88vh] sm:border"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
          <h2 id="compare-title" className="font-display text-base font-medium">
            {t(T.title)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(T.close)}
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Таблица уезжает вбок внутри своей рамки, а не тянет за собой
              страницу: четыре колонки в 375 точек не влезают ни при каком
              наборе шрифта, и выбор здесь между внутренней прокруткой и
              горизонтальной прокруткой всего сайта. */}
          <div className="overflow-x-auto">
            <CompareTable list={list} rows={rows} onRemove={onRemove} />
          </div>

          <div className="space-y-1.5 px-4 pt-4 text-[12px] leading-relaxed text-muted-foreground sm:px-6">
            {!isVolumeSet(volume) && <p>{t(T.noVolume)}</p>}
            {hasDash && <p>{t(T.dash)}</p>}
          </div>

          <div className="px-4 py-6 sm:px-6">
            {/* Объём в заявку приходит из расчёта над списком: человек уже
                назвал его один раз, и спрашивать то же самое второй раз значит
                напрашиваться на расхождение — сравнивал по одним числам,
                заявку отправил с другими. */}
            <RequestForm
              title={t(T.requestTitle)}
              note={t(T.requestNote)}
              submit={t(T.send, count)}
              mailSubmit={t(T.mailSend, count)}
              subject={t(T.requestSubject, {
                ...count,
                names: list.map((w) => t(w.name)).join(", "),
              })}
              initialVolume={volume}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Сама таблица.
 *
 * `border-separate`, а не `border-collapse`: липкие шапка и первая колонка при
 * схлопнутых границах теряют свои линии — браузер рисует их на общей сетке,
 * которая уезжает вместе с прокруткой. Разделённые границы остаются на клетках
 * и едут вместе с ними.
 */
function CompareTable({
  list,
  rows,
  onRemove,
}: {
  list: Warehouse[];
  rows: CompareRow[];
  onRemove: (id: string) => void;
}) {
  const t = useT();

  return (
    <table className="w-full border-separate border-spacing-0 text-left text-sm">
      <thead>
        <tr>
          {/* Угол таблицы: липнет к обеим осям, иначе на пересечении
              прокруток из-под него видно уезжающие клетки. */}
          <th
            scope="col"
            className="sticky left-0 top-0 z-20 min-w-[9.5rem] border-b border-border bg-background p-0"
          >
            <span className="sr-only">{t(T.title)}</span>
          </th>
          {list.map((w) => (
            <th
              key={w.id}
              scope="col"
              className="sticky top-0 z-10 min-w-[11rem] border-b border-l border-border bg-background px-3 py-3 align-top font-normal"
            >
              <div className="flex items-start justify-between gap-2">
                <a
                  href={warehouseHref(w.id)}
                  className="min-w-0 flex-1 font-display text-[13px] font-medium leading-snug hover:text-primary"
                >
                  {t(w.name)}
                </a>
                <button
                  type="button"
                  onClick={() => onRemove(w.id)}
                  aria-label={t(T.remove, { name: t(w.name) })}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t(w.cityTitle)}</p>
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {rows.map((row) => {
          const best = bestIndexes(row);
          return (
            <tr key={row.key} className="even:bg-muted/30">
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-border bg-inherit px-4 py-2.5 align-top font-normal sm:px-6"
              >
                <span className="text-[13px] font-medium">{t(row.label)}</span>
                {row.unit && (
                  <span className="ml-1 text-[11px] text-muted-foreground">{t(row.unit)}</span>
                )}
              </th>
              {row.values.map((value, i) => (
                <td
                  key={list[i].id}
                  className={cn(
                    "border-b border-l border-border px-3 py-2.5 tabular-nums",
                    best.includes(i) ? "font-medium text-primary" : "text-foreground",
                  )}
                >
                  {value === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      {cell(value, row.digits)}
                      {/* Цветом одним обойтись нельзя: лучшее в строке должно
                          быть слышно и тому, кто читает страницу голосом. */}
                      {best.includes(i) && <span className="sr-only"> — {t(T.best)}</span>}
                    </>
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Число в клетке: рейтинг — с десятой, всё остальное — с разрядами. */
function cell(value: number, digits?: number): string {
  return digits ? value.toFixed(digits) : money(value);
}
