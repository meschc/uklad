import { cn } from "@/lib/utils";

/**
 * Аватар человека: фото, а без фото — инициалы на своём цвете. Цвет выводится
 * из `seed` (id сотрудника) — у человека он один на всех экранах и не
 * меняется после переименования.
 *
 * `shrink-0` и квадрат через `size-*`: в строке таблицы с длинным именем фото
 * не сплющивается (Кирилл 13.11: «картинки сужаются»), `object-cover`
 * обрезает, а не тянет.
 */

const TONES = [
  "--tag-plan",
  "--tag-fulfillment",
  "--tag-staff",
  "--tag-market",
  "--tag-platform",
  "--tag-warehouses",
  "--tag-sellers",
];
// На светлых тонах белые буквы не читаются — там тёмные.
const DARK_INK = new Set(["--tag-fulfillment", "--tag-market", "--tag-sellers"]);

function tone(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return TONES[(h >>> 0) % TONES.length];
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)
  ).toUpperCase();
}

const SIZES = { sm: "size-7 text-2xs", md: "size-9 text-xs", lg: "size-14 text-base" } as const;

export function Avatar({
  name,
  src,
  seed,
  size = "md",
  className,
}: {
  name: string;
  src?: string;
  seed: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const box = cn("shrink-0 rounded-full", SIZES[size], className);
  if (src) return <img src={src} alt="" className={cn(box, "border border-border object-cover")} />;
  const t = tone(seed);
  return (
    <span
      aria-hidden
      className={cn(box, "flex select-none items-center justify-center font-semibold")}
      style={{
        background: `hsl(var(${t}))`,
        color: DARK_INK.has(t) ? "hsl(var(--tag-ink))" : "white",
      }}
    >
      {initials(name)}
    </span>
  );
}
