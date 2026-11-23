import { describe, expect, test } from "vitest";
import { persistedState, useEditor } from "../index";
import { workstationRepository } from "../../data";

/**
 * Обход столов 15.11: остановку сортировки после повторного скана снимала
 * перезагрузка страницы — состояние жило в useState экрана. Теперь оно в
 * сохраняемом сторе устройства и снимается только явно (бейджем старшего).
 */
describe("Остановка стола", () => {
  test("ставится и снимается через репозиторий и переживает перезагрузку", async () => {
    await workstationRepository.lockStation("sort", "UK-OUT-7");
    expect(useEditor.getState().stationLock).toEqual({ station: "sort", code: "UK-OUT-7" });
    expect(persistedState(useEditor.getState()).stationLock).toEqual({
      station: "sort",
      code: "UK-OUT-7",
    });
    await workstationRepository.lockStation("sort", null);
    expect(useEditor.getState().stationLock).toBeNull();
  });

  test("выход со стола остановку не снимает", async () => {
    await workstationRepository.lockStation("ship", "UK-PLT-1");
    useEditor.getState().stationLogout();
    expect(useEditor.getState().stationLock?.code).toBe("UK-PLT-1");
  });
});
