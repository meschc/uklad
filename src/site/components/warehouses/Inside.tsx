import { useState } from "react";
import { ArrowRight, FileText, MessagesSquare, Package, Store, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { ru, useT, type Copy } from "../../lib/copy";
import { href } from "../../lib/route";
import { DemoForm } from "./DemoForm";

const T = {
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
    <section
      id="inside"
      className="mx-auto mt-28 max-w-[1320px] scroll-mt-24 px-5 sm:mt-36 sm:px-10"
    >
      <Reveal>
        <h2 className="wh-h2 max-w-[16ch]">{t(T.title)}</h2>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_1fr]">
        {PILLARS.map((p, i) => (
          <Reveal
            key={p.title.ru}
            as="article"
            delay={i * 70}
            className={cn(
              "flex min-h-[280px] flex-col p-6 sm:p-7",
              p.key ? "wh-blue sm:col-span-2 lg:col-span-1" : "wh-tile",
            )}
          >
            <p.icon
              className={cn("size-6", p.key ? "text-white" : "text-[var(--wh-blue)]")}
              strokeWidth={1.5}
            />
            <h3 className="wh-h3 mt-auto pt-10">{t(p.title)}</h3>
            <p
              className={cn("mt-3 text-base leading-relaxed", p.key ? "text-white/85" : "wh-muted")}
            >
              {t(p.body)}
            </p>
          </Reveal>
        ))}
      </div>

      <Reveal className="wh-ink mt-3 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-8">
        <div className="flex gap-4">
          <Store className="mt-0.5 size-6 shrink-0" strokeWidth={1.5} />
          <div>
            <h3 className="wh-h3">{t(T.showcaseTitle)}</h3>
            <p className="mt-2 max-w-2xl text-base leading-relaxed opacity-75">
              {t(T.showcaseBody)}
            </p>
          </div>
        </div>
        <a href={href("/market")} className="wh-btn wh-btn--white shrink-0">
          {t(T.showcaseLink)}
          <ArrowRight className="size-4" />
        </a>
      </Reveal>

      <div className="mt-8">
        {demoOpen ? (
          <div className="max-w-2xl rounded-[22px] bg-background p-5 text-foreground sm:p-7">
            <DemoForm />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="wh-btn wh-btn--ghost w-full sm:w-auto"
            >
              {t(T.demo)}
            </button>
            <p className="wh-muted text-sm">{t(T.demoNote)}</p>
          </div>
        )}
      </div>
    </section>
  );
}
