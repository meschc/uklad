import { useState } from "react";
import { ArrowRight, FileText, MessagesSquare, Package, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { ru, useT, type Copy } from "../../lib/copy";
import { href } from "../../lib/route";
import { DemoForm } from "./DemoForm";

const T = {
  eyebrow: ru("Система"),
  title: ru("Товар, сотрудники и селлеры в одном кабинете"),
  showcaseTitle: ru("Ваш склад на витрине Уклада"),
  showcaseBody: ru(
    "Селлеры ищут склад в каталоге по городу, условиям и цене. Карточка вашего склада появляется там после подключения: это ещё один источник клиентов.",
  ),
  showcaseLink: ru("Открыть каталог"),
  demo: ru("Получить демо-доступ"),
  demoNote: ru("Персональная ссылка придёт на почту"),
};

/**
 * Четыре опоры системы в порядке подзаголовка первого экрана. Только то, что
 * в кабинете уже есть: учёта рабочих часов и раздачи задач «кто свободен, тот
 * берёт» здесь нет, пока нет функций (узлы `cab-hours`, `cab-task-pool`).
 */
const PILLARS: { icon: typeof Package; title: Copy; body: Copy; key?: boolean }[] = [
  {
    icon: Package,
    title: ru("Хранение и учёт товара"),
    body: ru(
      "У каждой ячейки адрес. Приёмка, размещение, сборка и отгрузка идут по нему, любой сотрудник находит товар и свободное место без вопросов начальнику склада. Если учёт сейчас в Excel или другой программе, поможем перенести остатки.",
    ),
  },
  {
    icon: Users,
    title: ru("Сотрудники и задачи"),
    body: ru("Задачи на приёмку и сборку, нагрузка по факту: кто сколько принял и отгрузил."),
  },
  {
    icon: MessagesSquare,
    title: ru("Связь с селлерами"),
    body: ru(
      "Клиент сам заходит, видит остатки, оставляет заявку и пишет в чат. Вы видите заявку и отвечаете там же, а не по телефону.",
    ),
    key: true,
  },
  {
    icon: FileText,
    title: ru("Документооборот"),
    body: ru(
      "Лист приёмки, лист сборки и накладная формируются из данных системы. Документы не нужно заполнять вручную и сверять с таблицей.",
    ),
  },
];

/**
 * «Что внутри»: четыре опоры и витрина отдельной полосой.
 *
 * Витрина — не пятая опора, а канал клиентов: опоры описывают работу внутри
 * склада, витрина приводит людей снаружи. Пятая карточка размыла бы ряд,
 * полоса показывает витрину заметно и не спорит с главной мыслью блока.
 *
 * Связь с селлерами выделена и шире остальных: это суть Уклада для склада —
 * меньше времени на ответы клиентам.
 */
export function Inside() {
  const t = useT();
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <section id="inside" className="mx-auto mt-20 max-w-6xl scroll-mt-24 px-4 sm:mt-24 sm:px-6">
      <SectionHead align="left" eyebrow={t(T.eyebrow)} title={t(T.title)} />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_1fr]">
        {PILLARS.map((p, i) => (
          <Reveal
            key={p.title.ru}
            as="article"
            delay={i * 70}
            className={cn(
              "r-window flex flex-col border p-5 sm:p-6",
              p.key
                ? "border-primary/40 bg-primary/5 sm:col-span-2 lg:col-span-1"
                : "border-border bg-card",
            )}
          >
            <p.icon className="size-5 text-primary" strokeWidth={1.75} />
            <h3 className="mt-4 font-display text-lg font-heading tracking-tight">{t(p.title)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(p.body)}</p>
          </Reveal>
        ))}
      </div>

      <Reveal className="r-window mt-4 flex flex-col gap-4 border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6">
        <div className="flex gap-4">
          <Store className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.75} />
          <div>
            <h3 className="font-display text-lg font-heading tracking-tight">
              {t(T.showcaseTitle)}
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t(T.showcaseBody)}
            </p>
          </div>
        </div>
        <a
          href={href("/market")}
          className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t(T.showcaseLink)}
          <ArrowRight className="size-4" />
        </a>
      </Reveal>

      <div className="mt-8">
        {demoOpen ? (
          <div className="r-window max-w-2xl border border-border bg-card p-5 sm:p-6">
            <DemoForm />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <Button
              size="lg"
              shape="pill"
              variant="outline"
              onClick={() => setDemoOpen(true)}
              className="w-full sm:w-auto"
            >
              {t(T.demo)}
            </Button>
            <p className="text-xs text-muted-foreground">{t(T.demoNote)}</p>
          </div>
        )}
      </div>
    </section>
  );
}
