/**
 * Рассылка о непрочитанном: Телеграм и письмо (миграция 007).
 *
 * Кабинет узнаёт о сообщении сам (Centrifugo и уведомление браузера). Эта
 * рассылка — для того, кто от кабинета отошёл:
 *   - Телеграм: сообщение пролежало непрочитанным минуту — одно уведомление
 *     на диалог, сколько бы сообщений ни пришло за проход;
 *   - письмо: непрочитанное лежит час — одно письмо обо всех диалогах сразу,
 *     и следующее не раньше чем через шесть часов. Только на подтверждённую
 *     почту: на чужой адрес, вписанный при регистрации, писать нельзя.
 *
 * Кому и о чём — решает `auth.chat_due`, отметку «сказали» ставит
 * `auth.chat_noticed` только после удачной отправки: упал Телеграм или почта
 * — следующий проход попробует снова. Исключение — заблокированный бот: туда
 * больше не шлём и привязку снимаем.
 *
 * Подключение — под ролью `uklad_notifier` (init.sql), а не приложения: у
 * приложения функций рассылки нет вовсе.
 *
 * Текст сообщения попадает в уведомление, только если человек не выключил
 * его показ (`members.notify_preview`): тогда в `body` пусто, и уходит
 * «Новое сообщение».
 */
/* global module, setInterval */

const TELEGRAM = { minAge: "1 minute", quiet: "0 seconds", every: 30_000 };
const EMAIL = { minAge: "1 hour", quiet: "6 hours", every: 5 * 60_000 };
const BATCH = 100;
// Длинное сообщение в уведомлении не читают — открывают кабинет.
const PREVIEW_MAX = 300;

const clip = (s) => (s.length > PREVIEW_MAX ? `${s.slice(0, PREVIEW_MAX - 1)}…` : s);

/** Одна строка «кто — где: что» для уведомления о диалоге. */
function noticeLine(row) {
  const where = row.title ? ` — ${row.title}` : "";
  const what = row.body?.trim() ? clip(row.body.trim()) : "Новое сообщение";
  const more = row.unread > 1 ? ` (непрочитанных: ${row.unread})` : "";
  return { head: `${row.author || "Собеседник"}${where}${more}`, what };
}

function telegramText(row, appUrl) {
  const { head, what } = noticeLine(row);
  return `${head}\n${what}\n\nОткрыть чат: ${appUrl}`;
}

function emailLetter(rows, appUrl) {
  const blocks = rows.map((r) => {
    const { head, what } = noticeLine(r);
    return `${head}\n${what}`;
  });
  return {
    subject:
      rows.length === 1 ? "Непрочитанное сообщение в Укладе" : "Непрочитанные сообщения в Укладе",
    text: [
      "Здравствуйте!",
      "",
      "В чатах кабинета вас ждут сообщения:",
      "",
      blocks.join("\n\n"),
      "",
      `Открыть кабинет: ${appUrl}`,
      "",
      "Письмо приходит, если сообщение не прочитано час, и не чаще раза в шесть часов. Показ текста сообщений в письмах и уведомлениях отключается в профиле кабинета.",
    ].join("\n"),
  };
}

function createNotifier({ pool, telegram, mail, appUrl, log }) {
  const due = async (channel, cfg) =>
    (
      await pool.query(
        // Время — строкой: Date в JS теряет микросекунды, и отметка «сказали до»
        // оказалась бы раньше самого сообщения — о нём сказали бы снова.
        `SELECT *, upto::text AS upto_exact FROM auth.chat_due($1, $2::interval, $3::interval, $4)`,
        [channel, cfg.minAge, cfg.quiet, BATCH],
      )
    ).rows;

  const noticed = (channel, r) =>
    pool.query(`SELECT auth.chat_noticed($1, $2, $3, $4, $5)`, [
      channel,
      r.org_id,
      r.member_id,
      r.conversation_id,
      r.upto_exact,
    ]);

  /** Проход по Телеграму. Вернёт, сколько уведомлений ушло. */
  async function tickTelegram() {
    if (!telegram.enabled) return 0;
    let sent = 0;
    for (const r of await due("telegram", TELEGRAM)) {
      const out = await telegram.sendMessage(r.target, telegramText(r, appUrl));
      if (out.blocked) await pool.query(`SELECT auth.telegram_forget($1)`, [r.target]);
      if (out.ok || out.blocked) await noticed("telegram", r);
      if (out.ok) sent++;
    }
    return sent;
  }

  /** Проход по почте: одно письмо на человека обо всех его диалогах. */
  async function tickEmail() {
    if (!mail) return 0;
    const byMember = new Map();
    for (const r of await due("email", EMAIL)) {
      const list = byMember.get(r.member_id) ?? [];
      list.push(r);
      byMember.set(r.member_id, list);
    }
    let sent = 0;
    for (const rows of byMember.values()) {
      try {
        await mail.sendTo({ to: rows[0].target, ...emailLetter(rows, appUrl) });
      } catch (err) {
        log.error("[uklad] письмо о непрочитанном:", err.message);
        continue;
      }
      for (const r of rows) await noticed("email", r);
      sent++;
    }
    return sent;
  }

  /** Проходы по таймеру. Следующий не начинается, пока не кончился прежний. */
  function start() {
    const every = (fn, ms) => {
      let busy = false;
      setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          await fn();
        } catch (err) {
          log.error("[uklad] рассылка:", err.message);
        } finally {
          busy = false;
        }
      }, ms).unref();
    };
    every(tickTelegram, TELEGRAM.every);
    every(tickEmail, EMAIL.every);
    every(() => pool.query(`SELECT auth.chat_purge()`), 86_400_000);
  }

  return { tickTelegram, tickEmail, start };
}

module.exports = { createNotifier, telegramText, emailLetter };
