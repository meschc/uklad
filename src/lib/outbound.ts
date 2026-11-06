import { isLoadUnit, normalizeCode } from "./barcode";
import type { FulfillmentRequest, OutboundBox, Product } from "./types";

/**
 * Короба отгрузки как данные — чистые правила.
 *
 * Упаковщик кладёт упакованное в короб отгрузки (`UK-OUT-`), и до этой правки
 * короб был только кодом: из тары товар списывался, а куда он лёг, система не
 * знала. Поэтому на погрузке «всё на месте» значило лишь «отсканировали
 * какие-то коды». Теперь у короба есть состав и заявки, а погрузка сверяет:
 * короб едет в эту машину, а не в соседнюю, и ни один короб назначения не
 * остался у стола.
 *
 * Один код может прожить несколько рейсов: этикетка назначения
 * (`targetCode`) одна на адрес, сколько ни печатай. Поэтому запись короба —
 * это «код до отгрузки»: уехавший короб закрыт, тот же код открывает новый.
 */

export interface PackedLine {
  productId: string;
  qty: number;
}

/** Открытый (ещё не уехавший) короб с этим кодом. */
export function openOutbound(list: readonly OutboundBox[], code: string): OutboundBox | undefined {
  const c = normalizeCode(code);
  return list.find((b) => !b.shipmentId && normalizeCode(b.code) === c);
}

/**
 * Дописать упакованное в короб отгрузки. Несколько тар подряд в один короб —
 * обычное дело, поэтому состав копится, а не заменяется.
 */
export function addToOutbound(
  list: readonly OutboundBox[],
  input: {
    code: string;
    lines: readonly PackedLine[];
    requestIds: readonly string[];
    staffId: string;
    at: number;
    newId: () => string;
  },
): OutboundBox[] {
  const lines = input.lines.filter((l) => l.qty > 0);
  if (lines.length === 0 && input.requestIds.length === 0) return [...list];
  const open = openOutbound(list, input.code);
  if (!open) {
    return [
      ...list,
      {
        id: input.newId(),
        code: normalizeCode(input.code),
        lines: mergeLines([], lines),
        requestIds: [...new Set(input.requestIds)],
        packedBy: [input.staffId],
        createdAt: input.at,
        updatedAt: input.at,
      },
    ];
  }
  return list.map((b) =>
    b.id === open.id
      ? {
          ...b,
          lines: mergeLines(b.lines, lines),
          requestIds: [...new Set([...b.requestIds, ...input.requestIds])],
          packedBy: b.packedBy.includes(input.staffId)
            ? b.packedBy
            : [...b.packedBy, input.staffId],
          updatedAt: input.at,
        }
      : b,
  );
}

function mergeLines(a: readonly PackedLine[], b: readonly PackedLine[]): PackedLine[] {
  const m = new Map<string, number>();
  for (const l of [...a, ...b]) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
  return [...m].map(([productId, qty]) => ({ productId, qty }));
}

/**
 * Какие короба должны уехать с этими заявками: открытые короба, где лежит
 * хотя бы одна из них. Заявки, которые паковали не на столе, коробов не
 * имеют — погрузка для них остаётся прежней, по кодам.
 */
export function expectedOutbound(
  list: readonly OutboundBox[],
  requestIds: readonly string[],
): OutboundBox[] {
  const ids = new Set(requestIds);
  return list.filter((b) => !b.shipmentId && b.requestIds.some((r) => ids.has(r)));
}

/**
 * Продавец товара: `partnerId`, у товара самого склада — пустая строка.
 * Товар, которого нет в каталоге (удалили), — отдельный неизвестный продавец:
 * иначе он тихо смешался бы с товаром склада.
 */
function sellerOf(products: readonly Product[], productId: string): string {
  const p = products.find((x) => x.id === productId);
  return p ? (p.partnerId ?? "") : `?${productId}`;
}

/** Продавцы, чей товар в этих строках. */
export function sellersOf(lines: readonly PackedLine[], products: readonly Product[]): Set<string> {
  return new Set(lines.filter((l) => l.qty > 0).map((l) => sellerOf(products, l.productId)));
}

/** Назначения заявок короба (как группирует погрузка — по тексту адреса). */
export function destinationsOf(
  requestIds: readonly string[],
  requests: readonly FulfillmentRequest[],
): Set<string> {
  const ids = new Set(requestIds);
  return new Set(requests.filter((r) => ids.has(r.id)).map((r) => r.note?.trim() || ""));
}

