import { describe, expect, it, vi } from "vitest";
import { makeBackup, parseBackup } from "../../backup";
import { PERSIST_KEY, PERSIST_VERSION } from "../../store";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createBackupRepository, type PersistTarget } from "../backupRepository";

/**
 * Резервная копия через подменённый порт и подменённое хранилище. Главное, что
 * закрепляем: восстановление отказывает на любом сомнении ДО записи — иначе
 * чужой файл стёр бы данные склада.
 */

function setup(tariff: "operator" | "warehouse" | "start" = "warehouse") {
  const markBackupDone = vi.fn();
  const updateBackupSettings = vi.fn();
  const state = {
    warehouse: { id: "w1", name: "Склад", floors: [] },
    subscription: { tariff, backup: { remindEveryDays: 7, emailWeekly: false } },
    markBackupDone,
    updateBackupSettings,
  } as unknown as EditorState;
  const port: StorePort = { get: () => state, set: () => {} };
  const writes: [string, string][] = [];
  const target: PersistTarget = { write: (k, v) => void writes.push([k, v]) };
  return {
    repo: createBackupRepository(port, target),
    markBackupDone,
    updateBackupSettings,
    writes,
  };
}

describe("createBackupRepository", () => {
  it("архив содержит данные склада и отмечает копию сделанной", async () => {
    const { repo, markBackupDone } = setup();
    const res = await repo.exportArchive(Date.UTC(2026, 9, 21));

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.fileName).toBe("uklad-backup-2026-10-21.json");
    const parsed = parseBackup(res.data.text, PERSIST_VERSION);
    expect(parsed.ok && parsed.file.state.warehouse).toMatchObject({ id: "w1" });
    expect(markBackupDone).toHaveBeenCalledWith(Date.UTC(2026, 9, 21));
  });

  it("скачанный архив восстанавливается в хранилище персиста", async () => {
    const { repo, writes } = setup();
    const exported = await repo.exportArchive();
    if (!exported.ok) throw new Error("архив не собрался");

    const res = await repo.restoreArchive(exported.data.text);

    expect(res.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe(PERSIST_KEY);
    expect(JSON.parse(writes[0][1])).toMatchObject({
      version: PERSIST_VERSION,
      state: { warehouse: { id: "w1" } },
    });
  });

  it.each([
    ["не JSON", "привет", "backup.err.notJson"],
    ["чужой JSON", JSON.stringify({ a: 1 }), "backup.err.format"],
    [
      "копия из новой версии",
      JSON.stringify(makeBackup({ warehouse: {} }, PERSIST_VERSION + 1, 0)),
      "backup.err.version",
    ],
    ["архив без склада", JSON.stringify(makeBackup({}, PERSIST_VERSION, 0)), "backup.err.empty"],
  ])("%s — отказ и ничего не записано", async (_, text, error) => {
    const { repo, writes } = setup();
    expect(await repo.restoreArchive(text)).toEqual({ ok: false, error });
    expect(writes).toHaveLength(0);
  });

  it("копию на почту не включить на тарифе без неё", async () => {
    const { repo, updateBackupSettings } = setup("start");
    expect(await repo.setWeeklyEmail(true)).toEqual({ ok: false, error: "backup.err.tariff" });
    expect(updateBackupSettings).not.toHaveBeenCalled();
  });

  it("на «Складе» копия на почту включается", async () => {
    const { repo, updateBackupSettings } = setup("warehouse");
    expect((await repo.setWeeklyEmail(true)).ok).toBe(true);
    expect(updateBackupSettings).toHaveBeenCalledWith({ emailWeekly: true });
  });

  it("отправка на почту без сервера — честный отказ", async () => {
    const { repo } = setup();
    expect(await repo.sendByEmail()).toEqual({ ok: false, error: "backup.err.noServer" });
  });
});
