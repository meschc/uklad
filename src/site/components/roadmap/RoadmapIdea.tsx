import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MILESTONES,
  ORIGIN_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  TRACK_LABELS,
  type RoadmapItem,
} from "../../data/roadmap";
import { quarterLabel } from "../../lib/roadmapStats";
import { c, useT } from "../../lib/copy";
import { ORIGIN_TONE, STATUS_TONE, TRACK_TONE } from "./roadmapColors";
import { useOverlay } from "../../lib/useOverlay";
import { SidePanel } from "../frame/SidePanel";
import { RoadmapComments } from "./RoadmapComments";

const T = {
  close: c("Закрыть", "Close"),
  status: c("Статус", "Status"),
  when: c("Срок", "When"),
  stage: c("Этап", "Stage"),
  topics: c("Темы", "Topics"),
  releasedIn: c("Вышло в {version}", "Shipped in {version}"),
  unreleased: c("Готово, ждёт выпуска", "Done, awaiting release"),
  noDate: c("Без срока", "No date"),
};

/**
 * Идея целиком — окно поверх доски, как у taptop по клику на карточку.
 *
 * В карточке суть обрезана до трёх строк; здесь — полный текст, статус с
 * пояснением, срок, этап с его целью и все темы. Комментариев пока нет
 * (решение 20 окт): им нужен сервер, а кнопка «Обсудить» ведёт к форме.
 */
export function RoadmapIdea({
  item,
  vote,
  onClose,
}: {
  item: RoadmapItem;
  /** Кнопка голоса — та же, что на карточке, чтобы состояние не разъехалось. */
  vote: React.ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  useOverlay(true, onClose);
  const stage = MILESTONES.find((m) => m.id === item.milestone);
  const when =
    item.status === "done"
      ? item.version
        ? t(T.releasedIn, { version: item.version })
        : t(T.unreleased)
      : item.quarter
        ? quarterLabel(t.lang, item.quarter)
        : t(T.noDate);

  return (
    <SidePanel onClose={onClose} label={t(item.title)}>
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-3">
          {vote}
          <button
            type="button"
            onClick={onClose}
            aria-label={t(T.close)}
            className="ml-auto grid size-9 place-items-center rounded-full transition-colors hover:bg-[var(--wh-soft)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <h2 className="mt-4 text-2xl font-heading leading-tight tracking-tight">{t(item.title)}</h2>
        <p className="mt-3 text-base leading-relaxed text-[var(--wh-muted)]">{t(item.summary)}</p>

        <dl className="mt-6 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 border-t border-[var(--wh-line)] pt-5 text-sm">
          <dt className="text-[var(--wh-muted)]">{t(T.status)}</dt>
          <dd>
            <span className="inline-flex items-center gap-2 font-medium">
              <span className={cn("size-2 rounded-full", STATUS_TONE[item.status])} />
              {t(STATUS_LABELS[item.status])}
            </span>
            <span className="text-[var(--wh-muted)]"> · {t(STATUS_HINTS[item.status])}</span>
          </dd>

          <dt className="text-[var(--wh-muted)]">{t(T.when)}</dt>
          <dd className="tabular-nums">{when}</dd>

          {stage && (
            <>
              <dt className="text-[var(--wh-muted)]">{t(T.stage)}</dt>
              <dd>
                <span className="font-medium">{t(stage.title)}</span>
                <span className="block text-[var(--wh-muted)]">{t(stage.goal)}</span>
              </dd>
            </>
          )}

          <dt className="text-[var(--wh-muted)]">{t(T.topics)}</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            <span className={TRACK_TONE[item.track]}>{t(TRACK_LABELS[item.track])}</span>
            {item.origin && (
              <span className={ORIGIN_TONE[item.origin]}>{t(ORIGIN_LABELS[item.origin])}</span>
            )}
          </dd>
        </dl>

        <RoadmapComments itemId={item.id} />
      </div>
    </SidePanel>
  );
}