export type PackTargetProblem = "tote_mixed_seller" | "target_other_seller" | "target_other_target";

/**
 * Можно ли паковать эту тару в этот короб отгрузки. Решение Кирилла (24.10):
 * один короб — один продавец, иначе короб и рейс не разделить между
 * продавцами в счёте. Назначение у короба тоже одно: короб едет одной машиной.
 * Проверяется до первой штуки, а не при закрытии тары: переупаковывать
 * готовое дороже, чем взять другой короб.
 */
export function packTargetProblem(input: {
  open: OutboundBox | undefined;
  toteLines: readonly PackedLine[];
  /** Назначения заказов тары; пусто — тара без заказов (FBO). */
  toteTargets: readonly string[];
  products: readonly Product[];
  requests: readonly FulfillmentRequest[];
}): PackTargetProblem | null {
  const tote = sellersOf(input.toteLines, input.products);
  if (tote.size > 1) return "tote_mixed_seller";
  if (!input.open) return null;
  const inBox = sellersOf(input.open.lines, input.products);
  if ([...tote].some((s) => inBox.size > 0 && !inBox.has(s))) return "target_other_seller";
  const boxTargets = destinationsOf(input.open.requestIds, input.requests);
  // Поставка без заказов (FBO) и заказы с адресом едут разными машинами:
  // в один короб их не кладут.
  const boxFbo = input.open.requestIds.length === 0 && input.open.lines.length > 0;
  const toteFbo = input.toteTargets.length === 0;
  if (boxFbo !== toteFbo && (boxFbo || boxTargets.size > 0)) return "target_other_target";
  if (boxTargets.size > 0 && input.toteTargets.some((t) => !boxTargets.has(t)))
    return "target_other_target";
  return null;
}

export type LoadScan =
  | { kind: "ok"; code: string; box?: OutboundBox }
  | { kind: "dup"; code: string }
  | { kind: "not_unit"; code: string }
  /** Короб уже уехал другим рейсом. */
  | { kind: "shipped"; code: string }
  /** Короб другого назначения: в нём только чужие заявки. */
  | { kind: "foreign"; code: string; box: OutboundBox }
  /** В коробе заявки и этой машины, и другой: целиком не уедет ни одной. */
  | { kind: "mixed"; code: string; box: OutboundBox };

/**
 * Разобрать скан на погрузке. Паллеты и коробы без записи (тара с приёмки,
 * короб, собранный не на столе) принимаются как раньше: про них система не
 * знает ничего, кроме кода. Короб с записью проверяется по заявкам.
 */
export function classifyLoadScan(
  list: readonly OutboundBox[],
  requestIds: readonly string[],
  loaded: readonly string[],
  raw: string,
): LoadScan {
  const code = normalizeCode(raw);
  if (!isLoadUnit(code)) return { kind: "not_unit", code };
  if (loaded.includes(code)) return { kind: "dup", code };
  const box = openOutbound(list, code);
  if (!box) {
    const gone = list.some((b) => b.shipmentId && normalizeCode(b.code) === code);
    return gone ? { kind: "shipped", code } : { kind: "ok", code };
  }
  const ids = new Set(requestIds);
  // Короб без заявок — поставка без заказов (FBO): назначения у него нет,
  // проверить нечем, принимаем.
  const mine = box.requestIds.filter((r) => ids.has(r)).length;
  if (box.requestIds.length > 0 && mine === 0) return { kind: "foreign", code, box };
  if (mine < box.requestIds.length) return { kind: "mixed", code, box };
  return { kind: "ok", code, box };
}

/** Короба назначения, которые ещё не погрузили. */
export function missingOutbound(
  expected: readonly OutboundBox[],
  loaded: readonly string[],
): OutboundBox[] {
  const got = new Set(loaded.map(normalizeCode));
  return expected.filter((b) => !got.has(normalizeCode(b.code)));
}

/** Штук в коробе. */
export function outboundUnits(box: OutboundBox): number {
  return box.lines.reduce((n, l) => n + l.qty, 0);
}

/** Закрыть погруженные короба рейсом: дальше их код свободен. */
export function shipOutbound(
  list: readonly OutboundBox[],
  loaded: readonly string[],
  shipmentId: string,
  at: number,
): OutboundBox[] {
  const got = new Set(loaded.map(normalizeCode));
  return list.map((b) =>
    !b.shipmentId && got.has(normalizeCode(b.code))
      ? { ...b, shipmentId, shippedAt: at, updatedAt: at }
      : b,
  );
}
