import { parseHonestSignMock } from "@/lib/barcode";
import type { LabelElement, LabelTemplate } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { clamp, cn } from "@/lib/utils";
import { QrSvg } from "@/components/table/QrSvg";
import { Code128Svg } from "@/components/table/Code128Svg";

/**
 * Сама наклейка (п.6). Один компонент и на предпросмотр, и на печать: если бы
 * их было два, предпросмотр начал бы врать в тот же день, когда кто-то поправил
 * только одну из копий.
 *
 * Раскладка — по логистической этикетке GS1, три блока подряд:
 *
 *   1. информация  — знак компании, что за место, склад, обработка («Хрупкое»);
 *   2. интерпретация — то же, что в коде, но человеческими глазами: номер
 *      места в партии, КИЗ, дата;
 *   3. код — QR или Code128, внизу (вертикально) или слева (горизонтально).
 *
 * Порядок не декоративный: кладовщик читает сверху вниз, сканер целится в
 * нижний край, а «Место 3 из 12» — то, по чему на приёмке считают, вся ли
 * партия доехала.
 *
 * Размеры — в миллиметрах, как на ленте. Кегль привязан к КОРОТКОЙ стороне:
 * на ленте 43×25 те же 10 px были бы простынёй, а на 100×150 — муравьями.
 *
 * Место под код задаётся долей (`codeScale`), но текст забирает своё первым:
 * блок кода умеет сжиматься (`flex: 0 1 …`), поэтому даже на 100 % ничего не
 * выдавливается за край наклейки.
 */

export type LabelKind = "box" | "pallet";

const MM = (v: number) => `${v}mm`;

export function LabelCard({
  tpl,
  code,
  kind,
  warehouseName,
  /** Номер места в партии и её размер — элемент "seq". */
  index = 1,
  total = 1,
  className,
}: {
  tpl: LabelTemplate;
  code: string;
  kind: LabelKind;
  warehouseName: string;
  index?: number;
  total?: number;
  className?: string;
}) {
  const t = useT();
  const has = (e: LabelElement) => tpl.elements.includes(e);
  const horizontal = tpl.layout === "horizontal";

  // Кегль от короткой стороны: 40 мм принято за единицу (лента 58×40).
  const minSide = Math.min(tpl.widthMm, tpl.heightMm);
  const f = clamp(minSide / 40, 0.7, 1.8);
  const px = (n: number) => `${(n * f).toFixed(1)}px`;
  const pad = `${(minSide * 0.05).toFixed(1)}mm`;

  const title = kind === "box" ? t("labels.kind.box") : t("labels.kind.pallet");
  const showHeader = has("logo") || has("title") || has("fragile");

  // Склад и дата — одной строкой через точку: две отдельные строки на ленте
  // 58 мм съедали высоту, ничего не добавляя.
  const meta = [
    has("warehouse") ? warehouseName : null,
    has("date") ? new Date().toLocaleDateString() : null,
  ].filter(Boolean);

  const info = (
    <>
      {showHeader && (
        <div
          className="flex w-full shrink-0 items-center gap-1"
          style={{ fontSize: px(8) }}
        >
          {has("logo") && tpl.logoUrl && (
            <img
              src={tpl.logoUrl}
              alt=""
              className="shrink-0 object-contain"
              style={{ height: px(11), maxWidth: "40%" }}
            />
          )}
          {has("title") && (
            <span className="min-w-0 flex-1 truncate font-bold uppercase leading-none tracking-wide">
              {title}
            </span>
          )}
          {has("fragile") && (
            <span
              className="ml-auto shrink-0 rounded-sm border border-black font-bold uppercase leading-none"
              style={{ padding: `${px(2)} ${px(3)}` }}
            >
              {t("labels.fragile")}
            </span>
          )}
        </div>
      )}

      {(has("seq") || meta.length > 0 || has("mark") || has("note")) && (
        <div className="flex w-full shrink-0 flex-col leading-tight">
          {has("seq") && (
            <span className="font-bold tabular-nums" style={{ fontSize: px(9) }}>
              {t("labels.seq", { n: index, total })}
            </span>
          )}
          {meta.length > 0 && (
            <span className="truncate" style={{ fontSize: px(7) }}>
              {meta.join(" · ")}
            </span>
          )}
          {has("note") && tpl.note && (
            <span className="truncate font-medium" style={{ fontSize: px(7) }}>
              {tpl.note}
            </span>
          )}
          {has("mark") && (
            <span
              className="break-all font-mono leading-tight"
              style={{ fontSize: px(5.5) }}
            >
              {t("labels.markPrefix")} {markFor(code)}
            </span>
          )}
        </div>
      )}
    </>
  );

  const codeBlock = (
    <div
      className="flex min-h-0 min-w-0 flex-col items-center justify-center"
      // Доля своя, но сжаться блок обязан: текст выше по приоритету.
      style={{ flex: `0 1 ${tpl.codeScale * 100}%` }}
    >
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        {tpl.codeType === "qr" ? (
          <QrSvg code={code} fit showCode={false} />
        ) : (
          <Code128Svg code={code} fit />
        )}
      </div>
      {has("code") && (
        <span
          className="w-full shrink-0 truncate text-center font-mono font-semibold leading-none tracking-wide"
          style={{ fontSize: px(9), paddingTop: px(2) }}
        >
          {code}
        </span>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "print-label flex overflow-hidden border border-neutral-300 bg-white text-black",
        horizontal ? "flex-row items-stretch gap-1" : "flex-col",
        className,
      )}
      style={{ width: MM(tpl.widthMm), height: MM(tpl.heightMm), padding: pad }}
    >
      {horizontal ? (
        <>
          {codeBlock}
          {/* В строке у текста нет собственной ширины — без базиса он схлопнулся
              бы в полоску, как только коду задали 100 %. Базис задаёт нижнюю
              границу колонки, а сжимаются обе стороны пропорционально. */}
          <div
            className="flex min-w-0 flex-col justify-center gap-0.5"
            style={{ flex: "1 1 38%" }}
          >
            {info}
          </div>
        </>
      ) : (
        <>
          <div className="flex w-full shrink-0 flex-col gap-0.5">{info}</div>
          {codeBlock}
        </>
      )}
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
