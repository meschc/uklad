import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Тестовый рантайм отдельно от vite.config.ts: приложение и тесты собираются
 * разными конфигами, чтобы в дев-сервер не протекали тестовые настройки.
 *
 * Окружение — node, без jsdom: тесты покрывают чистую логику (`lib/*.ts`) и
 * срезы стора, а не React. Срез поднимается собственным стендом без persist,
 * поэтому localStorage не нужен вовсе.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Считаем покрытие только по тому, что тестами и закрыто: цифра по всему
      // проекту (в основном React-экраны без тестов) не сказала бы ничего.
      include: ["src/lib/placement.ts", "src/lib/store/requests.slice.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
