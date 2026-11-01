import { setApiOrg } from "../data/api";
import { makeBackup } from "../backup";
import { SECRET_INTEGRATION_FIELDS } from "../integrations";
import { snapshotRepository } from "../data/snapshotRepository";
import { readLocal, writeLocal } from "../safeStorage";
import { PERSIST_KEY, PERSIST_VERSION, persistedState, useEditor } from "./index";
import { blankWarehouse } from "./seed";
import { emptyWarehouseData } from "./warehouseData";

/**
 * Кабинет компании живёт на сервере (ADR 0010), браузер держит его копию.
 *
 * Пока работа склада не разложена по таблицам, сервер хранит снимок целиком —
 * тот же объект, что `partialize` пишет в localStorage. Отсюда простые правила:
 *
 * — При входе сервер главнее. Снимок новее копии в браузере — копия
 *   заменяется снимком (через хранилище и перезагрузку, то есть те же
 *   миграции и проверку формы, что у обычного запуска).
 * — Новая компания начинает с пустого склада, а не с демо: демо остаётся
 *   кнопкой на экране входа без сервера.
 * — Правки уходят на сервер сами, через полторы секунды тишины. Сервер
 *   принимает запись, только если знает её версию: второе устройство с
 *   устаревшей копией не затрёт чужую работу молча — оно получит свежий
 *   снимок, а свои незаписанные правки найдёт в отложенной копии.
 * — Нет связи — работаем дальше в браузере, пометка «не записано» живёт в
 *   хранилище и переживает перезагрузку; запись повторится сама.
 * — Копия в браузере, которую нельзя признать записанной (незаписанные
 *   правки или копия до первого входа), перед заменой откладывается в
 *   `BEFORE_SYNC_KEY`. Выход с отложенной копией спрашивает и даёт её скачать.
 * — Снимок — весь кабинет, поэтому он только руководителю (сервер отвечает
 *   403 остальным): такой вход работу на сервер не пишет.
 *
 * Часть сохранения принадлежит устройству, а не компании: кто вошёл, какой
 * это компьютер, смена у стола, тема и язык. На сервер она не уходит и при
 * замене копии остаётся своей.
 */

/** Пометка синхронизации: чья копия, какой версии, есть ли незаписанное. */
interface SyncMeta {
  orgId: string;
  version: number;
  dirty: boolean;
}

export const SYNC_KEY = "uklad-sync-v1";
/** Сюда откладываются незаписанные правки, если сервер оказался новее. */
export const BEFORE_SYNC_KEY = `${PERSIST_KEY}.before-sync`;
/** Сказать человеку после перезагрузки, что его правки отложены. */
const NOTE_KEY = "uklad-sync-note";

const DEVICE_KEYS = [
  "session",
  "thisDeviceId",
  "stationSession",
  "packSession",
  "seenHints",
  "profile",
] as const;

const SAVE_DELAY_MS = 5000;
const RETRY_MS = 30_000;

type Persisted = ReturnType<typeof persistedState>;

function readMeta(): SyncMeta | null {
  try {
    const raw = JSON.parse(readLocal(SYNC_KEY) ?? "null") as Partial<SyncMeta> | null;
    if (!raw || typeof raw.orgId !== "string" || typeof raw.version !== "number") return null;
    return { orgId: raw.orgId, version: raw.version, dirty: raw.dirty === true };
  } catch {
    return null;
  }
}

function writeMeta(meta: SyncMeta) {
  writeLocal(SYNC_KEY, JSON.stringify(meta));
}

/** Есть ли правки, которых нет на сервере. */
export function hasUnsyncedChanges(): boolean {
  return readMeta()?.dirty === true;
}

/**
 * Лежит ли в браузере копия кабинета компании. Пока лежит, демо по ссылке не
 * открывается: под демо-пропуском человек увидел бы не демо, а чужой склад
 * (вход кончился, `sessionLost`, а данные остались).
 */
export function holdsCompanyCopy(): boolean {
  return Boolean(readMeta()?.orgId);
}

/** Есть ли отложенная копия — правки, проигравшие свежему снимку. */
export function hasDeferredCopy(): boolean {
  return readLocal(BEFORE_SYNC_KEY) !== null;
}

/**
 * Отложенная копия файлом резервной копии (`lib/backup.ts`): её можно
 * восстановить в профиле тем же путём, что и любую копию. `null` — копии нет.
 */
export function deferredCopyFile(): { fileName: string; text: string } | null {
  try {
    const raw = JSON.parse(readLocal(BEFORE_SYNC_KEY) ?? "null") as {
      state?: Record<string, unknown>;
      version?: number;
      savedAt?: number;
    } | null;
    if (!raw?.state || typeof raw.version !== "number") return null;
    const at = typeof raw.savedAt === "number" ? raw.savedAt : Date.now();
    return {
      fileName: `uklad-deferred-${new Date(at).toISOString().slice(0, 10)}.json`,
      text: JSON.stringify(makeBackup(raw.state, raw.version, at)),
    };
  } catch {
    return null;
  }
}

