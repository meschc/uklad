import { useMemo, useState } from "react";
import { CheckCircle2, Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRACK_LABELS, type Track } from "../../data/roadmap";
import { ROADMAP_ITEMS } from "../../data/roadmapItems";
import { ru, useT } from "../../lib/copy";
import { useOverlay } from "../../lib/useOverlay";
import { closeDialog, openDialog, submitIdea, useRoadmap } from "../../lib/roadmap/store";
import type { RoadmapError } from "../../lib/roadmap/port";
import { TRACK_COLORS } from "./roadmapColors";
import { Hint, SubmitButton } from "./RoadmapLogin";
import { SidePanel } from "../frame/SidePanel";

const MAX_TITLE = 90;
const MAX_DETAILS = 1_500;

const T = {
  title: ru("Предложить идею"),
  lead: ru("Опишите задачу, а не готовое решение: что сейчас неудобно и как вы это обходите."),
  name: ru("Коротко, одной строкой"),
  namePh: ru("Например: печать ярлыков пачкой"),
  details: ru("Подробнее"),
  detailsPh: ru("Что делаете сейчас, сколько времени уходит, что должно получиться"),
  optional: ru("необязательно"),
  topic: ru("Тема"),
  similar: ru("Похоже, это уже есть на карте. Можно проголосовать за готовую идею:"),
  send: ru("Отправить идею"),
  sending: ru("Отправляем…"),
  needTitle: ru("Напишите идею хотя бы одной строкой."),
  loginFirst: ru(
    "Сначала войдите в аккаунт Уклада или создайте его по почте, затем идея отправится.",
  ),
  close: ru("Закрыть"),
  doneTitle: ru("Идея отправлена"),
  doneLead: ru(
    "Пока идея видна только вам, в блоке «Мои идеи» слева. Если возьмём в работу, она появится на доске, и мы напишем на почту.",
  ),
  ok: ru("Хорошо"),
};

const ERRORS: Record<RoadmapError, string> = {
  network: "Нет связи с сервером. Идея не потерялась, попробуйте ещё раз.",
  invalid: "Что-то пошло не так. Попробуйте ещё раз.",
  code: "Что-то пошло не так. Попробуйте ещё раз.",
  expired: "Войдите ещё раз.",
  auth: "Войдите ещё раз.",
  limit: "Слишком много идей за раз. Подождите немного.",
};

/** Слова длиннее трёх букв — по ним ищутся похожие пункты. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/i)
    .filter((w) => w.length > 3)
    .map((w) => w.slice(0, 5));
}

/**
 * Окно «Предложить идею» (Кирилл, 21 окт: «отдельным окном, а не формой
 * внизу»). Пока человек пишет, ниже появляются похожие пункты карты: голос за
 * готовую идею полезнее дубля. Без входа кнопка сначала открывает вход, а
 * черновик при этом не теряется — форма откроется снова с тем же текстом.
 */
export function RoadmapIdeaForm() {
  const t = useT();
  const { session } = useRoadmap();
  const [title, setTitle] = useState(draft.title);
  const [details, setDetails] = useState(draft.details);
  const [track, setTrack] = useState<Track | null>(draft.track);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useOverlay(true, closeDialog);

  const similar = useMemo(() => {
    const own = new Set(words(title));
    if (own.size === 0) return [];
    return ROADMAP_ITEMS.filter((item) =>
      words(`${item.title.ru} ${item.summary.ru}`).some((w) => own.has(w)),
    ).slice(0, 3);
  }, [title]);

  const send = async () => {
    if (title.trim() === "") return setHint(t(T.needTitle));
    const payload = { title: title.trim(), details: details.trim(), track };
    if (!session) {
      Object.assign(draft, payload);
      openDialog({ kind: "login" }, () => openDialog({ kind: "idea" }));
      return;
    }
    setBusy(true);
    setHint(null);
    const res = await submitIdea(payload);
    setBusy(false);
    if (typeof res === "string") return setHint(ERRORS[res]);
    Object.assign(draft, EMPTY_DRAFT);
    setDone(true);
  };

  return (
    <SidePanel onClose={closeDialog} label={t(T.title)}>
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-[var(--wh-blue)] text-[var(--wh-on-blue)]">
            {done ? <CheckCircle2 className="size-5" /> : <Lightbulb className="size-5" />}
          </span>
          <button
            type="button"
            onClick={closeDialog}
            aria-label={t(T.close)}
            className="grid size-9 place-items-center rounded-full transition-colors hover:bg-[var(--wh-soft)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {done ? (
          <div className="mt-4">
            <h2 className="text-2xl font-heading tracking-tight">{t(T.doneTitle)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--wh-muted)]">{t(T.doneLead)}</p>
            <button
              type="button"
              onClick={closeDialog}
              className="wh-btn wh-btn--blue mt-6 h-12 w-full justify-center"
            >
              {t(T.ok)}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="mt-4 flex flex-col gap-4"
          >
            <div>
              <h2 className="text-2xl font-heading tracking-tight">{t(T.title)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--wh-muted)]">{t(T.lead)}</p>
            </div>

            <div>
              <label htmlFor="idea-title" className="text-sm font-medium">
                {t(T.name)}
              </label>
              <input
                id="idea-title"
                value={title}
                maxLength={MAX_TITLE}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t(T.namePh)}
                className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[var(--wh-blue)]"
              />
            </div>

            {similar.length > 0 && (
              <div className="rounded-xl bg-[var(--wh-soft)] p-4 text-sm">
                <p className="text-[var(--wh-muted)]">{t(T.similar)}</p>
                <ul className="mt-2 space-y-1">
                  {similar.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#idea-${encodeURIComponent(item.id)}`}
                        onClick={closeDialog}
                        className="font-medium text-[var(--wh-blue)] hover:underline"
                      >
                        {t(item.title)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label htmlFor="idea-details" className="text-sm font-medium">
                {t(T.details)}{" "}
                <span className="font-normal text-[var(--wh-muted)]">· {t(T.optional)}</span>
              </label>
              <textarea
                id="idea-details"
                rows={5}
                value={details}
                maxLength={MAX_DETAILS}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t(T.detailsPh)}
                className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-base leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[var(--wh-blue)]"
              />
            </div>

            <div>
              <p id="idea-topic" className="text-sm font-medium">
                {t(T.topic)}{" "}
                <span className="font-normal text-[var(--wh-muted)]">· {t(T.optional)}</span>
              </p>
              <div role="group" aria-labelledby="idea-topic" className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(TRACK_LABELS) as Track[]).map((id) => {
                  const on = track === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setTrack(on ? null : id)}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                        on
                          ? TRACK_COLORS[id].fill
                          : "bg-[var(--wh-soft)] text-[var(--wh-ink)] shadow-[inset_0_0_0_1px_var(--wh-line)]",
                      )}
                    >
                      {!on && (
                        <span
                          aria-hidden
                          className={cn("size-2 rounded-full", TRACK_COLORS[id].dot)}
                        />
                      )}
                      {t(TRACK_LABELS[id])}
                    </button>
                  );
                })}
              </div>
            </div>

            {!session && <p className="text-xs text-[var(--wh-muted)]">{t(T.loginFirst)}</p>}
            <SubmitButton busy={busy} idle={t(T.send)} pending={t(T.sending)} />
            {hint && <Hint text={hint} />}
          </form>
        )}
      </div>
    </SidePanel>
  );
}

const EMPTY_DRAFT = { title: "", details: "", track: null as Track | null };

/** Черновик переживает переход ко входу и обратно: окно закрывается, текст — нет. */
const draft = { ...EMPTY_DRAFT };
