import { describe, expect, it } from "vitest";
import { messages } from "../../i18n";
import { flagReasonKey } from "../opQueue";

/**
 * Отказ сервера на столе должен говорить, почему не вышло и что делать
 * (правило Кирилла 21.11), а не только «позовите старшего».
 */
describe("flagReasonKey", () => {
  it("двое на одной штуке: сборка, упаковка, приёмка, рейс, работа — своя причина", () => {
    expect(flagReasonKey(["pick_unit"], ["stock"])).toBe("ws.opPickStock");
    expect(flagReasonKey(["pack_done"], ["stock"])).toBe("ws.opPackStock");
    expect(flagReasonKey(["recv_unit"], ["tote"])).toBe("ws.opRecvTote");
    expect(flagReasonKey(["recv_place"], ["busy"])).toBe("ws.opRecvBusy");
    expect(flagReasonKey(["ship_run"], ["mixed"])).toBe("ws.opShipMixed");
    expect(flagReasonKey(["task_take"], ["taken"])).toBe("ws.opTaskTaken");
  });

  it("причина без своей фразы и перенос тары — общая фраза по виду работы", () => {
    expect(flagReasonKey(["pick_unit"], ["bad"])).toBeUndefined();
    expect(flagReasonKey(["pack_move"], ["stock"])).toBeUndefined();
    expect(flagReasonKey(["shift_mark"], ["stock"])).toBeUndefined();
  });

  it("в пачке берётся первая операция, у которой причина известна", () => {
    expect(flagReasonKey(["pick_unit", "pack_done"], ["bad", "mixed"])).toBe("ws.opPackMixed");
  });

  it("у каждой фразы есть «что делать»: не пусто и не голое «сервер не принял»", () => {
    for (const key of [
      "ws.opPickStock",
      "ws.opPickTote",
      "ws.opPickMixed",
      "ws.opPackStock",
      "ws.opPackMixed",
      "ws.opRecvTote",
      "ws.opRecvStock",
      "ws.opRecvMixed",
      "ws.opRecvBusy",
      "ws.opShipStock",
      "ws.opShipMixed",
      "ws.opTaskTaken",
      "ws.opTaskClosed",
    ] as const) {
      const ru = messages.ru[key];
      expect(ru.length).toBeGreaterThan(30);
      expect(ru).not.toMatch(/^Сервер не принял/);
    }
  });
});
