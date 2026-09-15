import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Витрина собирается отдельно от приложения: у неё свой package.json и свой
 * dist. Общее у них ровно одно — палитра темы (`src/tokens.css` генерируется
 * из `../src/index.css`), поэтому лендинг нельзя «случайно» утянуть в сборку
 * редактора и наоборот.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    // 5175 — соседний с редактором (5174), чтобы оба поднимались одновременно.
    port: 5175,
    strictPort: true,
  },
});
