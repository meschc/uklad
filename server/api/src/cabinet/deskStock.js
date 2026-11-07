/**
 * Остатки со стола: сверка до и после записи.
 *
 * Пока кабинет живёт снимком (ADR 0010), стол присылает тару, короба
 * отгрузки и размещения целиком. Без сверки за столом можно было бы
 * «нарисовать» товар в таре или тихо убрать его. Таблиц остатков ещё нет,
 * поэтому сервер сверяет движение по каждому товару:
 *
 *   ушло из тары (D) = принято новыми событиями приёмки − прирост в таре.
 *
 * Товар уходит из тары только в работу: в собранное по заявкам (`pickedQty`),
 * в короб отгрузки, в списание недостачи (решение старшего) или снятием
 * размещения со склада. Поэтому
 *
 *   Δ коробов отгрузки + min(0, Δ собранного) − снято размещений
 *     ≤ D ≤
 *   Δ коробов отгрузки + max(0, Δ собранного) + списано + снято размещений.
 *
 * Собранное в тару (у заявки есть `toteId`) в эти границы не входит: штука
 * осталась в коробах, только переехала с полки в тару. Зато прирост
 * собранного в тару должен найтись приростом в этой таре (или в коробе
 * отгрузки, если упаковали в той же записи).
 *
 * Левая граница не даёт создать товар (в таре или в коробе отгрузки) из
 * ничего, правая — убрать его без следа. Перекладывание между тарами сумму не
 * меняет. Кроссдок проходит: принятое сразу закрывает заявки, и тара с
 * собранным растут вместе.
 *
 * Отдельно, по записям:
 *   · события приёмки только дописываются, только за того, кто за столом, и
 *     только на товар из каталога;
 *   · рейсы только дописываются: уехавшее не перепишешь;
 *   · уехавший короб отгрузки не меняется, открытый не удаляется и не худеет;
 *   · размещение стол может только снять (сборка с ячейки), а не поставить.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const byId = (v) => new Map(list(v).map((x) => [x.id, x]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Сколько штук в строках — по товарам; `sign` = −1 вычитает. */
function linesBy(rows, out = new Map(), sign = 1) {
  for (const row of rows) {
    for (const l of list(row.lines)) {
      out.set(l.productId, (out.get(l.productId) ?? 0) + sign * num(l.qty));
    }
  }
  return out;
}

/** Дописать новые записи, прежние оставить как были. */
function appendOnly(current, incoming, allow) {
  const known = byId(current);
  const added = list(incoming).filter(
    (x) => typeof x.id === "string" && !known.has(x.id) && allow(x),
  );
  return [...list(current), ...added];
}

/** Короба отгрузки: уехавший не меняется, открытый не удаляется и не худеет. */
function mergeOutbound(current, incoming) {
  if (!Array.isArray(incoming)) return list(current);
  const next = byId(incoming);
  const kept = list(current).map((b) => {
    const n = next.get(b.id);
    if (!n || b.shipmentId) return b;
    const now = linesBy([n]);
    for (const [p, q] of linesBy([b])) if ((now.get(p) ?? 0) < q) return b;
    return n;
  });
  const known = byId(current);
  const fresh = list(incoming).filter((b) => typeof b.id === "string" && !known.has(b.id));
  return [...kept, ...fresh];
}

/** Размещения: стол только снимает (сборка с ячейки), не ставит и не двигает. */
function mergePlacements(current, incoming) {
  const cur = isObject(current) ? current : {};
  if (!isObject(incoming)) return cur;
  const out = {};
  for (const [p, addr] of Object.entries(cur)) if (p in incoming) out[p] = addr;
  return out;
}

const add = (m, k, n) => m.set(k, (m.get(k) ?? 0) + n);
const WRITE_OFF = new Set(["shortage", "not_packable"]);

/**
 * Свести остатки стола. `merged` — запись после остальных правил (заявки и
 * спорное уже сверены), `current` — что на сервере. Возвращает поля, которые
 * стол пишет по своим правилам, и товары, по которым движение не сошлось.
 */
