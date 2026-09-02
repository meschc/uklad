import { RotateCcw } from "lucide-react";
import { EMPTY_VOLUME, isVolumeSet, type SellerVolume } from "../../lib/estimate";

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
 */

interface Field {
  key: keyof SellerVolume;
  label: string;
  unit: string;
  placeholder: string;
}

const FIELDS: Field[] = [
  { key: "places", label: "Мест хранения", unit: "паллето-мест", placeholder: "120" },
  { key: "boxes", label: "Приёмка", unit: "коробов в месяц", placeholder: "40" },
  { key: "orders", label: "Сборка", unit: "заказов в месяц", placeholder: "900" },
  { key: "marking", label: "Маркировка", unit: "единиц в месяц", placeholder: "0" },
];

/** Пустое поле, минус, буквы — всё это ноль, а не `NaN` в расчёте. */
function toNumber(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function VolumeBar({
  value,
  onChange,
}: {
  value: SellerVolume;
  onChange: (next: SellerVolume) => void;
}) {
  const filled = isVolumeSet(value);

  return (
    // Панель названа своим заголовком: на витрине две кнопки «Сбросить» —
    // здесь и в колонке фильтров, — и без имени области непонятно, какую из
    // них читает голос и какую нажимает тест. Названный `section` становится
    // отдельной областью страницы, по которой можно перемещаться.
    <section
      aria-labelledby="volume-title"
      className="r-window border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="volume-title" className="font-display text-[15px] font-medium tracking-tight">
            Ваш объём
          </h2>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
            Впишите оборот — и в каждой карточке появится месяц по прайсу этого
            склада. Оценка приблизительная: считаем умножением по прайсу, без
            габаритов и сезона.
          </p>
        </div>
        {filled && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_VOLUME)}
            className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            Сбросить
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label
              htmlFor={`volume-${f.key}`}
              className="block text-[11px] uppercase tracking-wide text-muted-foreground"
            >
              {f.label}
            </label>
            <input
              id={`volume-${f.key}`}
              // Не type="number": колесо мыши над таким полем меняет число, и
              // селлер, прокручивая витрину, незаметно правит свой же расчёт.
              // Клавиатуру телефона поднимает inputMode.
              type="text"
              inputMode="numeric"
              value={value[f.key] || ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ ...value, [f.key]: toNumber(e.target.value) })}
              className="mt-1.5 h-10 w-full rounded-full border border-border bg-background px-3.5 text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
            />
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{f.unit}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
