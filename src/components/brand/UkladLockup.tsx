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
  image,
}: {
  tone?: "blue" | "white";
  className?: string;
  /** Свой логотип вместо знака Уклада (логотип компании из профиля). */
  image?: string;
}) {
  const onBlue = tone === "white";
  if (image) {
    return (
      <img
        src={image}
        alt=""
        aria-hidden
        className={cn("size-9 shrink-0 rounded-[10px] object-cover", className)}
      />
    );
  }
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
  image,
  fit = false,
}: {
  label?: string;
  tone?: "blue" | "white";
  wordless?: boolean;
  /**
   * Название целиком, без многоточия: длинное — мельче и до двух строк.
   * Так в меню видно полное имя склада, а не «Логопарк Ше…».
   */
  fit?: boolean;
  className?: string;
  image?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <UkladAppTile tone={tone} image={image} />
      {!wordless && (
        <span
          className={cn(
            "font-semibold tracking-[-0.03em]",
            !fit
              ? "truncate text-[21px] leading-none"
              : label.length <= 10
                ? "text-[21px] leading-none"
                : "line-clamp-2 break-words text-[15px] leading-tight",
            tone === "white" ? "text-white" : "text-foreground",
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
