import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { ru, useT } from "../../lib/copy";
import { logout, openDialog, useRoadmap } from "../../lib/roadmap/store";
import { RoadmapIdeaForm } from "./RoadmapIdeaForm";
import { RoadmapLogin } from "./RoadmapLogin";

const T = {
  login: ru("Войти"),
  account: ru("Аккаунт {email}"),
  votes: ru("Голосов: {count}"),
  ideas: ru("Идей отправлено: {count}"),
  logout: ru("Выйти"),
};

/**
 * Вход и аккаунт в шапке дорожной карты. Без входа — «Войти», после —
 * кружок с первой буквой почты и меню: сколько голосов и идей, выход.
 * «Войти» — та же кнопка, что «Подключить склад» рядом, только второстепенная
 * (серая): одна высота и одна форма на все действия шапки (Кирилл 31 окт).
 */
export function RoadmapAccount() {
  const t = useT();
  const { session, mine, ideas } = useRoadmap();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  if (!session) {
    return (
      <button
        type="button"
        onClick={() => openDialog({ kind: "login" })}
        className="wh-btn wh-btn--soft !h-10 !px-[18px] !text-sm"
      >
        <UserRound className="size-4" />
        {t(T.login)}
      </button>
    );
  }

  const email = session.user.email;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t(T.account, { email })}
        className="grid size-10 place-items-center rounded-full bg-[var(--wh-ink)] text-sm font-semibold uppercase text-[var(--wh-ground)]"
      >
        {email[0]}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-[var(--wh-line)] bg-[var(--wh-tile)] p-2 text-sm shadow-xl">
          <p className="truncate px-3 py-2 font-medium">{email}</p>
          <p className="px-3 text-[var(--wh-muted)] tabular-nums">
            {t(T.votes, { count: mine.size })}
          </p>
          <p className="px-3 pb-2 text-[var(--wh-muted)] tabular-nums">
            {t(T.ideas, { count: ideas.length })}
          </p>
          <button
            type="button"
            onClick={() => {
              logout();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-[var(--wh-soft)]"
          >
            <LogOut className="size-4" />
            {t(T.logout)}
          </button>
        </div>
      )}
    </div>
  );
}

/** Окна входа и идеи — одно место на странице, открываются из любой кнопки. */
export function RoadmapDialogs() {
  const { dialog } = useRoadmap();
  if (dialog?.kind === "login") return <RoadmapLogin />;
  if (dialog?.kind === "idea") return <RoadmapIdeaForm />;
  return null;
}
