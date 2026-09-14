import type { Box, ExpectedShipment, Pallet, ReceivingProgress, ReceivingStep } from "./types";

/**
 * Возвращение в мастер приёмки (п.4.7).
 *
 * Сохранённый ход — это ссылки на записи склада, и за время отлучки они могли
 * измениться: поставку сдал напарник, тара уехала на место, демо-данные
 * пересеялись. Восстанавливать шаг «как было» вслепую нельзя: кладовщик
 * вернулся бы на скан товара в тару, которой уже нет, и первый же скан ушёл бы
 * в пустоту — молча, потому что экран в этом случае просто ничего не рисует.
 *
 * Поэтому ход сверяется с данными и подтягивается назад ровно настолько,
 * насколько нужно, чтобы каждый шаг снова опирался на существующее.
 */

/** Шаги по порядку — он же список допустимых значений для восстановления. */
export const RECEIVING_STEPS: ReceivingStep[] = [
  "shipment",
  "pallet",
  "box",
  "product",
  "qty",
  "place",
];

/** Мастер с чистого листа. */
export const EMPTY_RECEIVING: ReceivingProgress = {
  step: "shipment",
  shipmentId: null,
  staffId: "",
  palletId: null,
  boxId: null,
  received: 0,
};

/** Записи склада, на которые ссылается ход мастера. */
interface ReceivingData {
  expectedShipments: ExpectedShipment[];
  boxes: Box[];
  pallets: Pallet[];
}

export function resumeProgress(
  saved: ReceivingProgress | null | undefined,
  data: ReceivingData,
): ReceivingProgress {
  // Шов с хранилищем (п.0.4): сюда приходит то, что лежало в localStorage.
  // Ход без понятного шага — не ход, и начинать приёмку лучше заново, чем с
  // экрана, которого нет.
  if (!saved || !RECEIVING_STEPS.includes(saved.step)) return EMPTY_RECEIVING;

  const shipment = saved.shipmentId
    ? data.expectedShipments.find((s) => s.id === saved.shipmentId)
    : null;

  // Поставки больше нет или её уже сдали. Продолжать «в неё» нельзя: сверять
  // не с чем, и каждый скан тихо превратился бы во внеплановую приёмку. Кто
  // принимает — оставляем: человек за смену не сменился.
  if (saved.shipmentId && (!shipment || shipment.status === "closed")) {
    return { ...EMPTY_RECEIVING, staffId: saved.staffId };
  }

  const pallet = saved.palletId ? data.pallets.find((p) => p.id === saved.palletId) : null;
  const box = saved.boxId ? data.boxes.find((b) => b.id === saved.boxId) : null;
  // Тара с адресом уже уехала на место — доливать в неё нельзя. То же правило,
  // что и на скане тары: это почти всегда промах мимо нужного ярлыка.
  const open = box && !box.address ? box : null;

  return {
    ...saved,
    palletId: pallet?.id ?? null,
    boxId: open?.id ?? null,
    received: Number.isFinite(saved.received) ? saved.received : 0,
    step: resumeStep(saved.step, !!open),
  };
}

/** Самый дальний шаг, под которым ещё есть опора. */
function resumeStep(step: ReceivingStep, hasBox: boolean): ReceivingStep {
  // Количество вводят для товара, опознанного сканом, а он живёт только в
  // памяти экрана. Возвращаемся на скан товара, а не на форму без товара.
  const target = step === "qty" ? "product" : step;
  if (!hasBox && (target === "product" || target === "place")) return "box";
  return target;
}
