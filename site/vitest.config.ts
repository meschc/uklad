import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Тестируется чистая логика роадмапа (группировка, прогресс, фильтр), а не
 * React: витрина — это разметка поверх одного статического массива, и ошибётся
 * она молча именно в счёте, а не в верстке.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
