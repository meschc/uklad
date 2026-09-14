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
       * Вес 500, а не 800. Крупный заголовок сверхжирным начертанием — приём
       * из середины десятых, и именно он давал странице «налёт»: буква толщиной
       * в палец кричит, но не выглядит дорого. Golos Text подключён переменным
       * (`wght@400..900`), так что 500 — настоящая инстанция шрифта, а не
       * подделанная браузером.
       *
       * Интерлиньяж 1.05 — почти вплотную, как держат крупный набор сдержанные
       * тёмные страницы. Ровно 1.0 не берём: у кириллицы есть выносные вниз
       * (у, р, д, ц, щ), и на двух строках они сталкиваются с верхними.
       */}
      <h2 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[42px]">
        {title}
      </h2>
      {lead && (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-[17px]">
          {lead}
        </p>
      )}
    </Reveal>
  );
}
