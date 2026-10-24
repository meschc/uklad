/**
 * МойСклад, JSON API 1.2: учётная система селлера.
 *
 * Ключ — токен (Bearer) из «Настройки → Токены». Базовый адрес:
 * https://api.moysklad.ru/api/remap/1.2. Сервер добавляет обязательный
 * `Accept-Encoding: gzip` — без него МойСклад отвечает 415 (проверено
 * 23.10.2026 на живом адресе).
 *
 * Заказы покупателей приходят складу как задания на сборку, остатки склад
 * отдаёт обратно корректировкой — а это документ «Инвентаризация» с
 * подписью ответственного селлера, поэтому `stocks.push` у МоегоСклада нет:
 * селлер видит наши остатки в Укладе и в отчёте, а учёт правит сам.
 */

import { ok, type Result } from "../data/result";
import type { ConnectorTransport } from "./transport";
import type { Connector, ExternalOrder } from "./types";

interface MsPosition {
  quantity?: number;
  assortment?: { id?: string; article?: string; code?: string };
}
interface MsOrder {
  name: string;
  moment?: string;
  deliveryPlannedMoment?: string;
  positions?: { rows?: MsPosition[] };
}

/** Время МоегоСклада `ГГГГ-ММ-ДД ЧЧ:ММ:СС[.ммм]` (Москва) → ISO. */
export function msDateToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/.exec(value);
  return m ? `${m[1]}T${m[2]}+03:00` : value;
}

/** Ответ `GET /entity/customerorder?expand=positions.assortment` → заказы. */
export function mapMoyskladOrders(payload: unknown): ExternalOrder[] {
  const rows = (payload as { rows?: MsOrder[] } | null)?.rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((o) => o && typeof o.name === "string")
    .map((o) => ({
      system: "moysklad" as const,
      externalId: o.name,
      createdAt: msDateToIso(o.moment) ?? "",
      shipBy: msDateToIso(o.deliveryPlannedMoment),
      lines: (o.positions?.rows ?? []).map((p) => ({
        externalSku: p.assortment?.id ?? "",
        vendorCode: p.assortment?.article ?? p.assortment?.code,
        qty: p.quantity ?? 0,
        requiresMarks: false,
      })),
    }));
}

export function createMoyskladConnector(transport: ConnectorTransport, account: string): Connector {
  return {
    system: "moysklad",
    capabilities: ["orders.fetch"],

    async fetchOrders(): Promise<Result<ExternalOrder[]>> {
      const res = await transport.request({
        system: "moysklad",
        account,
        method: "GET",
        path: "/entity/customerorder",
        // Только проведённые и не отгруженные: остальное складу собирать рано.
        query: { expand: "positions.assortment", filter: "applicable=true", limit: 100 },
      });
      return res.ok ? ok(mapMoyskladOrders(res.data)) : res;
    },
  };
}
