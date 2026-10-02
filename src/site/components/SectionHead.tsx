import { cn } from "@/lib/utils";
// Под псевдонимом: здесь `eyebrow` — уже имя свойства с текстом надзаголовка.
import { eyebrow as eyebrowClass } from "../lib/eyebrow";
import { Reveal } from "./Reveal";

/**
 * Шапка секции: надзаголовок, заголовок, подводка. Вынесена отдельно, потому
 * что повторяется семь раз — а рассинхронившиеся по кеглю и отступам заголовки
 * первым делом и выдают «сайт, собранный по кускам».
 */
export function SectionHead({
  eyebrow,
  title,
  lead,
  align = "center",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <Reveal className={cn("max-w-2xl", align === "center" ? "mx-auto text-center" : "text-left")}>
      {eyebrow && <p className={eyebrowClass("mb-3")}>{eyebrow}</p>}
      {/*
       * Вес 550 (`font-heading`), а не 800. Крупный заголовок сверхжирным
       * начертанием — приём из середины десятых, и именно он давал странице
       * «налёт»: буква толщиной в палец кричит, но не выглядит дорого. Geist
       * подключён переменным (`wght 100..900`), так что дробная ступень 550 —
       * настоящая инстанция шрифта, а не подделанная браузером. Само число
       * живёт в `tailwind.config.js`: заголовков на витрине сорок пять, и
       * менять вес в сорока пяти местах никто не станет.
       *
       * Интерлиньяж — `leading-display` (1.05), почти вплотную, как держат
       * крупный набор сдержанные тёмные страницы. Значение и объяснение, почему
       * не ровно 1.0, живут в `tailwind.config.js` рядом с остальной шкалой.
       */}
      <h2 className="font-display text-3xl font-heading leading-display tracking-tight sm:text-5xl">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{lead}</p>
      )}
    </Reveal>
  );
}
