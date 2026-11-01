import { cn } from "@/lib/utils";
import { LOGO_BLUE, UkladIcon } from "./UkladLogo";

/**
 * Логотип с подписью (Кирилл 31 окт): знак-коробка из фавикона в скруглённом
 * квадрате, как иконка приложения, и «Уклад» справа — та же схема, что была
 * с собакой. Один компонент на витрину и кабинет, чтобы они не разъехались.
 * Живой логотип из клеток (`UkladLogoLive`) остался в блоке «в одном
 * кабинете» на лендинге.
 *
 * `tone="white"` — поверх синего: белый квадрат с синим знаком и белая
 * подпись, иначе синий квадрат на синем пропадает. `wordless` — один
 * квадрат, для свёрнутой боковой панели.
 */
export function UkladAppTile({
  tone = "blue",
  className,
}: {
  tone?: "blue" | "white";
  className?: string;
}) {
  const onBlue = tone === "white";
  return (
    <span
      aria-hidden
      style={{ background: onBlue ? "#FFFFFF" : LOGO_BLUE }}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[10px]",
        // Знак рисуется синим; на синем квадрате красим его белым.
        !onBlue && "[&_path]:fill-white",
        className,
      )}
    >
      <UkladIcon className="h-[42%]" />
    </span>
  );
}

export function UkladLockup({
  label = "Уклад",
  tone = "blue",
  wordless = false,
  className,
}: {
  label?: string;
  tone?: "blue" | "white";
  wordless?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <UkladAppTile tone={tone} />
      {!wordless && (
        <span
          className={cn(
            "text-[21px] font-semibold leading-none tracking-[-0.03em]",
            tone === "white" ? "text-white" : "text-foreground",
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
