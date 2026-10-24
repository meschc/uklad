/**
 * Чат кабинета: диалоги, лента, отправка, прочтение, участники, настройки.
 *
 * Права решает база (`server/db/migrations/006_chat.sql`): каждый запрос идёт
 * в `withSession`, где `auth.resolve` ставит компанию и сотрудника из сессии.
 * Модуль только проверяет форму запроса и переводит отказ RLS в ответ:
 * чужой диалог — 404, а не 403 (5а, правило 7), чтобы по ответу нельзя было
 * узнать, что он существует.
 *
 * После записи участникам уходит «звонок» через Centrifugo (`realtime.js`);
 * текст сообщения туда не попадает.
 *
 * Маршруты:
 *   GET  /api/chat/conversations           — мои диалоги, непрочитанное, последнее;
 *                                            `joinable` — диалоги компании, куда можно войти
 *   POST /api/chat/conversations           — новый диалог (внутренний или по договору)
 *   GET  /api/chat/messages?conversation=… — лента с конца; `before` — страница раньше
 *   POST /api/chat/messages                — отправить (ответ, прикреплённая запись)
 *   POST /api/chat/messages/edit           — поправить своё
 *   POST /api/chat/messages/delete         — удалить своё (пометка остаётся)
 *   POST /api/chat/read                    — прочитано всё до сейчас
 *   POST /api/chat/members/add             — добавить человека своей компании (или себя)
 *   POST /api/chat/leave                   — выйти из диалога
 *   POST /api/chat/settings                — «показывать текст», «без звука»
 *   GET  /api/chat/realtime                — токен подключения к Centrifugo
 */
/* global module */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 4000;
const PAGE = 50;
const REF_TYPES = ["product", "batch", "shipment", "request"];

const isId = (v) => typeof v === "string" && UUID_RE.test(v);
const text = (v) => (typeof v === "string" ? v.trim() : "");

// Отказ RLS на вставке (42501) и ссылка на невидимую строку (23503) для
// клиента одно и то же: такого диалога для него нет.
const NOT_FOUND = { status: 404 };
const isDenied = (err) => err.code === "42501" || err.code === "23503";

