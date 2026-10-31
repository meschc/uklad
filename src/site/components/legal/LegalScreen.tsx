import { useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Cookie,
  Download,
  FileSignature,
  FileText,
  Handshake,
  Languages,
  ListOrdered,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEGAL_BY_SLUG, LEGAL_DOCS } from "../../data/legal";
import type { LegalDoc } from "../../data/legal/types";
import { LEGAL_UPDATED } from "../../data/org";
import { c, fill, useT } from "../../lib/copy";
import { searchDoc } from "../../lib/legalSearch";
import { href } from "../../lib/route";
import { NotFoundScreen } from "../NotFoundScreen";
import { AsciiBanner } from "../frame/AsciiBanner";
import { DocSection } from "./DocBody";
import { DocSearch } from "./DocSearch";

/**
 * Обвязка правового раздела переведена, сами документы — нет, и это не
 * недоделка. Договор, оферта и политика обработки данных имеют силу в той
 * редакции, в которой написаны; перевод рядом с оригиналом читается как вторая
 * редакция того же документа, и первый же спор упрётся в вопрос, какая из них
 * настоящая. Поэтому английская версия честно предупреждает, что дальше —
 * русский текст, и не делает вид, что предлагает перевод.
 */
/** Подпись под документом. Одноязычна намеренно — см. место применения. */
const VERSION_LINE = "Редакция от {date}.";

/** Своя иконка у каждого документа (Кирилл 26 окт: одинаковые сливались). */
const ICONS: Record<string, LucideIcon> = {
  requisites: BadgeCheck,
  terms: Handshake,
  offer: FileSignature,
  privacy: ShieldCheck,
  consent: UserCheck,
  cookies: Cookie,
  recommendations: ListOrdered,
};

const T = {
  editions: c("Редакции", "Versions"),
  current: c("Действующая — от {date}", "Current — {date}"),
  past: c("от {date}", "{date}"),
  noPast: c(
    "Это первая редакция. Когда текст изменится, прежний останется здесь целиком — с датой и тем, что поменялось.",
    "This is the first version. When the text changes, the previous one will stay here in full, with its date and what changed.",
  ),
  notFoundCaption: c("Ошибка 404", "Error 404"),
  notFoundTitle: c("Такого документа нет", "No such document"),
  notFoundBody: c(
    "Ссылка могла устареть: документы мы переписываем, а коды у них постоянные. Действующая редакция каждого — в списке правового раздела.",
    "The link may be stale: we rewrite the documents, but their codes stay the same. The current version of each is in the list.",
  ),
  allDocs: c("Все документы", "All documents"),
  printHint: c(
    "Откроется окно печати — выберите «Сохранить как PDF»",
    "Opens the print dialog — choose “Save as PDF”",
  ),
  download: c("Скачать PDF", "Download PDF"),
  ruOnly: c(
    "",
    "The legal documents are in Russian: they are binding in the language they were written in, and a translation alongside would read as a second version.",
  ),
  inDoc: c("В документе", "In this document"),
  indexTitle: c("Правовая информация", "Legal information"),
  indexLead: c(
    "Семь документов, которые описывают Уклад с юридической стороны: кто владеет сервисом, на каких условиях им пользуются, что происходит с данными и по каким правилам сортируется витрина. Все редакции — от {date}.",
    "Seven documents describing Uklad from the legal side: who owns the service, on what terms it is used, what happens to data and how the catalogue is ordered. All of them are in Russian, version of {date}.",
  ),
};

/**
 * Правовой раздел: список документов и сам документ.
 *
 * Один экран на оба состояния, потому что отличаются они только содержимым —
 * заводить ради этого второй компонент со своей шапкой и своими отступами
 * значит развести два оформления одного и того же места.
 */
