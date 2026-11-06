import { parseHonestSignMock } from "@/lib/barcode";
import { planLabel, splitCode } from "@/lib/labelLayout";
import type { LabelTemplate } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { QrSvg } from "@/components/table/QrSvg";
import { Code128Svg } from "@/components/table/Code128Svg";

/**
 * Сама наклейка (п.6). Один компонент и на предпросмотр, и на печать: если бы
 * их было два, предпросмотр начал бы врать в тот же день, когда кто-то поправил
 * только одну из копий.
 *
 * Геометрия считается в `lib/labelLayout.ts` (там же правила, что и когда
 * скрывается). Здесь только вёрстка: код во всю короткую сторону, номер
 * крупно, мелкий префикс «UK-BOX», служебные строки разнесены по краям.
 *
 * Размеры — в миллиметрах, как на ленте.
 */

export type LabelKind = "box" | "pallet" | "custom";

const MM = (v: number) => `${v.toFixed(2)}mm`;

export function LabelCard({
  tpl,
  code,
  kind,
  warehouseName,
  /** Номер места в партии и её размер — элемент "seq". */
  index = 1,
  total = 1,
  /** Свои строки (стол упаковки: товар, заказ). Идут после названия склада. */
  lines = [],
  headline,
  className,
}: {
  tpl: LabelTemplate;
  code: string;
  kind: LabelKind;
  warehouseName: string;
  index?: number;
  total?: number;
  lines?: string[];
  /** Крупная подпись над номером: получатель на этикетке отправления. */
  headline?: string;
  className?: string;
}) {
  const t = useT();
  const has = (e: LabelTemplate["elements"][number]) => tpl.elements.includes(e);
  const { prefix, number } = splitCode(code);
  const plan = planLabel({
    widthMm: tpl.widthMm,
    heightMm: tpl.heightMm,
    layout: tpl.layout,
    codeType: tpl.codeType,
    elements: tpl.elements,
    digits: number.length,
    extraLines: lines.length,
    headline: !!headline,
  });
  const { show, horizontal } = plan;

  const title =
    kind === "box" ? t("labels.kind.box") : kind === "pallet" ? t("labels.kind.pallet") : "";
  const compact = Math.min(tpl.widthMm, tpl.heightMm) < 50;
  const info = [
    has("warehouse") ? warehouseName : null,
    ...lines,
    has("note") ? (tpl.note ?? null) : null,
    has("mark") ? `${t("labels.markPrefix")} ${markFor(code)}` : null,
  ]
    .filter((x): x is string => !!x)
    .slice(0, plan.infoCount);

  const small = { fontSize: MM(plan.smallMm) };
  const date = new Date().toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  const numberBlock = show.number && (
    <div className={cn("flex min-w-0 gap-[0.6mm]", horizontal ? "flex-col" : "items-start")}>
      {horizontal && prefix && (
        <span
          className="truncate font-mono leading-none text-neutral-600"
          style={{ fontSize: MM(plan.prefixMm) }}
        >
          {prefix}
        </span>
      )}
      <span
        className="min-w-0 flex-1 truncate font-mono font-bold leading-none tabular-nums"
        style={{ fontSize: MM(plan.numberMm) }}
      >
        {number}
      </span>
      {!horizontal && prefix && (
        <span
          className="shrink-0 font-mono leading-none text-neutral-500"
          style={{ fontSize: MM(plan.prefixMm), writingMode: "vertical-rl" }}
        >
          {prefix}
        </span>
      )}
    </div>
  );

  const header = show.header && (
    <div className="flex min-w-0 items-center gap-2" style={small}>
      {has("logo") && tpl.logoUrl && (
        <img
          src={tpl.logoUrl}
          alt=""
          className="shrink-0 object-contain"
          style={{ height: MM(plan.smallMm * 2) }}
        />
      )}
      {has("title") && title && <span className="truncate font-bold uppercase">{title}</span>}
    </div>
  );

  const infoBlock = info.length > 0 && (
    <div className="flex min-w-0 flex-col leading-tight" style={small}>
      {info.map((l, i) => (
        <span key={i} className="truncate font-mono">
          {l}
        </span>
      ))}
    </div>
  );

  const headlineBlock = show.headline && headline && (
    <span
      lang="ru"
      className="line-clamp-2 min-w-0 break-words font-bold leading-[1.1]"
      style={{ fontSize: MM(plan.smallMm * 1.6), hyphens: "auto" }}
    >
      {headline}
    </span>
  );

  const footer = show.footer && (
    <div
      className="flex min-w-0 flex-wrap items-end justify-between gap-x-1 gap-y-[0.3mm] leading-none"
      style={small}
    >
      {show.seq && (
        <span className="shrink-0 font-bold tabular-nums">
          {compact ? `${index}/${total}` : t("labels.seq", { n: index, total })}
        </span>
      )}
      {show.fragile && (
        <span
          className="shrink-0 border border-black font-bold uppercase"
          style={{ padding: `${MM(plan.smallMm * 0.15)} ${MM(plan.smallMm * 0.4)}` }}
        >
          {t("labels.fragile")}
        </span>
      )}
      {show.date && <span className="shrink-0 tabular-nums text-neutral-600">{date}</span>}
    </div>
  );

  return (
    <div
      className={cn(
        "print-label flex overflow-hidden border border-neutral-300 bg-white text-black",
        horizontal ? "flex-row" : "flex-col",
        className,
      )}
      style={{
        width: MM(tpl.widthMm),
        height: MM(tpl.heightMm),
        padding: MM(plan.padMm),
        gap: MM(plan.gapMm),
      }}
    >
      <div className="shrink-0" style={{ width: MM(plan.code.w), height: MM(plan.code.h) }}>
        {tpl.codeType === "qr" ? (
          <QrSvg code={code} fit showCode={false} quiet={2} />
        ) : (
          <Code128Svg code={code} fit />
        )}
      </div>
      {/* Остаток делится «по краям»: номер вверху, служебная строка внизу,
          а не всё в одну кучу посередине. */}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col justify-between"
        style={{ gap: MM(plan.smallMm * 0.5) }}
      >
        {header}
        {headlineBlock}
        {numberBlock}
        {infoBlock}
        {footer}
      </div>
    </div>
  );
}

/**
 * Мок-КИЗ по коду тары: детерминированный, чтобы ярлык не «плавал» между
 * предпросмотром и печатью. Настоящий код придёт из «Честного знака».
 */
function markFor(code: string): string {
  const scan = parseHonestSignMock(code);
  return `${scan.gtin}·${scan.serial}`;
}
