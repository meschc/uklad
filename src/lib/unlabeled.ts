import { findProduct, normalizeCode } from "./barcode";
import { TARGET_PREFIX } from "./packing";
import type { OutboundBox, Product } from "./types";

/**
 * Товар без этикетки на сортировке — чистые правила.
 *
 * Как это случается. Стол упаковки не пустит дальше, пока этикетка штуки не
 * отсканирована. Но программа не видит, наклеена ли она: упаковщик может
 * отсканировать этикетку прямо с ленты принтера и отложить товар без неё.
 * Потом та этикетка, что лежит на столе, уходит на следующий товар, его
 * этикетка — на следующий, и так по цепочке: первый товар остаётся голым,
 * а у остальных посылок тары этикетки чужие.
 *
 * Что делает сортировщик. Сканирует штрихкод самого товара. Мы показываем
 * открытые посылки с этим товаром: чья это этикетка. Если её посылку уже
 * разложили, значит, эту этикетку носит другой товар. Следом идут этикетки,
 * упакованные перед ней и после в той же таре: по ним и ищут, куда ушла
 * этикетка. Этикетка штуки
 * (`UK-LBL-<сессия>-<номер>`) несёт порядковый номер упаковки, поэтому
 * «после» известно точно; у этикетки заказа номера нет — показываем всю тару.
 */

/**
 * Сколько соседей показываем. Чаще всего ошибка — одна посылка: товар упаковали
 * без скана, а этикетку отложенного клеят на него (сценарий Кирилла 20.11).
 * Сдвиг цепочкой реже, его видно по первым же соседям.
 */
const BEFORE_MAX = 1;
const AFTER_MAX = 3;

const UNIT_RE = /^UK-LBL-([A-Z0-9]{1,4})-(\d{1,5})$/;

interface UnlabeledLead {
  /** Посылка, чья это может быть этикетка. */
  box: OutboundBox;
  /** Уже лежит в месте сортировки: эту этикетку носит другой товар. */
  sorted: boolean;
  /** Упакована перед ней в той же таре. */
  before: OutboundBox[];
  /** Упакованы после неё в той же таре: этикетка могла уйти на них. */
  after: OutboundBox[];
  /** Порядок упаковки известен (этикетки штук); нет — `after` это вся тара. */
  ordered: boolean;
}

export interface UnlabeledScan {
  product: Product;
  leads: UnlabeledLead[];
}

/** Посылка к сортировке: этикетка штуки или заказа, не короб поставки и не грузовое место. */
function isOpenParcel(b: OutboundBox): boolean {
  return !b.shipmentId && !b.place && !normalizeCode(b.code).startsWith(TARGET_PREFIX);
}

/** Одна тара: посылки закрываются вместе, одним временем и одним упаковщиком. */
function sameTote(a: OutboundBox, b: OutboundBox): boolean {
  return a.createdAt === b.createdAt && a.packedBy[0] === b.packedBy[0];
}

function unitSeq(code: string): { session: string; n: number } | null {
  const m = UNIT_RE.exec(normalizeCode(code));
  return m ? { session: m[1], n: Number(m[2]) } : null;
}

/** Соседи `box` по таре — в порядке упаковки. */
function neighbours(
  list: readonly OutboundBox[],
  box: OutboundBox,
): Pick<UnlabeledLead, "before" | "after" | "ordered"> {
  const tote = list.filter((b) => b.id !== box.id && isOpenParcel(b) && sameTote(b, box));
  const own = unitSeq(box.code);
  if (!own) return { before: [], after: tote.slice(0, AFTER_MAX + BEFORE_MAX), ordered: false };
  const ranked = tote
    .map((b) => ({ b, seq: unitSeq(b.code) }))
    .filter(
      (x): x is { b: OutboundBox; seq: { session: string; n: number } } =>
        x.seq?.session === own.session,
    )
    .sort((x, y) => x.seq.n - y.seq.n);
  return {
    before: ranked
      .filter((x) => x.seq.n < own.n)
      .slice(-BEFORE_MAX)
      .map((x) => x.b),
    after: ranked
      .filter((x) => x.seq.n > own.n)
      .slice(0, AFTER_MAX)
      .map((x) => x.b),
    ordered: true,
  };
}

/**
 * Скан на сортировке оказался штрихкодом товара, а не посылки: найти, чью
 * этикетку он потерял. `null` — это не товар склада.
 */
export function findUnlabeled(
  list: readonly OutboundBox[],
  products: readonly Product[],
  raw: string,
): UnlabeledScan | null {
  const product = findProduct(products, raw);
  if (!product) return null;
  const leads = list
    .filter((b) => isOpenParcel(b) && b.lines.some((l) => l.productId === product.id && l.qty > 0))
    .map((box) => ({ box, sorted: !!box.sortCode, ...neighbours(list, box) }))
    // Уже разложенная — главная подозреваемая, потом свежие.
    .sort((a, b) => Number(b.sorted) - Number(a.sorted) || b.box.createdAt - a.box.createdAt);
  return { product, leads };
}
