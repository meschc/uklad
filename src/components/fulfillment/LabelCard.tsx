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
  const has = (e: LabelTemplate["elements"][number]) => e === "title" || tpl.elements.includes(e);
  const { prefix, number } = splitCode(code);
  const title =
    kind === "box" ? t("labels.kind.box") : kind === "pallet" ? t("labels.kind.pallet") : "";
  const infoAll = [
    has("warehouse") ? warehouseName : null,
    ...lines,
    has("note") ? (tpl.note ?? null) : null,
    has("mark") ? `${t("labels.markPrefix")} ${markFor(code)}` : null,
  ].filter((x): x is string => !!x);
  const plan = planLabel({
    widthMm: tpl.widthMm,
    heightMm: tpl.heightMm,
    layout: tpl.layout,
    codeType: tpl.codeType,
    elements: tpl.elements,
    digits: number.length,
    extraLines: lines.length,
    headline: !!headline,
    headlineWord: headline ? Math.max(...headline.split(/\s+/).map((w) => w.length)) : 0,
    headlineLen: headline?.length ?? 0,
    infoMaxLen: Math.max(0, ...infoAll.map((l) => l.length)),
  });
  const { show, horizontal } = plan;

  const info = infoAll.slice(0, plan.infoCount);

  const small = { fontSize: MM(plan.smallMm) };

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
        className="min-w-0 flex-1 whitespace-nowrap font-mono font-bold leading-none tabular-nums"
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
    <div className="flex min-w-0 flex-col leading-tight" style={{ fontSize: MM(plan.infoMm) }}>
      {info.map((l, i) => (
        <span key={i} className="whitespace-nowrap font-mono">
          {l}
        </span>
      ))}
    </div>
  );

  const headlineBlock = show.headline && headline && (
    <span
      className="min-w-0 font-bold leading-[1.1]"
      style={{ fontSize: MM(plan.headlineMm), textWrap: "balance" }}
    >
      {headline}
    </span>
  );

  // Нижняя строка по макету Кирилла: три колонки, серое — служебное.
  const [dm, yr] = [
    new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
    String(new Date().getFullYear()),
  ];
  const footer = show.footer && (
    <div
      className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-end gap-x-1 leading-none"
      style={small}
    >
      <span className="justify-self-start whitespace-nowrap tabular-nums text-neutral-500">
        {show.seq && (
          <>
            <sup className="align-[0.4em] text-[0.85em]">{index}</sup>
            <span className="text-[1.1em]">/</span>
            {total}
          </>
        )}
      </span>
      <span className="justify-self-center">
        {show.fragile && (
          <span
            className="flex items-center gap-[0.5mm] whitespace-nowrap border border-black uppercase"
            style={{ padding: `${MM(plan.smallMm * 0.12)} ${MM(plan.smallMm * 0.3)}` }}
          >
            <span className="text-[0.75em]">⇈</span>
            {t("labels.fragile")}
            <span className="text-[0.75em]">⇈</span>
          </span>
        )}
      </span>
      <span className="justify-self-end text-right tabular-nums leading-[1.05] text-neutral-500">
        {show.date && (
          <>
            {dm}
            <br />
            {yr}
          </>
        )}
      </span>
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
          <QrSvg code={code} fit showCode={false} quiet={0} />
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
