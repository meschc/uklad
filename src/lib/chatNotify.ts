/**
 * Уведомление о сообщении в браузере: «кто прислал и что» (Кирилл, 24 окт).
 *
 * Тост в кабинете виден только тому, кто смотрит на вкладку. Системное
 * уведомление доходит и до того, кто ушёл в почту или таблицу: браузер
 * показывает его поверх всего. Поэтому оно и нужно ровно тогда, когда вкладка
 * скрыта, — на открытой вкладке хватает тоста, а два сигнала на одно сообщение
 * только раздражают.
 *
 * Текст сообщения в уведомлении виден всем, кто стоит рядом с экраном, — у
 * общего стола упаковки это вся смена. Поэтому показ текста отключается в
 * профиле (`chatNotifyPreview`), и тогда остаётся только «кто написал». На
 * сервере это же поле — `members.notify_preview`: настройка человека, а не
 * браузера, и уйдёт туда без правки экранов.
 */

/** Длиннее браузеры всё равно обрежут, а с многоточием видно, что текст не весь. */
const PREVIEW_MAX = 120;

export interface ChatNotice {
  title: string;
  body: string;
}

/**
 * Что показать в уведомлении. Удалённое сообщение и пустой текст уходят общей
 * фразой: пустая строка под именем выглядит как сбой, а не как сообщение.
 */
export function chatNotice(
  name: string,
  text: string,
  preview: boolean,
  hidden: string,
): ChatNotice {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!preview || !clean) return { title: name, body: hidden };
  const body = clean.length > PREVIEW_MAX ? `${clean.slice(0, PREVIEW_MAX - 1)}…` : clean;
  return { title: name, body };
}

export type NotifyPermission = "granted" | "denied" | "default" | "unsupported";

/** Разрешил ли браузер уведомления. Нет API (старый браузер, вкладка в приложении) — «unsupported». */
export function notifyPermission(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Спросить разрешение. Браузер покажет вопрос только в ответ на нажатие —
 * поэтому вызывается из кнопки в профиле, а не при входе в кабинет.
 */
export async function askNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return notifyPermission();
  }
}

/**
 * Показать уведомление, если оно уместно: разрешено и вкладка скрыта. Вернёт,
 * показано ли, — иначе вызывающий покажет тост. Нажатие возвращает на вкладку
 * и открывает переписку. `tag` у переписки один: пять сообщений подряд от
 * одного человека сменяют друг друга, а не копятся стопкой.
 */
export function showChatNotice(notice: ChatNotice, tag: string, onOpen: () => void): boolean {
  if (notifyPermission() !== "granted" || !document.hidden) return false;
  try {
    const n = new Notification(notice.title, {
      body: notice.body,
      tag: `uklad-chat-${tag}`,
      icon: "/favicon.svg",
    });
    n.onclick = () => {
      window.focus();
      onOpen();
      n.close();
    };
    return true;
  } catch {
    // Android Chrome без service worker бросает на `new Notification` — тогда тост.
    return false;
  }
}