/**
 * Пометка «здесь ничьей работы нет» — вместе со стиранием данных на выходе.
 * После выхода кабинет заново сеет демо; без пометки следующий вход принял
 * бы его за неизвестную работу и отложил копию, а выход каждый раз
 * спрашивал бы про неё.
 */
export function markSignedOut() {
  writeMeta({ orgId: "", version: 0, dirty: false });
}

/**
 * Пароли и токены подключений (WB, Ozon, Честный знак…) в снимок не идут:
 * снимок лежит в базе и в её копиях открытым JSON. Они остаются на этом
 * устройстве, пока подключения не переедут на сервер с шифрованием.
 */
const SECRET_FIELDS = [...SECRET_INTEGRATION_FIELDS];
type Integrations = Persisted["integrations"];

function withoutSecrets(all: Integrations): Integrations {
  const out: Integrations = {};
  for (const [id, cfg] of Object.entries(all ?? {})) {
    const copy = { ...cfg };
    for (const f of SECRET_FIELDS) delete copy[f];
    out[id] = copy;
  }
  return out;
}

/** Вернуть пароли и токены этого устройства в пришедшие с сервера подключения. */
function withLocalSecrets(fromServer: unknown, local: Integrations): Integrations {
  const out: Integrations = { ...((fromServer as Integrations | undefined) ?? {}) };
  for (const [id, cfg] of Object.entries(local ?? {})) {
    if (!out[id]) continue;
    for (const f of SECRET_FIELDS) if (cfg[f]) out[id] = { ...out[id], [f]: cfg[f] };
  }
  return out;
}

/** Что уходит на сервер: всё сохранение, кроме частей устройства и секретов. */
export function companyPart(state: Persisted): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...state,
    integrations: withoutSecrets(state.integrations),
  };
  for (const key of DEVICE_KEYS) delete out[key];
  return out;
}

/** Части устройства из текущего сохранения — остаются своими при замене. */
function devicePart(state: Persisted): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of DEVICE_KEYS) out[key] = state[key];
  return out;
}

/**
 * Пустой кабинет новой компании: ни одного склада (только место под него,
 * `placeholder`), без товаров, истории и демо-переписки. Склад человек
 * заводит сам — подставленный без спроса «Мой склад» читался как ошибка
 * (Кирилл 1 ноя). Настройки, которые не являются данными (категории, шаблоны
 * полок и наклеек, адресация, тариф), остаются заводскими.
 */
export function blankCabinet(current: Persisted, email: string): Persisted {
  const warehouse = {
    ...blankWarehouse("", "mezzanine", ""),
    staff: [],
    partners: [],
    placeholder: true,
  };
  return {
    ...current,
    ...emptyWarehouseData(),
    warehouse,
    otherWarehouses: [],
    warehouseData: {},
    activeFloorId: warehouse.floors[0].id,
    products: [],
    placements: {},
    fieldValues: {},
    account: { type: "company", name: "" },
    profile: { ...current.profile, name: "", email },
    integrations: {},
    chats: {},
    staffEvents: [],
    stationSession: null,
    packSession: null,
  };
}

/** Заменить копию в браузере и перезапустить кабинет на ней. */
function replaceWith(state: Record<string, unknown>, format: number, meta: SyncMeta) {
  writeLocal(PERSIST_KEY, JSON.stringify({ state, version: format }));
  writeMeta(meta);
  window.location.reload();
}

let activeFlush: (() => Promise<boolean>) | null = null;

/**
 * Запустить синхронизацию для вошедшей компании. Возвращает остановку —
 * её зовут при выходе и при потере сессии.
 */
