import { cn } from "@/lib/utils";
import { useT } from "../../lib/copy";
import { VOLUME_FIELDS } from "../../lib/volume";
import type { SellerVolume } from "../../lib/estimate";

/**
 * Четыре числа оборота — одни и те же в расчёте и в заявке.
 *
 * Одним набором они живут не ради красоты разбиения. Расчёт на витрине и
 * заявка складу спрашивают объём дважды, и стоит им спросить его по-разному —
 * одному «мест хранения», другому «сколько паллет», — как селлер сравнивает
 * склады по одному числу, а склад отвечает по другому. Разойдутся они молча:
 * оба уверены, что говорят об одном. Общий набор полей эту развилку убирает в
 * принципе, а не проверкой на ревью. Сами подписи — в `lib/volume`: их читает
 * ещё и письмо заявки.
 *
 * Собственных идентификаторов у полей нет: на витрине панель расчёта и заявка
 * из сравнения живут на одной странице, а два поля с одним `id` ломают связь
 * подписи с полем — и голос читает подпись не тому полю.
 */

/** Пустое поле, минус, буквы — всё это ноль, а не `NaN` в расчёте. */
function toNumber(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function VolumeFields({
  value,
  onChange,
  idPrefix,
  className,
}: {
  value: SellerVolume;
  onChange: (next: SellerVolume) => void;
  /** Начало `id` полей — своё у каждого места, где стоит этот набор. */
  idPrefix: string;
  /** Раскладка сетки задаётся снаружи: в колонке заявки места вдвое меньше. */
  className?: string;
}) {
  const t = useT();

  return (
    <div className={cn("grid gap-3", className)}>
      {VOLUME_FIELDS.map((f) => (
        <div key={f.key}>
          <label
            htmlFor={`${idPrefix}-${f.key}`}
            className="block text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            {t(f.label)}
          </label>
          <input
            id={`${idPrefix}-${f.key}`}
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
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{t(f.unit)}</p>
        </div>
      ))}
    </div>
  );
}