function createChat({ auth, realtime, send, log }) {
  const { withSession, readJson } = auth;

  /** Выполнить от имени вошедшего; `fn` возвращает `{ status, body?, notify? }`. */
  async function run(req, res, fn) {
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.can("chat.use")) return { status: 403 };
      await c.query("SAVEPOINT chat");
      try {
        return await fn(c, ctx);
      } catch (err) {
        if (!isDenied(err)) throw err;
        await c.query("ROLLBACK TO SAVEPOINT chat");
        return NOT_FOUND;
      }
    });
    if (!out) return send(res, 401, { ok: false });
    // Звоним после COMMIT: иначе собеседник придёт за сообщением раньше, чем
    // оно появится в базе.
    if (out.notify) await realtime.notify(out.notify.to, out.notify.data);
    return send(res, out.status, { ok: out.status < 400, ...out.body });
  }

  /** POST: тело JSON с нашего сайта, проверка формы, затем `fn`. */
  async function post(req, res, check, fn) {
    const b = await readJson(req, res);
    if (!b) return;
    if (!check(b)) return send(res, 400, { ok: false, error: "bad_request" });
    return run(req, res, (c, ctx) => fn(c, ctx, b));
  }

  /** Кому позвонить: живые участники диалога, кроме самого автора. */
  async function others(c, conversationId, memberId) {
    const { rows } = await c.query(
      `SELECT member_id FROM uklad.conversation_members
       WHERE conversation_id = $1 AND left_at IS NULL AND member_id <> $2`,
      [conversationId, memberId],
    );
    return rows.map((r) => r.member_id);
  }

  /** Участвую ли я в диалоге: для чужого — 404, а не пустая лента. */
  async function joined(c, conv, ctx) {
    const { rowCount } = await c.query(
      `SELECT 1 FROM uklad.conversation_members
       WHERE conversation_id = $1 AND org_id = $2 AND member_id = $3 AND left_at IS NULL`,
      [conv, ctx.orgId, ctx.memberId],
    );
    return rowCount > 0;
  }

  const listConversations = (req, res) =>
    run(req, res, async (c, ctx) => {
      // Непрочитанное — чужие сообщения позже моей отметки. Своё не считается:
      // непрочитанное — это то, что должен прочитать я.
      const { rows } = await c.query(
        `SELECT v.id, v.title, v.contract_id, v.org_ids, cm.muted,
                last.id AS last_id, last.body AS last_body, last.created_at AS last_at,
                last.author_member_id AS last_author, last.deleted_at AS last_deleted,
                (SELECT count(*)::int FROM uklad.messages m
                 WHERE m.conversation_id = v.id AND m.author_member_id <> $1
                   AND m.deleted_at IS NULL
                   AND m.created_at > coalesce(cm.last_read_at, '-infinity')) AS unread
         FROM uklad.conversation_members cm
         JOIN uklad.conversations v ON v.id = cm.conversation_id
         LEFT JOIN LATERAL (
           SELECT id, body, created_at, author_member_id, deleted_at FROM uklad.messages
           WHERE conversation_id = v.id ORDER BY created_at DESC LIMIT 1) last ON true
         WHERE cm.org_id = $2 AND cm.member_id = $1 AND cm.left_at IS NULL
           AND v.deleted_at IS NULL
         ORDER BY coalesce(last.created_at, v.created_at) DESC`,
        [ctx.memberId, ctx.orgId],
      );
      // Диалоги моей компании, где меня ещё нет: например, склад завёл чат по
      // договору, а людей селлера туда добавляет сам селлер. Только название —
      // переписку RLS покажет после входа.
      const open = await c.query(
        `SELECT v.id, v.title, v.contract_id FROM uklad.conversations v
         WHERE $2 = ANY (v.org_ids) AND v.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM uklad.conversation_members cm
                           WHERE cm.conversation_id = v.id AND cm.org_id = $2
                             AND cm.member_id = $1 AND cm.left_at IS NULL)
         ORDER BY v.created_at DESC LIMIT 100`,
        [ctx.memberId, ctx.orgId],
      );
      return {
        status: 200,
        body: {
          joinable: open.rows.map((r) => ({ id: r.id, title: r.title, contractId: r.contract_id })),
          conversations: rows.map((r) => ({
            id: r.id,
            title: r.title,
            contractId: r.contract_id,
            orgIds: r.org_ids,
            muted: r.muted,
            unread: r.unread,
            last: r.last_id
              ? {
                  id: r.last_id,
                  authorId: r.last_author,
                  body: r.last_deleted ? "" : r.last_body,
                  deleted: Boolean(r.last_deleted),
                  at: r.last_at,
                }
              : null,
          })),
        },
      };
    });

  const createConversation = (req, res) =>
    post(
      req,
      res,
      (b) => {
        const ids = b.memberIds ?? [];
        return (
          text(b.title).length <= 200 &&
          (b.contractId === undefined || isId(b.contractId)) &&
          Array.isArray(ids) &&
          ids.length <= 50 &&
          ids.every(isId)
        );
      },
      async (c, ctx, b) => {
        let orgIds = [ctx.orgId];
        if (b.contractId) {
          // Вторая сторона — из самого договора, а не из запроса: RLS договоров
          // покажет его только стороне договора.
          const { rows } = await c.query(
            `SELECT org_id, seller_org_id FROM uklad.contracts
             WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
            [b.contractId],
          );
          if (!rows[0]) return NOT_FOUND;
          orgIds = [rows[0].org_id, rows[0].seller_org_id];
        }
        const { rows } = await c.query(
          `INSERT INTO uklad.conversations (org_id, org_ids, contract_id, title)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [ctx.orgId, orgIds, b.contractId ?? null, text(b.title) || null],
        );
        const id = rows[0].id;
        const invited = [...new Set(b.memberIds ?? [])].filter((m) => m !== ctx.memberId);
        // Сначала себя: добавлять других может только участник.
        for (const m of [ctx.memberId, ...invited]) {
          await c.query(
            `INSERT INTO uklad.conversation_members (org_id, conversation_id, member_id, added_by)
             VALUES ($1, $2, $3, $4)`,
            [ctx.orgId, id, m, ctx.memberId],
          );
        }
        return {
          status: 201,
          body: { id },
          notify: { to: invited, data: { type: "conversation", conversationId: id } },
        };
      },
    );

  function listMessages(req, res, url) {
    const conv = url.searchParams.get("conversation");
    const before = url.searchParams.get("before");
    if (!isId(conv) || (before && Number.isNaN(Date.parse(before)))) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    return run(req, res, async (c, ctx) => {
      if (!(await joined(c, conv, ctx))) return NOT_FOUND;
      // Имя собеседника из другой компании RLS покажет, только пока мы оба в
      // этом диалоге; вышедший остаётся в ленте без имени.
      const { rows } = await c.query(
        `SELECT m.id, m.author_member_id, m.body, m.reply_to, m.ref_type, m.ref_id,
                m.created_at, m.edited_at, m.deleted_at, p.display_name
         FROM uklad.messages m
         LEFT JOIN uklad.members p ON p.org_id = m.org_id AND p.id = m.author_member_id
         WHERE m.conversation_id = $1 AND ($2::timestamptz IS NULL OR m.created_at < $2)
         ORDER BY m.created_at DESC LIMIT $3`,
        [conv, before || null, PAGE],
      );
      const members = await c.query(
        `SELECT cm.member_id, cm.org_id, cm.last_read_at, p.display_name
         FROM uklad.conversation_members cm
         LEFT JOIN uklad.members p ON p.org_id = cm.org_id AND p.id = cm.member_id
         WHERE cm.conversation_id = $1 AND cm.left_at IS NULL`,
        [conv],
      );
      return {
        status: 200,
        body: {
          messages: rows.reverse().map((r) => ({
            id: r.id,
            authorId: r.author_member_id,
            authorName: r.display_name ?? null,
            body: r.body,
            replyTo: r.reply_to,
            ref: r.ref_type ? { type: r.ref_type, id: r.ref_id } : null,
            at: r.created_at,
            editedAt: r.edited_at,
            deletedAt: r.deleted_at,
          })),
          members: members.rows.map((r) => ({
            id: r.member_id,
            orgId: r.org_id,
            name: r.display_name ?? null,
            // Галочки «прочитано» у собеседника считаются по этой отметке.
            readAt: r.last_read_at,
          })),
          more: rows.length === PAGE,
        },
      };
    });
  }

  const sendMessage = (req, res) =>
    post(
      req,
      res,
      (b) => {
        const body = text(b.body);
        const ref = b.ref ?? null;
        return (
          isId(b.conversationId) &&
          body.length > 0 &&
          body.length <= MAX_BODY &&
          (b.replyTo === undefined || isId(b.replyTo)) &&
          (ref === null || (REF_TYPES.includes(ref.type) && isId(ref.id)))
        );
      },
      async (c, ctx, b) => {
        if (b.replyTo) {
          // Отвечать можно только на сообщение этого же диалога.
          const { rowCount } = await c.query(
            `SELECT 1 FROM uklad.messages WHERE id = $1 AND conversation_id = $2`,
            [b.replyTo, b.conversationId],
          );
          if (!rowCount) return NOT_FOUND;
        }
        const { rows } = await c.query(
          `INSERT INTO uklad.messages
             (org_id, conversation_id, author_member_id, body, reply_to, ref_type, ref_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
          [
            ctx.orgId,
            b.conversationId,
            ctx.memberId,
            text(b.body),
            b.replyTo ?? null,
            b.ref?.type ?? null,
            b.ref?.id ?? null,
          ],
        );
        // Своё сообщение прочитано мной в момент отправки.
        await c.query(
          `UPDATE uklad.conversation_members SET last_read_at = $4
           WHERE conversation_id = $1 AND org_id = $2 AND member_id = $3 AND left_at IS NULL`,
          [b.conversationId, ctx.orgId, ctx.memberId, rows[0].created_at],
        );
        return {
          status: 201,
          body: { id: rows[0].id, at: rows[0].created_at },
          notify: {
            to: await others(c, b.conversationId, ctx.memberId),
            data: { type: "message", conversationId: b.conversationId, messageId: rows[0].id },
          },
        };
      },
    );

  /** Правка и удаление своего: RLS не даст тронуть чужое — тогда 404. */
  const changeMessage = (kind) => (req, res) =>
    post(
      req,
      res,
      (b) =>
        isId(b.id) &&
        (kind === "delete" || (text(b.body).length > 0 && text(b.body).length <= MAX_BODY)),
      async (c, ctx, b) => {
        const { rows } = await c.query(
          kind === "edit"
            ? `UPDATE uklad.messages SET body = $2, edited_at = now()
               WHERE id = $1 AND deleted_at IS NULL RETURNING conversation_id`
            : `UPDATE uklad.messages SET body = '', deleted_at = now()
               WHERE id = $1 AND deleted_at IS NULL RETURNING conversation_id`,
          kind === "edit" ? [b.id, text(b.body)] : [b.id],
        );
        if (!rows[0]) return NOT_FOUND;
        const conv = rows[0].conversation_id;
        return {
          status: 200,
          notify: {
            to: await others(c, conv, ctx.memberId),
            data: { type: "changed", conversationId: conv, messageId: b.id },
          },
        };
      },
    );

  const markRead = (req, res) =>
    post(
      req,
      res,
      (b) => isId(b.conversationId),
      async (c, ctx, b) => {
        const { rowCount } = await c.query(
          `UPDATE uklad.conversation_members SET last_read_at = now()
           WHERE conversation_id = $1 AND org_id = $2 AND member_id = $3 AND left_at IS NULL`,
          [b.conversationId, ctx.orgId, ctx.memberId],
        );
        if (!rowCount) return NOT_FOUND;
        // Собеседникам — чтобы галочка «прочитано» загорелась без перезагрузки.
        return {
          status: 200,
          notify: {
            to: await others(c, b.conversationId, ctx.memberId),
            data: { type: "read", conversationId: b.conversationId },
          },
        };
      },
    );

  const addMember = (req, res) =>
    post(
      req,
      res,
      (b) => isId(b.conversationId) && isId(b.memberId),
      async (c, ctx, b) => {
        await c.query("SAVEPOINT member");
        try {
          await c.query(
            `INSERT INTO uklad.conversation_members (org_id, conversation_id, member_id, added_by)
             VALUES ($1, $2, $3, $4)`,
            [ctx.orgId, b.conversationId, b.memberId, ctx.memberId],
          );
        } catch (err) {
          // Уже в диалоге — не ошибка: повтор нажатия.
          if (err.code !== "23505") throw err;
          await c.query("ROLLBACK TO SAVEPOINT member");
          return { status: 200 };
        }
        return {
          status: 201,
          notify: {
            to: await others(c, b.conversationId, ctx.memberId),
            data: { type: "members", conversationId: b.conversationId },
          },
        };
      },
    );

  const leave = (req, res) =>
    post(
      req,
      res,
      (b) => isId(b.conversationId),
      async (c, ctx, b) => {
        const { rowCount } = await c.query(
          `UPDATE uklad.conversation_members SET left_at = now()
           WHERE conversation_id = $1 AND org_id = $2 AND member_id = $3 AND left_at IS NULL`,
          [b.conversationId, ctx.orgId, ctx.memberId],
        );
        return rowCount ? { status: 200 } : NOT_FOUND;
      },
    );

  const settings = (req, res) =>
    post(
      req,
      res,
      (b) =>
        (b.notifyPreview === undefined || typeof b.notifyPreview === "boolean") &&
        (b.muted === undefined || (typeof b.muted === "boolean" && isId(b.conversationId))),
      async (c, ctx, b) => {
        if (b.notifyPreview !== undefined) {
          await c.query(
            `UPDATE uklad.members SET notify_preview = $3 WHERE org_id = $1 AND id = $2`,
            [ctx.orgId, ctx.memberId, b.notifyPreview],
          );
        }
        if (b.muted !== undefined) {
          const { rowCount } = await c.query(
            `UPDATE uklad.conversation_members SET muted = $4
             WHERE conversation_id = $1 AND org_id = $2 AND member_id = $3 AND left_at IS NULL`,
            [b.conversationId, ctx.orgId, ctx.memberId, b.muted],
          );
          if (!rowCount) return NOT_FOUND;
        }
        const { rows } = await c.query(
          `SELECT notify_preview FROM uklad.members WHERE org_id = $1 AND id = $2`,
          [ctx.orgId, ctx.memberId],
        );
        return { status: 200, body: { notifyPreview: rows[0].notify_preview } };
      },
    );

  const realtimeToken = (req, res) =>
    run(req, res, async (c, ctx) => ({
      status: 200,
      // Пусто — Centrifugo не настроен, кабинет перечитывает ленту сам.
      body: { realtime: realtime.connectionToken(ctx.memberId) },
    }));

  const routes = {
    "GET /api/chat/conversations": listConversations,
    "POST /api/chat/conversations": createConversation,
    "GET /api/chat/messages": listMessages,
    "POST /api/chat/messages": sendMessage,
    "POST /api/chat/messages/edit": changeMessage("edit"),
    "POST /api/chat/messages/delete": changeMessage("delete"),
    "POST /api/chat/read": markRead,
    "POST /api/chat/members/add": addMember,
    "POST /api/chat/leave": leave,
    "POST /api/chat/settings": settings,
    "GET /api/chat/realtime": realtimeToken,
  };

  /** Обработчик маршрутов чата. `false` — маршрут не наш. */
  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой чата:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createChat };
