/**
 * Переписка продавца со складом через сервер (п. 2.1в «До запуска», 28.11).
 *
 *   POST /api/seller-chat/send   — { key, text, replyTo?, topic? }
 *   POST /api/seller-chat/edit   — { id, text }
 *   POST /api/seller-chat/delete — { id }
 *   POST /api/seller-chat/read   — {}: входящие от склада прочитаны
 *
 * Лента та же, что у склада: `chats[<партнёр>]` (строки `cabinet_records`,
 * домен `chats`, по строке на партнёра). Склад пишет её правкой кабинета, как
 * и раньше; продавцу правка кабинета закрыта, поэтому он шлёт операцию, а
 * запись в ленту делает сервер. Встречные правки не теряются: лента — список
 * с `id`, а кабинет склада сливает такие по записям (`cabinetMerge.ts`).
 *
 * Что решает сервер, а не браузер:
 *   · чья лента — из сессии продавца (`partner_ref`), в теле партнёра нет;
 *     другая переписка склада продавцу не видна и не пишется;
 *   · автор — всегда «продавец» и человек из сессии (`byMember`); править и
 *     удалять можно только своё, не удалённое;
 *   · тема «по товару» — только по своему товару;
 *   · повтор с тем же ключом сообщение не задваивает: id выводится из ключа;
 *   · частота — общий счётчик операций продавца (`sellerRequests.js`).
 *
 * Имён людей склада в ленте нет вовсе (`from` — роль), так что продавец видит
 * «Склад», а не того, кто ответил (вопрос 2 треда 28.11 — рекомендация).
 */
/* global module, Buffer */

