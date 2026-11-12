import { useEffect, useState } from "react";
import { useEditor } from "./store";
import { decidersOf, teamRepository } from "./data/teamRepository";

/** Через сколько повторить запрос, если сервер не ответил. */
const RETRY_MS = 15_000;

/**
 * Кто вправе решать по товару и подписывать документы — по ролям сервера.
 * На сервере список подгружается один раз за вход и повторяется, пока не
 * придёт (отказ 403 — пустой список); до того `null`, и подписать не может никто. В демо — `null`, и
 * решает должность старшего.
 */
export function useDeskDeciders(): string[] | null {
  const onServer = useEditor((s) => s.session.source === "server");
  const deciders = useEditor((s) => s.deskDeciders);
  const set = useEditor((s) => s.setDeskDeciders);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!onServer || deciders) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    void teamRepository.list().then((res) => {
      if (!alive) return;
      if (res.ok) set(decidersOf(res.data));
      // Нет права на команду (режим просмотра) — подписантов для него нет,
      // повторять бессмысленно. Повтор — только при сбое связи или сервера.
      else if (res.error === "team.err.forbidden") set([]);
      else retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
    });
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [onServer, deciders, set, attempt]);
  return onServer ? deciders : null;
}
