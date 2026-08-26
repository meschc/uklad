import { useMemo } from "react";
import { QR_QUIET_ZONE, qrMatrix, qrPath, type QrEcc } from "@/lib/qr";
import { cn } from "@/lib/utils";

/**
 * QR-ярлык: код + читаемая строка под ним. Строка обязательна — если ярлык
 * помялся и не читается сканером, кладовщик наберёт номер руками; ярлык без
 * подписи в этот момент становится куском бумаги.
 *
 * Всегда чёрным по белому и всегда с тихой зоной: и то и другое — требования
 * читаемости, а не оформления, поэтому тема на них не влияет.
 */
export function QrSvg({
  code,
  size = 96,
  ecc = "M",
  showCode = true,
  fit,
  className,
}: {
  code: string;
  /** Сторона кода в пикселях (без подписи). Игнорируется в режиме `fit`. */
  size?: number;
  ecc?: QrEcc;
  showCode?: boolean;
  /**
   * Вписаться в контейнер, сохранив квадрат. Режим наклейки: место под код там
   * выделяет вёрстка, а не компонент.
   */
  fit?: boolean;
  className?: string;
}) {
  const { path, span } = useMemo(() => {
    const matrix = qrMatrix(code, ecc);
    return {
      path: qrPath(matrix),
      span: matrix.length + QR_QUIET_ZONE * 2,
    };
  }, [code, ecc]);

  if (fit) {
    return (
      <svg
        viewBox={`0 0 ${span} ${span}`}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="crispEdges"
        className={cn("block h-full w-full", className)}
        role="img"
        aria-label={`QR ${code}`}
      >
        <g transform={`translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})`}>
          <path d={path} fill="#000" />
        </g>
      </svg>
    );
  }

  return (
    <div className={cn("flex flex-col items-center bg-white", className)}>
      <svg
        viewBox={`0 0 ${span} ${span}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`QR ${code}`}
      >
        <rect width={span} height={span} fill="#fff" />
        <g transform={`translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})`}>
          <path d={path} fill="#000" />
        </g>
      </svg>
      {showCode && (
        <div className="pt-0.5 text-center font-mono text-[10px] leading-tight tracking-wide text-black">
          {code}
        </div>
      )}
    </div>
  );
}
