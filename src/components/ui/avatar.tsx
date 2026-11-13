import { cn } from "@/lib/utils";
import { asciiAvatar } from "@/lib/asciiAvatar";

/**
 * Аватар человека: фото, а без фото — ASCII-аватарка из генератора Кирилла
 * (`lib/asciiAvatar.ts`). Картинка выводится из `seed` (id сотрудника): у
 * человека она одна на всех экранах и не меняется после переименования.
 *
 * `shrink-0` и квадрат через `size-*`: в строке таблицы с длинным именем фото
 * не сплющивается (Кирилл 13.11: «картинки сужаются»), `object-cover`
 * обрезает, а не тянет.
 */

const SIZES = { sm: "size-7", md: "size-9", lg: "size-14" } as const;

export function Avatar({
  src,
  seed,
  size = "md",
  className,
}: {
  src?: string;
  seed: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <img
      src={src || asciiAvatar(seed, size === "lg" ? "full" : "small")}
      alt=""
      className={cn(
        "shrink-0 rounded-full border border-border bg-black object-cover",
        SIZES[size],
        className,
      )}
    />
  );
}
