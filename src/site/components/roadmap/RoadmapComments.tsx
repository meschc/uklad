import { useEffect, useState } from "react";
import { c, useT } from "../../lib/copy";
import type { RoadmapComment } from "../../lib/roadmap/port";
import { loadComments, openDialog, postComment, useRoadmap } from "../../lib/roadmap/store";

const T = {
  title: c("Обсуждение", "Discussion"),
  empty: c("Пока никто не написал. Начните вы.", "Nobody has written yet. Be the first."),
  placeholder: c("Что вам важно в этой функции?", "What matters to you about this feature?"),
  send: c("Отправить", "Send"),
  login: c("Войти по почте, чтобы написать", "Sign in by email to write"),
  failed: c("Не отправилось. Попробуйте ещё раз.", "Could not send. Please try again."),
};

const MAX = 1000;

/**
 * Обсуждение пункта внутри правой панели. Читать может любой, писать — только
 * вошедший по почте: анонимные комментарии на публичной карте без модерации
 * превращаются в спам. Автор подписан началом почты, без домена.
 */
export function RoadmapComments({ itemId }: { itemId: string }) {
  const t = useT();
  const { session } = useRoadmap();
  const [list, setList] = useState<RoadmapComment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadComments(itemId).then((res) => {
      if (alive && res.ok) setList(res.data);
    });
    return () => {
      alive = false;
    };
  }, [itemId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setFailed(false);
    const res = await postComment(itemId, text);
    setBusy(false);
    if (res.ok) {
      setList((prev) => [...prev, res.data]);
      setText("");
    } else if (res.error === "auth") {
      openDialog({ kind: "login" });
    } else {
      setFailed(true);
    }
  }

  return (
    <section className="mt-8 border-t border-[var(--wh-line)] pt-5" aria-label={t(T.title)}>
      <h3 className="text-sm font-heading">{t(T.title)}</h3>

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--wh-muted)]">{t(T.empty)}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {list.map((item) => (
            <li key={item.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{item.author}</span>
                <time className="text-xs tabular-nums text-[var(--wh-muted)]">
                  {new Date(item.createdAt).toLocaleDateString(t.lang === "ru" ? "ru-RU" : "en-GB")}
                </time>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{item.text}</p>
            </li>
          ))}
        </ul>
      )}

      {session ? (
        <form onSubmit={send} className="mt-4 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            placeholder={t(T.placeholder)}
            rows={3}
            className="w-full resize-y rounded-2xl border border-[var(--wh-line)] bg-[var(--wh-tile)] px-4 py-3 text-sm outline-none focus-visible:border-[var(--wh-blue)]"
          />
          {failed && <p className="text-xs text-destructive">{t(T.failed)}</p>}
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="wh-btn h-10 self-start disabled:opacity-50"
          >
            {t(T.send)}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => openDialog({ kind: "login" })}
          className="wh-btn wh-btn--soft mt-4 h-10"
        >
          {t(T.login)}
        </button>
      )}
    </section>
  );
}
