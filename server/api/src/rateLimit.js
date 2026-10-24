/**
 * Лимит частоты на форму — «ведро с жетонами» по адресу клиента.
 *
 * Аудит 21.10, п.4: без лимита один скрипт забивает почту сотней заявок в
 * минуту. Счётчики живут в памяти процесса: сервер один, и обнулённый после
 * перезапуска лимит — не беда. IP здесь только ключ счётчика, на диск он не
 * попадает (152-ФЗ: не собираем лишнего).
 *
 * Перед сервером стоит Caddy, поэтому настоящий адрес приходит заголовком
 * `X-Forwarded-For`. Доверяем ему, только если `TRUST_PROXY=1`: иначе любой
 * подставит себе свежий IP на каждый запрос и лимит потеряет смысл.
 */
/* global module */

function createRateLimit({ capacity, refillPerMinute, now = () => Date.now() }) {
  const buckets = new Map();
  const perMs = refillPerMinute / 60_000;

  function take(key) {
    const t = now();
    const b = buckets.get(key) ?? { tokens: capacity, at: t };
    b.tokens = Math.min(capacity, b.tokens + (t - b.at) * perMs);
    b.at = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    buckets.set(key, b);
    // Память не растёт без конца: почти полные вёдра можно забыть.
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.tokens >= capacity - 1) buckets.delete(k);
    }
    return ok;
  }

  return { take };
}

function clientIp(req, trustProxy) {
  if (trustProxy) {
    // Caddy дописывает адрес клиента последним; всё левее мог прислать сам клиент.
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd) return fwd.split(",").pop().trim();
  }
  return req.socket.remoteAddress ?? "";
}

module.exports = { createRateLimit, clientIp };
