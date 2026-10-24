import { afterEach, describe, expect, it, vi } from "vitest";
import { chatNotice, showChatNotice } from "../chatNotify";

describe("chatNotice", () => {
  it("кто написал и текст, если показ текста включён", () => {
    expect(chatNotice("ООО Ромашка", "Машина  будет\nв 14:00", true, "Новое сообщение")).toEqual({
      title: "ООО Ромашка",
      body: "Машина будет в 14:00",
    });
  });

  it("только имя, если текст скрыт настройкой", () => {
    expect(chatNotice("ООО Ромашка", "Пароль от ворот 4512", false, "Новое сообщение")).toEqual({
      title: "ООО Ромашка",
      body: "Новое сообщение",
    });
  });

  it("удалённое (пустое) сообщение не даёт пустого уведомления", () => {
    expect(chatNotice("Склад", "  ", true, "Новое сообщение").body).toBe("Новое сообщение");
  });

  it("длинный текст обрезается с многоточием", () => {
    const body = chatNotice("Склад", "а".repeat(500), true, "—").body;
    expect(body.length).toBe(120);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("showChatNotice", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(permission: string, hidden: boolean) {
    const shown: { title: string; opts: NotificationOptions; onclick?: () => void }[] = [];
    class FakeNotification {
      static permission = permission;
      onclick?: () => void;
      constructor(title: string, opts: NotificationOptions) {
        shown.push(Object.assign(this, { title, opts }) as never);
      }
      close() {}
    }
    vi.stubGlobal("window", { Notification: FakeNotification, focus: vi.fn() });
    vi.stubGlobal("Notification", FakeNotification);
    vi.stubGlobal("document", { hidden });
    return shown;
  }

  it("на скрытой вкладке с разрешением показывает и по нажатию открывает переписку", () => {
    const shown = stub("granted", true);
    const open = vi.fn();
    expect(showChatNotice({ title: "Склад", body: "Привет" }, "p1", open)).toBe(true);
    expect(shown).toHaveLength(1);
    expect(shown[0].opts.tag).toBe("uklad-chat-p1");
    shown[0].onclick?.();
    expect(open).toHaveBeenCalled();
  });

  it("на открытой вкладке молчит: там уже есть тост", () => {
    const shown = stub("granted", false);
    expect(showChatNotice({ title: "Склад", body: "Привет" }, "p1", vi.fn())).toBe(false);
    expect(shown).toHaveLength(0);
  });

  it("без разрешения молчит", () => {
    const shown = stub("denied", true);
    expect(showChatNotice({ title: "Склад", body: "Привет" }, "p1", vi.fn())).toBe(false);
    expect(shown).toHaveLength(0);
  });
});
