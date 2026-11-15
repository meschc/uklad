import { useEffect, useMemo, useState } from "react";
import { useEditor } from "@/lib/store";
import { hasCabinetServer } from "@/lib/data/api";
import { storageRepository } from "@/lib/data/storageRepository";
import { storageDay, storageEntries, storageTally, type StorageRow } from "@/lib/storage";
import type { OperationEntry } from "@/lib/types";
import { nowMs } from "@/lib/utils";

export type StorageStatus = "loading" | "ready" | "failed";

/**
 * Сутки хранения за период — строками журнала операций для отчёта.
 *
 * С сервером — из таблицы суток (`storageRepository`): только она помнит, что
 * лежало вчера. В демо без сервера истории нет, и честно посчитать можно
 * только сегодняшние сутки — по тому, что лежит сейчас.
 */
export function useStorageEntries(
  from: number,
  to: number,
): { entries: OperationEntry[]; status: StorageStatus } {
  const server = useEditor((s) => s.session.source === "server") && hasCabinetServer;
  const warehouseId = useEditor((s) => s.warehouse.id);
  const floors = useEditor((s) => s.warehouse.floors);
  const boxes = useEditor((s) => s.boxes);
  const products = useEditor((s) => s.products);
  const placements = useEditor((s) => s.placements);
  const [fetched, setFetched] = useState<{ key: string; rows: StorageRow[] | null }>();
  const today = storageDay(nowMs());
  const fromDay = storageDay(from);
  const toDay = [storageDay(to), today].sort()[0];
  const key = `${warehouseId}|${fromDay}|${toDay}`;

  useEffect(() => {
    if (!server) return;
    let live = true;
    void storageRepository.load(warehouseId, fromDay, toDay).then((res) => {
      if (!live) return;
      // Хранение не положено этому входу — отчёт без него, а не ошибка.
      const rows = res.ok ? (res.data === "forbidden" ? [] : res.data) : null;
      setFetched({ key, rows });
    });
    return () => {
      live = false;
    };
  }, [server, warehouseId, fromDay, toDay, key]);

  return useMemo(() => {
    if (!server) {
      const rows = storageTally({ floors, boxes, products, placements }).map((r) => ({
        ...r,
        day: today,
      }));
      return { entries: storageEntries(rows, from, to, today), status: "ready" as const };
    }
    if (fetched?.key !== key) return { entries: [], status: "loading" as const };
    if (fetched.rows === null) return { entries: [], status: "failed" as const };
    return { entries: storageEntries(fetched.rows, from, to, today), status: "ready" as const };
  }, [server, floors, boxes, products, placements, today, from, to, fetched, key]);
}
