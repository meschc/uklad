import { useState } from "react";
import type { WarehouseClass } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";

/**
 * Кирпичики паспорта склада (п.1). Вынесены из экрана: экран отвечает за то,
 * какие данные и в каком порядке, а эти — за то, как выглядит одно значение.
 *
 * Главный приём — «поле, притворяющееся значением»: в покое это просто текст
 * или цифра, под курсором проступает рамка, по клику становится полем ввода.
 * Так карточка читается как справка, а не как анкета, но правится по-прежнему
 * на месте, без режима редактирования всего экрана.
 *
 * Второй приём — разные типы значений выглядят по-разному: цифра крупная и
 * табличная, перечисление — чипами, «да/нет» — бейджем. Ровный столбец
 * одинаковых строк не давал глазу зацепиться (см. рефы: карточки-факты в
 * TransGlobal, чипы-статусы, кольцевая шкала занятости в Mezzanines).
 */

/** Общий вид поля-невидимки: значение до клика, поле — после. */
const GHOST =
  "w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 outline-none transition-colors hover:border-border hover:bg-muted/50 focus:border-input focus:bg-background";

// --- Каркас -------------------------------------------------------------------

/** Секция паспорта: иконка, заголовок, содержимое. */
export function SpecCard({
  icon,
  title,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(card({ className: "flex flex-col gap-3" }), className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Сетка факт-плиток внутри секции. */
export function TileGrid({ cols = 2, children }: { cols?: 2 | 3; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-2", cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
      {children}
    </div>
  );
}

/**
 * Факт-плитка: подпись сверху мелким, значение снизу крупным, на мягкой
 * подложке. `wide` растягивает на всю строку — для длинных текстов.
 */
export function Tile({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/40 px-2.5 py-2",
        wide && "col-span-full",
      )}
    >
      <span className={eyebrow({ size: "xs", weight: "medium" })}>{label}</span>
      {children}
    </div>
  );
}

// --- Значения -----------------------------------------------------------------

/** Крупное число с единицей измерения. Единица — подпись, а не часть значения. */
export function StatValue({
  value,
  unit,
  readOnly,
  onCommit,
}: {
  value?: number;
  unit?: string;
  readOnly: boolean;
  onCommit: (v: number | undefined) => void;
}) {
  const t = useT();
  const [v, setV] = useState(value != null ? String(value) : "");

  if (readOnly) {
    return (
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-lg font-semibold leading-tight tabular-nums",
            value == null && "text-muted-foreground",
          )}
        >
          {value ?? "—"}
        </span>
        {value != null && unit && <span className="text-[11px] text-muted-foreground">{unit}</span>}
      </span>
    );
  }

  return (
    <span className="flex items-baseline gap-1">
      <input
        value={v}
        inputMode="decimal"
        placeholder={t("spec.notSet")}
        onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))}
        onBlur={() => onCommit(v.trim() ? Number(v) : undefined)}
        className={cn(GHOST, "text-lg font-semibold leading-tight tabular-nums")}
      />
      {unit && <span className="shrink-0 text-[11px] text-muted-foreground">{unit}</span>}
    </span>
  );
}

/** Строка текста: справка в покое, поле — по клику. */
export function TextValue({
  value,
  readOnly,
  placeholder,
  onCommit,
}: {
  value?: string;
  readOnly: boolean;
  placeholder?: string;
  onCommit: (v: string | undefined) => void;
}) {
  const [v, setV] = useState(value ?? "");

  if (readOnly) {
    return (
      <span className={cn("text-[13px] leading-snug", !value && "text-muted-foreground")}>
        {value || "—"}
      </span>
    );
  }

  // Характеристики склада — это фразы, а не слова: «4 дока с доклевеллерами,
  // 1 ворота с уровня земли» в однострочном поле обрезается на середине, и
  // проверить введённое нельзя. Высоту подбираем по длине текста.
  const rows = Math.min(4, Math.max(1, Math.ceil((v.length || 1) / 44)));

  return (
    <textarea
      value={v}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v.trim() || undefined)}
      onKeyDown={(e) => {
        // Enter сохраняет, а не переносит строку: перенос в характеристике
        // склада не нужен, а привычка «Enter = готово» есть у всех.
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className={cn(GHOST, "resize-none text-[13px] leading-snug")}
    />
  );
}