const KEY_RE = /^[A-Za-z0-9-]{8,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
/** Длина сообщения — как у чата кабинета (`chat.js`, `MAX_BODY`). */
const MAX_TEXT = 4000;
const MAX_LABEL = 200;
/** Сообщений в одной ленте: дальше — 409, строка ленты не растёт без конца. */
const MAX_MESSAGES = 5000;
/**
 * Байт в ленте (разбор «Безопасности продукта» 28.11): 5000 сообщений по
 * 4000 знаков — до 20 МБ в одной строке, и каждая отправка переписывает её
 * под блокировкой снимка. Дальше 1 МБ — 409, как переполнение.
 */
const MAX_BYTES = 1_000_000;
const KINDS = new Set(["product", "request", "receiving", "shipment", "other"]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const isId = (v) => typeof v === "string" && ID_RE.test(v);

function readText(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= MAX_TEXT ? t : null;
}

/** Тема из «+»: вид из списка, ссылки — короткие id, подпись — до 200 знаков. */
function readTopic(v) {
  if (v === undefined || v === null) return {};
  if (!isObject(v) || !KINDS.has(v.kind)) return null;
  const topic = { kind: v.kind };
  for (const k of ["productId", "refId"]) {
    if (v[k] === undefined) continue;
    if (!isId(v[k])) return null;
    topic[k] = v[k];
  }
  if (v.label !== undefined) {
    if (typeof v.label !== "string" || v.label.length > MAX_LABEL) return null;
    topic.label = v.label;
  }
  return { topic };
}

function readSend(b) {
  if (!isObject(b) || typeof b.key !== "string" || !KEY_RE.test(b.key)) return null;
  const text = readText(b.text);
  if (!text) return null;
  if (b.replyTo !== undefined && !isId(b.replyTo)) return null;
  const t = readTopic(b.topic);
  if (!t) return null;
  return { key: b.key, text, replyTo: b.replyTo, ...t };
}

function readEdit(b) {
  if (!isObject(b) || !isId(b.id)) return null;
  const text = readText(b.text);
  return text ? { id: b.id, text } : null;
}

const readId = (b) => (isObject(b) && isId(b.id) ? { id: b.id } : null);
const readNothing = (b) => (isObject(b) ? {} : null);

const messageId = (key) => `msg_s${key}`;

/** Своё сообщение: написал продавец, и именно этот человек. */
const isOwn = (m, memberId) => isObject(m) && m.from === "seller" && m.byMember === memberId;

/** Что из ленты видит продавец: без отметки, кто из людей писал. */
const toSellerMessage = (m) => {
  const out = { ...m };
  delete out.byMember;
  return out;
};

/** Лента продавца для его копии кабинета (`forSeller`). */
function sellerChats(chats, partnerRef) {
  const own = isObject(chats) ? list(chats[partnerRef]) : [];
  const messages = own.filter(isObject).map(toSellerMessage);
  return messages.length ? { [partnerRef]: messages } : {};
}

/** Заявки, рейсы и поставки, которые видит продавец (`forSeller`), — их id. */
const ownRefs = (mine) =>
  new Set(
    ["requests", "shipments", "expectedShipments"].flatMap((k) =>
      list(mine?.[k])
        .filter(isObject)
        .map((x) => x.id),
    ),
  );

/** Отказ отправки или `null`. `mine` — копия кабинета продавца (`forSeller`). */
function sendRefusal(messages, own, b, mine) {
  if (messages.length >= MAX_MESSAGES) return { status: 409, error: "too_many" };
  const size = Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(b.text ?? "");
  if (size > MAX_BYTES) return { status: 409, error: "too_many" };
  if (b.replyTo && !messages.some((m) => isObject(m) && m.id === b.replyTo)) {
    return { status: 404, error: "not_found" };
  }
  if (b.topic?.productId && !own.has(b.topic.productId)) {
    return { status: 404, error: "not_found" };
  }
  // Тема «по заявке, поставке, рейсу» — только своей: иначе склад увидит в
  // ленте ссылку на чужую работу.
  if (b.topic?.refId && !ownRefs(mine).has(b.topic.refId)) {
    return { status: 404, error: "not_found" };
  }
  return null;
}

function newMessage(b, at, memberId) {
  return {
    id: messageId(b.key),
    from: "seller",
    byMember: memberId,
    text: b.text,
    at,
    ...(b.replyTo ? { replyTo: b.replyTo } : {}),
    ...(b.topic ? { topic: b.topic } : {}),
  };
}

/**
 * Маршруты переписки. `run(req, res, parse, fn)` — общий конверт операций
 * продавца (`sellerRequests.js`): сессия, частота, снимок под блокировкой;
 * `writeView` — запись склада обратно в снимок.
 */
function chatRoutes({ run, writeView }) {
  /** Записать ленту `messages` продавца и ответить `reply`. */
  async function save(c, me, messages, reply) {
    const { full, view, ref, partner } = me;
    const chats = isObject(view.chats) ? view.chats : {};
    const next = { ...view, chats: { ...chats, [partner]: messages } };
    const bad = await writeView(c, full, next, ref);
    return bad ? { status: 409, error: bad.error } : { status: 200, ...reply };
  }

  const thread = (me) => (isObject(me.view.chats) ? list(me.view.chats[me.partner]) : []);

  const send = (req, res) =>
    run(req, res, readSend, async (c, ctx, me, b, at) => {
      const messages = thread(me);
      const id = messageId(b.key);
      const before = messages.find((m) => isObject(m) && m.id === id);
      if (before) {
        return isOwn(before, ctx.memberId)
          ? { status: 200, message: toSellerMessage(before), duplicate: true }
          : { status: 409, error: "key_taken" };
      }
      const no = sendRefusal(messages, me.own, b, me.mine);
      if (no) return no;
      const made = newMessage(b, at, ctx.memberId);
      return save(c, me, [...messages, made], { message: toSellerMessage(made) });
    });

  /** Правка и удаление своего: чужое и удалённое — отказ, ленту не трогаем. */
  const change = (kind) => (req, res) =>
    run(req, res, kind === "edit" ? readEdit : readId, async (c, ctx, me, b, at) => {
      const messages = thread(me);
      const m = messages.find((x) => isObject(x) && x.id === b.id);
      if (!m) return { status: 404, error: "not_found" };
      if (!isOwn(m, ctx.memberId)) return { status: 409, error: "not_yours" };
      if (m.deletedAt) return { status: 409, error: "deleted" };
      if (kind === "edit" && m.text === b.text) return { status: 200, message: toSellerMessage(m) };
      const done =
        kind === "edit" ? { ...m, text: b.text, editedAt: at } : { ...m, text: "", deletedAt: at };
      const next = messages.map((x) => (x === m ? done : x));
      return save(c, me, next, { message: toSellerMessage(done) });
    });

  /** Прочитано всё входящее от склада. Нечего отмечать — снимок не трогаем. */
  const read = (req, res) =>
    run(
      req,
      res,
      readNothing,
      async (c, ctx, me, b, at) => {
        const messages = thread(me);
        const unread = (m) => isObject(m) && m.from !== "seller" && !m.readAt;
        const marked = messages.filter(unread).length;
        if (!marked) return { status: 200, marked: 0 };
        const next = messages.map((m) => (unread(m) ? { ...m, readAt: at } : m));
        return save(c, me, next, { marked });
      },
      ":read",
    );

  return {
    "/api/seller-chat/send": send,
    "/api/seller-chat/edit": change("edit"),
    "/api/seller-chat/delete": change("delete"),
    "/api/seller-chat/read": read,
  };
}

/** Маршруты переписки для списка разрешённого продавцу (`auth.js`, `sellerMay`). */
const SELLER_CHAT_PATHS = [
  "/api/seller-chat/send",
  "/api/seller-chat/edit",
  "/api/seller-chat/delete",
  "/api/seller-chat/read",
];

module.exports = {
  chatRoutes,
  sellerChats,
  readSend,
  readEdit,
  sendRefusal,
  messageId,
  SELLER_CHAT_PATHS,
  MAX_MESSAGES,
};