export function LegalScreen({ slug }: { slug?: string }) {
  const t = useT();
  const doc = slug ? LEGAL_BY_SLUG[slug] : undefined;

  // Документ назван, но такого у нас нет. Показать вместо него список — значит
  // сделать вид, что человек сам пришёл за списком: он читал договор, перешёл
  // по ссылке из своей переписки и должен понять, что ссылка устарела, а не
  // гадать, тот ли документ перед ним.
  if (slug && !doc) {
    return (
      <NotFoundScreen
        caption={t(T.notFoundCaption)}
        title={t(T.notFoundTitle)}
        action={{ label: t(T.allDocs), to: "/legal" }}
      >
        {t(T.notFoundBody)}
      </NotFoundScreen>
    );
  }

  if (!doc) return <LegalIndex />;

  // `key` по коду документа — не украшение. Переходы внутри витрины идут без
  // перезагрузки: с одного документа на другой компонент переживает, и набранный
  // запрос вместе с подсветкой переехал бы в чужой текст. `key` заставляет React
  // собрать вид заново, и поиск начинается с чистого поля.
  return <LegalDocView key={doc.slug} doc={doc} />;
}

function LegalDocView({ doc }: { doc: LegalDoc }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const hits = searchDoc(doc, query);

  return (
    <>
      <AsciiBanner
        scene="docs"
        eyebrow={
          <a
            href={href("/legal")}
            className="group inline-flex items-center gap-1.5 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            {t(T.allDocs)}
          </a>
        }
        title={<span lang="ru">{doc.title}</span>}
        lead={<span lang="ru">{doc.lead}</span>}
      />
      <div data-print="page" className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 sm:px-10">
        <div data-print="hide" className="flex flex-wrap items-center justify-end gap-3">
          {/*
           * PDF-версия документа собирается печатью браузера, а не лежит файлом.
           * Файл пришлось бы обновлять руками при каждой правке текста — и рано
           * или поздно скачанный PDF разошёлся бы с тем, что написано на
           * странице. Здесь источник один: печатается ровно то, что человек
           * только что прочитал, с датой редакции и реквизитами. Оформление
           * бумажной версии задано в `site.css`, блок `@media print`.
           */}
          <Button
            variant="outline"
            size="lg"
            shape="pill"
            onClick={() => window.print()}
            title={t(T.printHint)}
            // Подсветка своя: под курсором кнопка окрашивается фирменным,
            // а не подливается фоном, — это единственное действие на странице
            // документа, и оно должно отзываться заметнее обычной кнопки.
            className="hover:border-primary/50 hover:bg-transparent hover:text-primary"
          >
            <Download />
            {t(T.download)}
          </Button>
        </div>

        <div data-print="doc" className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_240px]">
          {/* `lang="ru"` не украшение: документ остаётся русским на английской
            версии, и без явной пометки браузер предложит прочитать его вслух
            по-английски, а поисковик посчитает страницу английской. */}
          <article className="min-w-0" lang="ru">
            {/* Заголовок и подводка на экране стоят в синем баннере; здесь они
              только для бумажной версии, баннер на печать не идёт. */}
            <p className="hidden font-display text-3xl font-heading leading-title tracking-tight print:block">
              {doc.title}
            </p>
            <p className="mt-4 hidden text-base leading-relaxed text-muted-foreground print:block">
              {doc.lead}
            </p>
            {/* Подпись под документом всегда русская: она стоит в одном
              предложении с основанием (`doc.basis`), и «…Гражданского кодекса
              Российской Федерации. Version of 27 August 2026» читалось бы как
              недоперевод. Английскому читателю ту же дату сообщает список
              документов и врезка ниже. */}
            <p className="border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground">
              {doc.basis}. {fill(VERSION_LINE, { date: LEGAL_UPDATED.ru })}
            </p>

            {t.lang === "en" && (
              <p
                data-print="hide"
                lang="en"
                className="mt-5 flex items-start gap-2.5 border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground r-inset"
              >
                <Languages className="mt-0.5 size-4 shrink-0 text-primary" />
                {t(T.ruOnly)}
              </p>
            )}

            {/* Поиск стоит в колонке документа, а не в боковом оглавлении:
              оглавление скрыто на телефоне, а документ на телефоне читают
              чаще всего. */}
            <DocSearch value={query} onChange={setQuery} hits={hits} />

            <div className="mt-10 flex flex-col gap-10">
              {doc.sections.map((s) => (
                <DocSection key={s.id} section={s} query={hits.query} self={`/legal/${doc.slug}`} />
              ))}
            </div>

            <Editions doc={doc} />
          </article>

          {/* Оглавление липкое и только на широком экране: на телефоне оно
            превратилось бы в вертикальный список во весь первый экран, до
            которого пришлось бы прокручивать сам документ. */}
          <nav data-print="hide" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t(T.inDoc)}
              </p>
              <div lang="ru" className="mt-3 flex flex-col gap-1.5 border-l border-border">
                {/* Настоящие якоря: страница живёт на пути, и хэш свободен.
                  Раньше здесь стояли кнопки — из оглавления договора нельзя
                  было скопировать ссылку на пункт, а именно этим оглавление и
                  полезно, когда на пункт нужно сослаться. */}
                {doc.sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="-ml-px border-l border-transparent pl-3 text-left text-sm leading-snug text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {s.title}
                  </a>
                ))}
              </div>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}

