import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Приёмник — CommonJS в своей папке, в сборку витрины не входит.
const { parseLead } = createRequire(import.meta.url)("../../../../server/leads/lead.js");

const base = {
  kind: "contact",
  lang: "ru",
  subject: "Вопрос",
  message: "Текст",
  consent: { data: true, ads: false },
};

describe("приёмник заявок — защита от ботов", () => {
  it("без времени на странице заявка не принимается", () => {
    expect(parseLead(base).ok).toBe(false);
  });

  it("отправленная сразу после загрузки — бот", () => {
    const parsed = parseLead({ ...base, elapsed: 300 });
    expect(parsed.ok).toBe(true);
    expect(parsed.bot).toBe(true);
  });

  it("заполненная человеком — не бот", () => {
    expect(parseLead({ ...base, elapsed: 20_000 }).bot).toBe(false);
  });
});
