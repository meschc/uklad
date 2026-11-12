import { useEffect } from "react";
import { useEditor } from "./store";
import { decidersOf, teamRepository } from "./data/teamRepository";

/**
 * Кто вправе решать по товару и подписывать документы — по ролям сервера.
 * На сервере список подгружается один раз за вход; в демо и без права на
 * команду остаётся `null`, и тогда решает должность старшего.
 */
export function useDeskDeciders(): string[] | null {
  const onServer = useEditor((s) => s.session.source === "server");
  const deciders = useEditor((s) => s.deskDeciders);
  const set = useEditor((s) => s.setDeskDeciders);
  useEffect(() => {
    if (!onServer || deciders) return;
    let alive = true;
    void teamRepository.list().then((res) => {
      if (alive && res.ok) set(decidersOf(res.data));
    });
    return () => {
      alive = false;
    };
  }, [onServer, deciders, set]);
  return onServer ? deciders : null;
}