function LegalIndex() {
  const t = useT();

  return (
    <>
      <AsciiBanner
        scene="docs"
        title={t(T.indexTitle)}
        lead={t(T.indexLead, { date: t(LEGAL_UPDATED) })}
      />
      <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-12 sm:px-10 sm:pt-16">
        {/*
         * Плотность здесь важнее красоты сетки. В карточке четыре строки текста
         * подряд: иконка, название документа, о чём он и на чём основан, — и на
         * поле в 20 точек они слипались в один серый прямоугольник. Поля выросли
         * до 28, промежутки между карточками — вдвое, а строка основания прижата
         * к низу карточки (`mt-auto`): в ряду они встают на одну линию, и между
         * текстом и ею появляется просвет, а не случайный отступ.
         */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEGAL_DOCS.map((doc) => (
            <a
              key={doc.slug}
              lang="ru"
              href={href(`/legal/${doc.slug}`)}
              className="group flex h-full flex-col rounded-[22px] bg-[var(--wh-soft)] p-6 text-left transition-colors duration-200 hover:bg-[var(--wh-line)] sm:p-7"
            >
              <DocIcon slug={doc.slug} />
              <h2 className="mt-5 font-display text-base font-heading leading-snug tracking-tight">
                {doc.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{doc.lead}</p>
              <p className="mt-auto pt-6 text-xs leading-snug text-muted-foreground/70">
                {doc.basis}
              </p>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

function DocIcon({ slug }: { slug: string }) {
  const Icon = ICONS[slug] ?? FileText;
  return <Icon className="size-5 text-[var(--wh-blue)]" />;
}

/**
 * Архив редакций под документом. Прошлые тексты раскрываются на месте, а не
 * в окне: их читают, сверяя с действующим, и прокрутка назад должна работать.
 */
function Editions({ doc }: { doc: LegalDoc }) {
  const t = useT();
  const past = doc.editions ?? [];

  return (
    <aside data-print="hide" className="mt-16 rounded-[22px] bg-[var(--wh-soft)] p-6 sm:p-7">
      <h2 className="text-[22px] font-medium tracking-tight">{t(T.editions)}</h2>
      <p className="mt-4 text-sm font-medium">{t(T.current, { date: t(LEGAL_UPDATED) })}</p>
      {past.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-[var(--wh-muted)]">{t(T.noPast)}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {past.map((e) => (
            <details key={e.date} className="group rounded-2xl bg-[var(--wh-ground)] px-5 py-4">
              <summary className="cursor-pointer list-none text-sm">
                <span className="font-medium">{t(T.past, { date: e.date })}</span>
                <span className="text-[var(--wh-muted)]"> · {e.changes}</span>
              </summary>
              <div className="mt-6 flex flex-col gap-10">
                {e.sections.map((s) => (
                  <DocSection key={s.id} section={s} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </aside>
  );
}
