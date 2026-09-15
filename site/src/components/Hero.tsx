import { ArrowRight, Github } from "lucide-react";
import { LinkButton } from "./ui";
import { noOrphans } from "@/lib/typography";
import { formatDate } from "@/lib/roadmap";

/**
 * Первый экран витрины. Обещание здесь ровно одно и то же, что и в продукте:
 * склад видно. Поэтому и фон — клетка, по которой в редакторе рисуют план, а
 * не абстрактный градиент.
 */
export function Hero({
  demoHref,
  repoHref,
  version,
  updatedAt,
}: {
  demoHref: string;
  repoHref: string;
  version: string;
  updatedAt: string;
}) {
  return (
    <section id="top" className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 grid-backdrop" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[hsl(var(--st-progress))] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[hsl(var(--st-progress))]" />
          </span>
          Прототип {version} · обновлено {formatDate(updatedAt)}
        </p>

        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          {noOrphans("Склад видно — и работу над ним тоже")}
        </h1>

        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          {noOrphans(
            "Уклад — визуальная WMS для маленького фулфилмент-склада: план мезонина рисуется мышью, товар ложится в конкретные ячейки, а дальше по этому плану идёт вся смена. Ниже — что уже работает, что пишется сейчас и что будет дальше.",
          )}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <LinkButton href={demoHref} size="lg" target="_blank" rel="noreferrer">
            Запустить у себя
            <ArrowRight />
          </LinkButton>
          <LinkButton href="#roadmap" variant="outline" size="lg">
            Смотреть роадмап
          </LinkButton>
          <LinkButton
            href={repoHref}
            variant="ghost"
            size="lg"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground"
          >
            <Github />
            Исходники
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