export function startServerSync(orgId: string): () => void {
  setApiOrg(orgId);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<boolean> | null = null;
  let lastSent = "";
  // До сверки с сервером писать нечего и сравнивать не с чем: шум стора на
  // старте (тосты, выбор этажа) иначе поднял бы версию без единой правки.
  let booted = false;

  /** Снимок не для этой роли: не пишем и не повторяем, говорим один раз. */
  const forbid = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    useEditor.getState().showToast("sync.err.forbidden");
  };

  const schedule = (ms = SAVE_DELAY_MS) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };

  /** Записать на сервер. `true` — на сервере то же, что здесь. */
  const flush = (): Promise<boolean> => {
    if (inflight) return inflight;
    inflight = (async () => {
      const meta = readMeta();
      if (stopped || !booted || !meta || meta.orgId !== orgId) return false;
      const data = companyPart(persistedState(useEditor.getState()));
      const text = JSON.stringify(data);
      if (text === lastSent) {
        if (meta.dirty) writeMeta({ ...meta, dirty: false });
        return true;
      }
      const res = await snapshotRepository.save(meta.version, PERSIST_VERSION, data);
      if (!res.ok) {
        writeMeta({ ...meta, dirty: true });
        if (res.error === "sync.err.forbidden") forbid();
        else schedule(RETRY_MS);
        return false;
      }
      if ("conflict" in res.data) {
        // Кто-то записал раньше нас: забираем свежее, своё откладываем.
        writeMeta({ ...meta, dirty: true });
        void boot();
        return false;
      }
      lastSent = text;
      writeMeta({ orgId, version: res.data.saved, dirty: false });
      return true;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  };

  const boot = async () => {
    const res = await snapshotRepository.load();
    if (stopped) return;
    if (!res.ok) {
      if (res.error === "sync.err.forbidden") return forbid();
      schedule(RETRY_MS);
      return;
    }
    const meta = readMeta();
    const current = persistedState(useEditor.getState());
    const snap = res.data;

    // Чистая пометка — копия совпадает с сервером (своя) или здесь после
    // выхода только демо: терять нечего. Незаписанные правки и копию без
    // пометки (работа до первого входа на этом устройстве) перед заменой
    // откладываем: это может быть единственная их копия.
    const deferIfNeeded = () => {
      if (meta && !meta.dirty) return;
      writeLocal(
        BEFORE_SYNC_KEY,
        JSON.stringify({ state: current, version: PERSIST_VERSION, savedAt: Date.now() }),
      );
      try {
        sessionStorage.setItem(NOTE_KEY, "conflict");
      } catch {
        // без пометки человек просто не увидит тост
      }
    };

    if (!snap) {
      // На сервере пусто. Своя работа в браузере — отправляем её; чужая
      // (демо или другая компания) — начинаем с пустого склада.
      if (meta?.orgId === orgId) {
        writeMeta({ ...meta, version: 0, dirty: true });
        booted = true;
        void flush();
        return;
      }
      deferIfNeeded();
      const blank = blankCabinet(current, current.session.user.email);
      return replaceWith(blank, PERSIST_VERSION, { orgId, version: 0, dirty: true });
    }

    if (meta?.orgId === orgId && meta.version === snap.version) {
      // Незаписанное с прошлого раза сравниваем с тем, что на сервере, а не
      // с собой — иначе оно так и не уйдёт.
      lastSent = meta.dirty ? JSON.stringify(snap.data) : JSON.stringify(companyPart(current));
      booted = true;
      if (meta.dirty) void flush();
      return;
    }

    deferIfNeeded();
    const integrations = withLocalSecrets(snap.data.integrations, current.integrations);
    // Профиль живёт на устройстве. На новом устройстве в нём заводской
    // «Кирилл» из демо — чужое имя и почта в настоящем аккаунте, поэтому
    // профиль чужой копии берёт имя и почту из сессии.
    const device = devicePart(current);
    if (meta?.orgId !== orgId) {
      device.profile = {
        ...current.profile,
        name: current.session.user.name ?? "",
        email: current.session.user.email,
      };
    }
    replaceWith({ ...snap.data, integrations, ...device }, snap.format, {
      orgId,
      version: snap.version,
      dirty: false,
    });
  };

  // Правки — любые изменения стора; лишние (выделение, зум) отсекает
  // сравнение с последним отправленным в `flush`.
  const unsubscribe = useEditor.subscribe(() => {
    if (!booted) return;
    const meta = readMeta();
    if (meta && meta.orgId === orgId && !meta.dirty) writeMeta({ ...meta, dirty: true });
    schedule();
  });

  try {
    if (sessionStorage.getItem(NOTE_KEY) === "conflict") {
      sessionStorage.removeItem(NOTE_KEY);
      useEditor.getState().showToast("sync.conflict");
    }
  } catch {
    // нет sessionStorage — нет и пометки
  }
  void boot();

  // Вкладка снова на экране — сначала свежее с сервера: правка с другого
  // устройства придёт до того, как здесь начнут править устаревшее. С
  // незаписанным здесь не тянем: его сначала нужно отправить.
  const onVisible = () => {
    if (document.visibilityState === "visible" && !hasUnsyncedChanges()) void boot();
  };
  document.addEventListener("visibilitychange", onVisible);

  activeFlush = flush;
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    unsubscribe();
    setApiOrg(null);
    if (activeFlush === flush) activeFlush = null;
  };
}

/** Дописать незаписанное сейчас (перед выходом). `true` — на сервере всё. */
export async function flushServerSync(): Promise<boolean> {
  if (!activeFlush) return !hasUnsyncedChanges();
  return activeFlush();
}
