import { describe, expect, it } from "vitest";
import { INTEGRATIONS, SECRET_INTEGRATION_FIELDS } from "../integrations";

/**
 * Секретные поля подключений не уходят в снимок кабинета на сервере
 * (`store/serverSync.ts`) — по пометке `secret`. Забытая пометка молча
 * отправила бы пароль маркетплейса в базу открытым текстом.
 */
describe("секреты подключений", () => {
  it("пароль, токен и ключи помечены секретными", () => {
    const looksSecret = /pass|token|secret|key/i;
    // App Key у AliExpress — открытый номер приложения, секрет у него App Secret.
    const publicIds = new Set(["integr.field.appKey"]);
    for (const spec of INTEGRATIONS) {
      for (const field of spec.fields) {
        if (publicIds.has(field.labelKey)) continue;
        if (looksSecret.test(field.id) || looksSecret.test(field.labelKey)) {
          expect(field.secret, `${spec.id}.${field.id} (${field.labelKey})`).toBe(true);
        }
      }
    }
  });

  it("в список для снимка попадают пароль и токен", () => {
    expect(SECRET_INTEGRATION_FIELDS.has("password")).toBe(true);
    expect(SECRET_INTEGRATION_FIELDS.has("token")).toBe(true);
    expect(SECRET_INTEGRATION_FIELDS.has("clientId")).toBe(false);
  });
});
