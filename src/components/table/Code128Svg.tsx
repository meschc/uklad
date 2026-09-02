import { code128Modules } from "@/lib/barcode";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Линейный штрихкод Code128 B. Полосы тянутся по высоте контейнера
 * (`preserveAspectRatio="none"`) — для одномерного кода это законно: сканер
 * читает только ширины штрихов, высота нужна лишь чтобы луч попал в код.
 *
 * Если строку закодировать нельзя (например, в ней кириллица — подмножество B
 * её не кодирует), честно не рисуем ничего, а показываем сам код: печатать
 * «почти правильный» штрихкод хуже, чем не печатать.
 */
export function Code128Svg({
  code,
  height,
  fit,
  className,
}: {
  code: string;
  /** Высота полос, px. Игнорируется в режиме `fit`. */
  height?: number;
  /** Растянуться по контейнеру — режим наклейки. */
  fit?: boolean;
  className?: string;
}) {
  const t = useT();
  const modules = code128Modules(code);

  if (!modules) {
    return (
      <div className={cn("bg-white px-2 py-3 text-center", className)}>
        <div className="font-mono text-xs text-black">{code}</div>
        <div className="pt-1 text-[10px] text-neutral-500">
          {t("barcode.notEncodable")}
        </div>
      </div>
    );
  }

  // Один <path> вместо сотен <rect>: на пачке в сотню наклеек разница видна.
  let d = "";
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === "1") d += `M${i} 0h1v100h-1z`;
  }

  return (
    <svg
      viewBox={`0 0 ${modules.length} 100`}
      preserveAspectRatio="none"
      className={cn("block w-full", className)}
      style={fit ? { height: "100%" } : { height: height ?? 56 }}
      role="img"
      aria-label={`Code128 ${code}`}
    >
      <path d={d} fill="#000" />
    </svg>
  );
}
