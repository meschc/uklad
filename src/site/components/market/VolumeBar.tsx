import { Equal, RotateCcw } from "lucide-react";
import { VolumeFields } from "./VolumeFields";
import { money } from "../../data/warehouses";
import {
  EMPTY_VOLUME,
  isVolumeSet,
  type EstimateRange,
  type SellerVolume,
} from "../../lib/estimate";
import { c, useT } from "../../lib/copy";

/**
 * Объём селлера — четыре числа, которые превращают витрину в сравнение.
 *
 * Без них карточки показывают прайс, а прайсы фулфилмента несопоставимы: у
 * одного склада дешевле хранение, у другого сборка, и кто из них дешевле
 * вообще — вопрос без ответа. С ними в каждой карточке появляется одна
 * величина, одинаково посчитанная для всех: месяц под этот оборот.
 *
 * Спрашиваем ровно то, что селлер знает про себя наизусть, и ничего сверх:
 * сколько мест занимает товар, сколько коробов приезжает, сколько заказов
 * уходит, сколько единиц маркируется. Габариты, режим хранения, сезонность и
 * возвраты в расчёт не берём — не потому, что они не важны, а потому, что
 * спросить их у человека на витрине нельзя, а придумать за него значит выдать
 * выдумку за оценку.
 *
 * Ничего не сохраняется между визитами. Числа оборота — сведения о бизнесе, и
 * складывать их в браузер без спроса мы не будем; баннер cookie на такое
 * согласия не давал.
 *
 * Панель нарочно не похожа на отбор, хотя стоит с ним на одном экране. Раньше
 * похожа была — та же плита карточки, та же рамка, та же кнопка «Сбросить», —
 * и люди читали её как ещё одно условие: вписывали числа, смотрели на счётчик
 * найденного, счётчик не двигался, и панель считалась сломанной. Подписи под
 * заголовком не хватило, потому что спорила с ней не подпись, а вид.
 *
 * Разведено тремя способами сразу. Другой материал: у карточек и колонки
 * отбора — плита `bg-card` с рамкой, здесь — заливка `bg-muted` без рамки, то
 * есть поверхность другого рода, а не ещё одна карточка в ряду. Другое слово:
 * отбор сбрасывают, числа очищают. И главное — свой ответ: заполненная панель
 * тут же показывает вилку месяца по нынешней выдаче. Ввод, который сразу даёт
 * ответ, ни с каким ситом не путается.
 *
 * Сами поля — общие с заявкой складу (`VolumeFields`): спроси их там иначе, и
 * селлер сравнит склады по одному объёму, а склад ответит по другому.
 */

const T = {
  title: c("Ваш объём", "Your volume"),
  lead: c(
    "Впишите оборот — и в карточках появится месяц по прайсу склада. Оценка грубая: умножение по прайсу, без габаритов и сезона.",
    "Enter your volume and each card will show a month at that warehouse's rates. A rough estimate: plain arithmetic, no dimensions or seasonality.",
  ),
  reset: c("Очистить", "Clear"),
  month: c("Месяц под этот объём", "A month at this volume"),
  spread: c("от {min} до {max} ₽", "{min} to {max} ₽"),
  flat: c("{min} ₽", "{min} ₽"),
  across: c("по {n}", "across {n}"),
  none: c(
    "Такой объём не берёт ни один склад из списка — в карточках написано почему.",
    "No warehouse in the list can take this volume — each card says why.",
  ),
};

export function VolumeBar({
  value,
  range,
  onChange,
}: {
  value: SellerVolume;
  /** Вилка месяца по нынешней выдаче; `null` — объём не задан или никто не берёт. */
  range: EstimateRange | null;
  onChange: (next: SellerVolume) => void;
}) {
  const t = useT();
  const filled = isVolumeSet(value);

  return (
    // Панель названа своим заголовком: без имени области непонятно, какую из
    // кнопок читает голос и какую нажимает тест, — а рядом, в колонке отбора,
    // стоит своя. Названный `section` становится отдельной областью страницы,
    // по которой можно перемещаться.
    <section aria-labelledby="volume-title" className="r-window bg-muted p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="volume-title" className="font-display text-[15px] font-medium tracking-tight">
            {t(T.title)}
          </h2>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
            {t(T.lead)}
          </p>
        </div>
        {filled && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_VOLUME)}
            className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            {t(T.reset)}
          </button>
        )}
      </div>

      <VolumeFields
        idPrefix="volume"
        value={value}
        onChange={onChange}
        className="mt-4 grid-cols-2 sm:grid-cols-4"
      />

      {filled && <Answer range={range} />}
    </section>
  );
}

/**
 * Ответ панели — вилка месяца по нынешней выдаче.
 *
 * Появляется ровно тогда, когда в полях что-то есть, и меняется на каждое
 * число: это и есть доказательство, что панель считает. Знак равенства перед
 * ним — не украшение, а единственное место на витрине, где он стоит: у отбора
 * ответ снаружи, в списке, у счёта — здесь же, в строке.
 */
function Answer({ range }: { range: EstimateRange | null }) {
  const t = useT();

  if (!range) {
    return (
      <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
        {t(T.none)}
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-border pt-3">
      <Equal className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
      <span className="text-[12px] text-muted-foreground">{t(T.month)}</span>
      <span className="font-display text-lg font-medium tabular-nums tracking-tight">
        {range.min === range.max
          ? t(T.flat, { min: money(range.min) })
          : t(T.spread, { min: money(range.min), max: money(range.max) })}
      </span>
      <span className="text-[12px] text-muted-foreground">
        {t(T.across, { n: range.count })}{" "}
        {t.plural(range.count, ["складу", "складам", "складам"], ["warehouse", "warehouses"])}
      </span>
    </div>
  );
}
