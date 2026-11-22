/**
 * Сборка операциями (миграция 017, `deskOps.js`).
 *
 * Стол присылает факты сборки, а не снимок: «штука снята с этого места в
 * эту тару под эту заявку» и «заявка собрана». Сервер сам повторяет правку
 * снимка по правилам браузера (`recordPick`, `completeRequest`,
 * `pickToteProblem`) и пропускает её через общие правила записи стола
 * (`mergeDeskWrite`: кто за столом, ход заявки, точная сверка остатков).
 * Поэтому со стола нельзя ни снять штуку, которой нет на месте, ни положить
 * её в чужую тару, ни собрать больше, чем просили.
 *
 * Каждая снятая штука — запись в журнале сотрудника (`pick_scan`): кто,
 * что, откуда и в какую тару, до секунды. По ней же отсеивается повтор, если
 * та же штука уже пришла снимком.
 */

/* global module, require */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */
const { INVENTORY_KINDS } = require("./deskInventory");
const { freeInBox } = require("./overageHold");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const isId = (v) => typeof v === "string" && ID_RE.test(v);

/** Как `addressKey` в `lib/address.ts`: этаж в ключ не входит. */
const cellKey = (a) =>
  isObject(a) && isId(a.moduleId) && Number.isInteger(a.shelfIndex) && Number.isInteger(a.cellIndex)
    ? `${a.moduleId}:${a.shelfIndex}:${a.cellIndex}`
    : null;

const OPEN = new Set(["new", "in_progress"]);
const target = (r) => String(r.note ?? "").trim();

/** Почему в эту тару нельзя (`pickToteProblem`): null — можно. */
function toteProblem(data, tote, request) {
  if (tote.address || tote.sealed) return "tote";
  // Тара сборки — пустая или та, в которую уже собирают открытые заявки:
  // принятое и не разложенное в заказ не уходит (`pickToteProblem`).
  const collecting = list(data.requests).some(
    (r) =>
      r.toteId === tote.id && !r.packedAt && r.status !== "shipped" && r.status !== "cancelled",
  );
  if (list(tote.lines).some((l) => Number(l.qty) > 0) && !collecting) return "tote";
  const partner = new Map(list(data.products).map((p) => [p.id, p.partnerId ?? ""]));
  const seller = (id) => (partner.has(id) ? partner.get(id) : `?${id}`);
  const own = seller(request.productId);
  for (const l of list(tote.lines)) {
    if (Number(l.qty) > 0 && seller(l.productId) !== own) return "mixed";
  }
  const other = list(data.requests).some(
    (r) =>
      r.toteId === tote.id &&
      !r.packedAt &&
      r.status !== "shipped" &&
      r.status !== "cancelled" &&
      target(r) !== target(request),
  );
  return other ? "mixed" : null;
}

const addLine = (lines, productId, n) => {
  const rows = list(lines);
  return rows.some((l) => l.productId === productId)
    ? rows.map((l) => (l.productId === productId ? { ...l, qty: Number(l.qty) + n } : l))
    : [...rows, { productId, qty: n }];
};

/**
 * Одна снятая штука: с места (короб в ячейке или прямое размещение) в тару
 * сборки, счётчик заявки +1. Возвращает правку снимка или причину пометки.
 */
