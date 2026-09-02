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
  // Две страницы, а не одна: витрина и рабочее место — разная аудитория и
  // разный вес. Селлер приходит на `/` за складом, кладовщик открывает `/app/`
  // и тянет туда редактор плана, three.js и всю доменную логику. Один бандл на
  // двоих означал бы, что лендинг грузит редактор ради первого экрана.
  build: {
    rollupOptions: {
      input: {
        site: path.resolve(__dirname, "index.html"),
        app: path.resolve(__dirname, "app/index.html"),
      },
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