function mergeDeskStock(current, merged, people) {
  const catalog = new Set(list(current.products).map((p) => p.id));
  const receivingEvents = appendOnly(
    current.receivingEvents,
    merged.receivingEvents,
    (e) =>
      people.present.has(e.staffId) &&
      Number.isInteger(e.qty) &&
      e.qty > 0 &&
      e.qty <= 100_000 &&
      catalog.has(e.productId),
  );
  const shipments = appendOnly(current.shipments, merged.shipments, (s) =>
    people.present.has(s.staffId),
  );
  const outboundBoxes = mergeOutbound(current.outboundBoxes, merged.outboundBoxes);
  const placements = mergePlacements(current.placements, merged.placements);
  const out = { receivingEvents, shipments, outboundBoxes, placements };

  // По каждому товару: сколько ушло из тары и куда это могло уйти.
  const boxNet = linesBy(list(current.boxes), linesBy(list(merged.boxes)), -1);
  const outNet = linesBy(list(current.outboundBoxes), linesBy(outboundBoxes), -1);
  const received = new Map();
  const knownEvents = byId(current.receivingEvents);
  for (const e of receivingEvents) if (!knownEvents.has(e.id)) add(received, e.productId, e.qty);
  // Собранное без тары уходит из коробов («снято в заявку»), собранное в
  // тару остаётся в коробах: полка −1, тара +1. Поэтому второе не даёт
  // права убрать товар, а должно найтись в таре (или уже в коробе отгрузки).
  const picked = new Map();
  const pickedToTote = new Map();
  const totes = new Set();
  const before = byId(current.requests);
  for (const r of list(merged.requests)) {
    const d = num(r.pickedQty) - num(before.get(r.id)?.pickedQty);
    if (!d) continue;
    if (r.toteId) {
      add(pickedToTote, r.productId, d);
      totes.add(r.toteId);
    } else add(picked, r.productId, d);
  }
  const toteGain = new Map();
  const wasBox = byId(current.boxes);
  for (const b of list(merged.boxes)) {
    if (!totes.has(b.id)) continue;
    const was = linesBy(wasBox.has(b.id) ? [wasBox.get(b.id)] : []);
    for (const [p, q] of linesBy([b])) {
      if (q > (was.get(p) ?? 0)) add(toteGain, p, q - (was.get(p) ?? 0));
    }
  }
  const writtenOff = new Map();
  const wasOpen = byId(current.disputes);
  for (const d of list(merged.disputes)) {
    const prev = wasOpen.get(d.id);
    // Списать можно недостачу и брак: и то и другое лежит в таре на учёте.
    if (prev && !prev.resolution && d.resolution === "written_off" && WRITE_OFF.has(d.kind)) {
      add(writtenOff, d.productId, num(d.qty));
    }
  }
  const unplaced = new Map();
  for (const p of Object.keys(isObject(current.placements) ? current.placements : {})) {
    if (!(p in placements)) unplaced.set(p, 1);
  }

  const ids = new Set([
    ...boxNet.keys(),
    ...outNet.keys(),
    ...received.keys(),
    ...picked.keys(),
    ...pickedToTote.keys(),
  ]);
  const mismatch = [];
  for (const p of ids) {
    const left = (received.get(p) ?? 0) - (boxNet.get(p) ?? 0);
    const o = outNet.get(p) ?? 0;
    const pk = picked.get(p) ?? 0;
    // Снятое с ячейки могло лечь в тару сборки: это не товар из ничего.
    const lo = o + Math.min(0, pk) - (unplaced.get(p) ?? 0);
    const hi = o + Math.max(0, pk) + (writtenOff.get(p) ?? 0) + (unplaced.get(p) ?? 0);
    const intoTote = (pickedToTote.get(p) ?? 0) > (toteGain.get(p) ?? 0) + Math.max(0, o);
    if (o < 0 || left < lo || left > hi || intoTote) mismatch.push(p);
  }
  return { out, mismatch };
}

/**
 * Что откатывается целиком, если движение не сошлось: вся работа с товаром.
 * Отметки смены и задания остаются — от остатков они не зависят.
 */
const STOCK_KEYS = [
  "expectedShipments",
  "receivingEvents",
  "boxes",
  "pallets",
  "boxSeq",
  "palletSeq",
  "receiving",
  "requests",
  "shipments",
  "placements",
  "outboundBoxes",
  "disputes",
];

module.exports = { mergeDeskStock, STOCK_KEYS };