function applyPickUnit(data, body, staffRef) {
  const events = list(data.staffEvents);
  // Та же штука уже пришла снимком (после обрыва он мог уйти раньше
  // операции): второй раз с полки её не снять.
  if (events.some((e) => e.id === body.eventId)) return { data };
  const key = cellKey(body.cell);
  if (!isId(body.requestId) || !isId(body.productId) || !isId(body.toteId) || !key) {
    return { flag: "bad" };
  }
  const requests = list(data.requests);
  const req = requests.find((r) => r.id === body.requestId);
  if (!req || req.productId !== body.productId || !OPEN.has(req.status)) return { flag: "bad" };
  const picked = Number(req.pickedQty) || 0;
  if (picked >= (Number(req.qty) || 0)) return { flag: "stock" };
  // Начатая заявка собирается в свою тару.
  if (picked > 0 && req.toteId !== body.toteId) return { flag: "tote" };
  const boxes = list(data.boxes);
  const tote = boxes.find((b) => b.id === body.toteId);
  if (!tote) return { flag: "bad" };
  const problem = toteProblem(data, tote, req);
  if (problem) return { flag: problem };

  // Откуда: первый короб в этой ячейке с этим товаром, иначе прямое
  // размещение — тот же порядок, что у `recordPick`.
  // Тара с нерешённым расхождением инвентаризации заморожена (`deskInventory.js`).
  const frozen = new Set(
    list(data.disputes)
      .filter((d) => !d.resolution && INVENTORY_KINDS.has(d.kind))
      .map((d) => d.boxId),
  );
  // Излишек с приёмки в карантине (`heldQty`): пока старший не решил, его
  // штуки лежат в таре, но в сборку не идут.
  const from = boxes.find(
    (b) =>
      b !== tote &&
      !frozen.has(b.id) &&
      b.address &&
      cellKey(b.address) === key &&
      freeInBox(data.disputes, b, body.productId) > 0,
  );
  const placements = isObject(data.placements) ? data.placements : {};
  const placed = cellKey(placements[body.productId]) === key;
  if (!from && !placed) return { flag: "stock" };

  const at = body.at;
  const nextBoxes = boxes.map((b) => {
    if (b === from) {
      return {
        ...b,
        lines: list(b.lines)
          .map((l) => (l.productId === body.productId ? { ...l, qty: Number(l.qty) - 1 } : l))
          .filter((l) => Number(l.qty) > 0),
      };
    }
    if (b === tote) return { ...b, lines: addLine(b.lines, body.productId, 1) };
    return b;
  });
  const out = {
    ...data,
    boxes: nextBoxes,
    requests: requests.map((r) =>
      r === req
        ? {
            ...r,
            pickedQty: picked + 1,
            toteId: tote.id,
            status: "in_progress",
            startedAt: r.startedAt ?? at,
            updatedAt: at,
          }
        : r,
    ),
    staffEvents: [
      ...events,
      {
        id: body.eventId,
        staffId: staffRef,
        type: "pick_scan",
        at,
        station: "picking",
        productId: body.productId,
        code: String(tote.barcode ?? "").slice(0, 100),
        // Откуда и под какую заявку: по этому отмена (`applyPickUndo`)
        // возвращает штуку туда, откуда её сняли, а не «куда-нибудь».
        requestId: body.requestId,
        cell: {
          ...(isId(body.cell.floorId) ? { floorId: body.cell.floorId } : {}),
          moduleId: body.cell.moduleId,
          shelfIndex: body.cell.shelfIndex,
          cellIndex: body.cell.cellIndex,
        },
        ...(from ? { boxId: from.id } : {}),
      },
    ],
  };
  if (!from) {
    const rest = { ...placements };
    delete rest[body.productId];
    out.placements = rest;
  }
  return { data: out };
}

/**
 * Заявка собрана: целиком или частично (меньше запрошенного, отмечено
 * явно). Бронь под поставку стол не трогает — её, как и сейчас при записи
 * снимка, снимает кабинет (`releaseReservation`): бронь не ход работы.
 */
function applyPickDone(data, body) {
  if (!isId(body.requestId)) return { flag: "bad" };
  const requests = list(data.requests);
  const req = requests.find((r) => r.id === body.requestId);
  if (!req) return { flag: "bad" };
  // Уже собрана (пришло снимком) — это она.
  if (req.status === "done" && Boolean(req.partial) === Boolean(body.partial)) return { data };
  if (!OPEN.has(req.status)) return { flag: "bad" };
  const picked = Number(req.pickedQty) || 0;
  const qty = Number(req.qty) || 0;
  // Целиком — только собрав всё; частично — собрав хоть что-то.
  if (body.partial ? picked < 1 : picked < qty) return { flag: "stock" };
  return {
    data: {
      ...data,
      requests: requests.map((r) =>
        r === req
          ? {
              ...r,
              status: "done",
              partial: Boolean(body.partial),
              pickedAt: r.pickedAt ?? body.at,
              updatedAt: body.at,
            }
          : r,
      ),
    },
  };
}