/**
 * Перечисление через запятую — чипами. Список из шести услуг сплошной строкой
 * читается как абзац; чипами видно, что это набор, и сколько в нём пунктов.
 *
 * В режиме правки чипы остаются чипами, пока по ним не кликнули: показывать
 * одновременно строку ввода и её же разбор — значит писать одно и то же дважды
 * и растить карточку вдвое.
 */
export function ChipsValue({
  value,
  readOnly,
  placeholder,
  onCommit,
}: {
  value?: string;
  readOnly: boolean;
  placeholder?: string;
  onCommit: (v: string | undefined) => void;
}) {
  const [v, setV] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const chips = splitChips(v);

  if (!readOnly && editing) {
    return (
      <textarea
        value={v}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- поле раскрыто по клику на значение: фокус обязан уйти в него
        autoFocus
        rows={Math.min(4, Math.max(1, Math.ceil((v.length || 1) / 44)))}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onCommit(v.trim() || undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className={cn(GHOST, "resize-none text-[13px] leading-snug")}
      />
    );
  }

  const list = (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className="rounded-md bg-background px-1.5 py-0.5 text-[11px] leading-tight text-foreground ring-1 ring-border"
        >
          {c}
        </span>
      ))}
    </div>
  );

  if (readOnly)
    return chips.length ? list : <span className="text-[13px] text-muted-foreground">—</span>;

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full rounded-md border border-transparent px-1.5 py-0.5 text-left transition-colors hover:border-border hover:bg-muted/50"
    >
      {chips.length ? (
        list
      ) : (
        <span className="text-[13px] text-muted-foreground">{placeholder ?? "—"}</span>
      )}
    </button>
  );
}

/**
 * Разбить перечисление на пункты: запятая или точка с запятой. Запятую МЕЖДУ
 * цифрами не трогаем — в русском это десятичный разделитель, и «лифт 1,5 т»
 * иначе распадался бы на «лифт 1» и «5 т».
 */
function splitChips(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/(?<!\d)[;,]|[;,](?!\d)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Диапазон «от — до»: температура и влажность живут парой. */
export function RangeValue({
  from,
  to,
  unit,
  readOnly,
  onCommit,
}: {
  from?: number;
  to?: number;
  unit: string;
  readOnly: boolean;
  onCommit: (a: number | undefined, b: number | undefined) => void;
}) {
  const [a, setA] = useState(from != null ? String(from) : "");
  const [b, setB] = useState(to != null ? String(to) : "");
  const commit = () => onCommit(a.trim() ? Number(a) : undefined, b.trim() ? Number(b) : undefined);

  if (readOnly) {
    const empty = from == null && to == null;
    return (
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-lg font-semibold leading-tight tabular-nums",
            empty && "text-muted-foreground",
          )}
        >
          {empty ? "—" : `${from ?? "—"}…${to ?? "—"}`}
        </span>
        {!empty && <span className="text-[11px] text-muted-foreground">{unit}</span>}
      </span>
    );
  }

  const field = (val: string, set: (s: string) => void): React.ReactNode => (
    <input
      value={val}
      inputMode="decimal"
      onChange={(e) => set(e.target.value.replace(/[^\d.-]/g, ""))}
      onBlur={commit}
      className={cn(GHOST, "w-12 text-center text-lg font-semibold leading-tight tabular-nums")}
    />
  );

  return (
    <span className="flex items-baseline gap-0.5">
      {field(a, setA)}
      <span className="shrink-0 text-muted-foreground">…</span>
      {field(b, setB)}
      <span className="shrink-0 text-[11px] text-muted-foreground">{unit}</span>
    </span>
  );
}

/**
 * Да / нет бейджем. Отдельный вид, потому что «нет» и «не заполнено» на складе
 * означают разное: у ангара нет ж/д ветки, а у нового объекта её просто ещё не
 * вписали.
 */
