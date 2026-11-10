import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { hasCabinetServer } from "../data/api";
import { groupArchive, mergeArchive, type ArchiveList, type Lists } from "../data/archiveLists";
import { historyRepository } from "../data/historyRepository";
import type { EditorState } from "./state";
import { useEditor } from "./index";

/**
 * Окно истории (ADR 0010, потолок данных, шаг 3). Сервер отдаёт кабинету
 * живую работу и последние 45 дней, законченное старше — в архиве. Отчёты за
 * долгий период (аналитика, услуги, документы, персонал) подмешивают архив
 * к тому, что в сторе: `useWithArchive("requests")` вместо
 * `useEditor((s) => s.requests)`.
 *
 * Архив только читается и живёт в памяти: в сохранение кабинета он не
 * попадает (иначе потолок браузера вернулся бы), на сервер не пишется,
 * при перезагрузке забирается заново — один раз, когда его впервые
 * попросил отчёт. Демо без сервера держит всю историю в сторе, архива у
 * него нет.
 */

export type ArchiveStatus = "idle" | "loading" | "ready" | "failed";

interface ArchiveState {
  status: ArchiveStatus;
  /** Компания, чей архив загружен: вход другой компанией берёт свой. */
  org: string | null;
  /** Склад → списки; пустая строка — списки всей компании (журнал смен). */
  lists: Record<string, Lists>;
}

const EMPTY: ArchiveState = { status: "idle", org: null, lists: {} };
const useArchive = create<ArchiveState>(() => EMPTY);

let inflight: Promise<void> | null = null;

/** Забрать архив, если его ещё нет. Без сервера и без входа паролем — нечего брать. */
export function ensureArchive(): Promise<void> {
  const org = useEditor.getState().session.orgId ?? null;
  const serverSession = useEditor.getState().session.source === "server";
  const cur = useArchive.getState();
  if (!hasCabinetServer || !serverSession || !org) return Promise.resolve();
  // Уже есть или едет — второй раз не берём; не доехал — пробуем снова.
  if (cur.org === org && (cur.status === "ready" || cur.status === "loading")) {
    return inflight ?? Promise.resolve();
  }
  useArchive.setState({ status: "loading", org, lists: {} });
  inflight = historyRepository.load().then((res) => {
    inflight = null;
    if (useArchive.getState().org !== org) return;
    if (!res.ok) return useArchive.setState({ status: "failed" });
    const lists = res.data === "forbidden" ? {} : groupArchive(res.data);
    useArchive.setState({ status: "ready", lists });
  });
  return inflight;
}

type ListOf<K extends ArchiveList> = EditorState[K] extends (infer T)[] ? T[] : never;

/**
 * Список активного склада вместе с архивом. Первый вызов забирает архив с
 * сервера; пока он едет, отчёт считает по окну (`useArchiveStatus` скажет,
 * что история догружается).
 */
export function useWithArchive<K extends ArchiveList>(key: K): ListOf<K> {
  const live = useEditor((s) => s[key]) as unknown as ListOf<K>;
  const wh = useEditor((s) => (key === "staffEvents" ? "" : s.warehouse.id));
  const archived = useArchive((s) => s.lists[wh]?.[key]);
  useEffect(() => {
    void ensureArchive();
  }, []);
  return useMemo(() => mergeArchive(key, live, archived) as ListOf<K>, [key, live, archived]);
}

/** Как идёт загрузка архива: отчёт честно говорит, что считает не всё. */
export function useArchiveStatus(): ArchiveStatus {
  return useArchive((s) => s.status);
}