/**
 * Отмена снятой штуки (`pick_undo`): сборщик ошибся — положил не в ту тару,
 * снял лишнюю, тара переполнена. Штука возвращается из тары сборки в тот же
 * короб, из которого её сняли, собранное по заявке −1. Отменить можно только
 * свой скан, пока заявка не упакована и штука ещё в таре. Сам скан из
 * журнала не исчезает: рядом ложится `pick_undo` со ссылкой на него — разбор
 * «кто что снимал» видит и ошибку, и исправление.
 *
 * Правило «собранное со стола только растёт» (`mergeRequests`) общая сверка
 * не отменяет: она проверяет только товар (короб +1, тара −1). Ход заявки
 * назад сервер правит сам после сверки (`post`), по своей проверке выше.
 */
function applyPickUndo(data, body, staffRef) {
  const events = list(data.staffEvents);
  if (!isId(body.pickId)) return { flag: "bad" };
  if (events.some((e) => e.id === body.eventId)) return { data };
  // Уже отменён (повтор, другим ключом) — снимать второй раз нечего.
  if (events.some((e) => e.type === "pick_undo" && e.undoes === body.pickId)) return { data };
  const pick = events.find((e) => e.id === body.pickId && e.type === "pick_scan");
  if (!pick) return { flag: "bad" };
  if (pick.staffId !== staffRef) return { flag: "not_yours" };
  // Скан до этой правки не помнит, откуда сняли; с прямого размещения
  // вернуть нельзя — его ставит только руководитель (`mergePlacements`).
  const key = cellKey(pick.cell);
  if (!isId(pick.requestId) || !key) return { flag: "old" };
  if (!isId(pick.boxId)) return { flag: "place" };
  const requests = list(data.requests);
  const req = requests.find((r) => r.id === pick.requestId);
  const picked = Number(req?.pickedQty) || 0;
  if (!req || req.packedAt || !UNDO_OPEN.has(req.status) || picked < 1) return { flag: "late" };
  const boxes = list(data.boxes);
  const tote = boxes.find((b) => b.id === req.toteId);
  const inTote = list(tote?.lines).find((l) => l.productId === pick.productId);
  if (!tote || !(Number(inTote?.qty) > 0)) return { flag: "late" };
  // Короб уехал с места, ушёл в работу или заморожен пересчётом — вернуть
  // «на место» уже нельзя: штуку разбирает старший.
  const frozen = list(data.disputes).some(
    (d) => !d.resolution && INVENTORY_KINDS.has(d.kind) && d.boxId === pick.boxId,
  );
  const from = boxes.find((b) => b.id === pick.boxId);
  if (!from || from === tote || frozen || cellKey(from.address) !== key) return { flag: "moved" };

  const at = body.at;
  const nextBoxes = boxes.map((b) => {
    if (b === from) return { ...b, lines: addLine(b.lines, pick.productId, 1) };
    if (b === tote) {
      return {
        ...b,
        lines: list(b.lines)
          .map((l) => (l.productId === pick.productId ? { ...l, qty: Number(l.qty) - 1 } : l))
          .filter((l) => Number(l.qty) > 0),
      };
    }
    return b;
  });
  const out = {
    ...data,
    boxes: nextBoxes,
    staffEvents: [
      ...events,
      {
        id: body.eventId,
        staffId: staffRef,
        type: "pick_undo",
        at,
        station: "picking",
        productId: pick.productId,
        code: String(tote.barcode ?? "").slice(0, 100),
        requestId: req.id,
        undoes: pick.id,
      },
    ],
  };
  const post = (merged) => ({
    ...merged,
    requests: list(merged.requests).map((r) => (r.id === req.id ? stepBack(r, picked, at) : r)),
  });
  return { data: out, post };
}

/** Где можно отменить скан: собирается или собрана, но ещё не упакована. */
const UNDO_OPEN = new Set(["new", "in_progress", "done"]);

/**
 * Заявка на шаг назад: собранное −1. Собранная снова собирается; вернули
 * последнюю штуку — заявка снова новая и свободна от тары.
 */
function stepBack(r, picked, at) {
  const left = picked - 1;
  const out = { ...r, pickedQty: left, updatedAt: at };
  if (r.status === "done") {
    delete out.partial;
    delete out.pickedAt;
  }
  if (left === 0) {
    out.status = "new";
    delete out.toteId;
  } else out.status = "in_progress";
  return out;
}

module.exports = { applyPickUnit, applyPickDone, applyPickUndo, cellKey };