export function BoolValue({
  value,
  readOnly,
  onChange,
}: {
  value?: boolean;
  readOnly: boolean;
  onChange: (v: boolean | undefined) => void;
}) {
  const t = useT();
  const tone = value
    ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400"
    : value === false
      ? "bg-muted text-muted-foreground ring-border"
      : "bg-transparent text-muted-foreground ring-border";
  const label = value == null ? "—" : t(value ? "common.yes" : "common.no");

  if (readOnly) {
    return (
      <span className={cn("w-fit rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1", tone)}>
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "w-fit rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 transition-colors hover:brightness-110",
        tone,
      )}
    >
      {label}
    </button>
  );
}

/**
 * Выбор из короткого закрытого списка (класс склада, категория пожарной
 * опасности).
 *
 * Обобщён по типу варианта, а не прибит к `string`: список у каждого вызова
 * свой и всегда узкий — `WarehouseClass`, `FireCategory`. Из-за этого `value`
 * и `onChange` говорят на языке склада, а не «любая строка»: приведения типа
 * на стороне вызова больше не нужны, и `labelFor` получает тот же узкий тип —
 * а он нужен, чтобы ключ вида `spec.fire.${c}` собрался в настоящий ключ
 * словаря, а не в «`spec.fire.` плюс что угодно».
 */
export function ChoiceValue<T extends string>({
  value,
  options,
  labelFor,
  readOnly,
  onChange,
}: {
  value?: T;
  options: readonly T[];
  labelFor?: (o: T) => string;
  readOnly: boolean;
  onChange: (v: T | undefined) => void;
}) {
  const text = value ? (labelFor?.(value) ?? value) : undefined;
  if (readOnly)
    return (
      <span className={cn("text-[13px] leading-snug", !text && "text-muted-foreground")}>
        {text || "—"}
      </span>
    );

  return (
    <select
      value={value ?? ""}
      // Приведение неизбежно: у `<select>` значение всегда строка, сузить его
      // до варианта из списка может только сам список — а он здесь и есть.
      onChange={(e) => onChange((e.target.value as T) || undefined)}
      className={cn(GHOST, "w-fit cursor-pointer text-[13px] leading-snug")}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {labelFor?.(o) ?? o}
        </option>
      ))}
    </select>
  );
}

// --- Крупные элементы шапки ----------------------------------------------------

const CLASS_TONE: Record<WarehouseClass, string> = {
  "A+": "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  A: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  "B+": "bg-primary/15 text-primary ring-primary/30",
  B: "bg-primary/15 text-primary ring-primary/30",
  C: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  D: "bg-destructive/15 text-destructive ring-destructive/30",
};

/** Класс склада крупной плашкой: первое, что спрашивают про объект. */
export function ClassBadge({ value }: { value?: WarehouseClass }) {
  const t = useT();
  return (
    <div
      className={cn(
        "flex size-16 shrink-0 flex-col items-center justify-center rounded-xl ring-1",
        value ? CLASS_TONE[value] : "bg-muted text-muted-foreground ring-border",
      )}
    >
      <span className="text-2xl font-bold leading-none tracking-tight">{value ?? "—"}</span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wide opacity-80">
        {t("spec.classShort")}
      </span>
    </div>
  );
}

/**
 * Кольцо полноты паспорта. Не украшение: по нему видно, что у объекта половина
 * характеристик не заполнена, — а это ровно тот случай, когда складу нельзя
 * доверять расчёт на глаз.
 */
export function CompletenessRing({ filled, total }: { filled: number; total: number }) {
  const t = useT();
  const share = total ? filled / total : 0;
  const r = 22;
  const len = 2 * Math.PI * r;
  const tone = share > 0.85 ? "text-emerald-500" : share > 0.6 ? "text-primary" : "text-amber-500";

  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <div className="relative size-14">
        <svg viewBox="0 0 56 56" className="size-full -rotate-90">
          <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${len * share} ${len}`}
            className={cn("stroke-current transition-all", tone)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">
          {Math.round(share * 100)}%
        </span>
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] font-medium">{t("spec.completeness")}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {t("spec.filledOf", { n: filled, total })}
        </span>
      </div>
    </div>
  );
}
