import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    // Закреплён на 5174 (где живёт localStorage реального плана). strictPort —
    // чтобы при занятости порта Vite падал явно, а не «дрейфовал» на другой
    // origin с пустым хранилищем (иначе показался бы демо-сид). См. память.
    port: 5174,
    strictPort: true,
  },
});
