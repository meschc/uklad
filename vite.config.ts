import { defineConfig, type BuildOptions } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Кабинет отдельно — под поддомен app.u-klad.ru (ADR 0008, `npm run build:app`).
 * Один вход и свой каталог, чтобы не затереть сборку витрины. `public/` целиком
 * не копируется: CNAME, robots и фото витрины на поддомене были бы чужими, а
 * нужное кабинету — иконки, шрифты, знаки партнёров — докладывает
 * `scripts/build-app.mjs`.
 */
const CABINET_BUILD: BuildOptions = {
  outDir: "dist-app",
  copyPublicDir: false,
  rollupOptions: {
    input: { app: path.resolve(__dirname, "app/index.html") },
  },
};

export default defineConfig(({ isSsrBuild, mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build:
    mode === "app"
      ? CABINET_BUILD
      : {
          // Две страницы, а не одна: витрина и рабочее место — разная
          // аудитория и разный вес. Селлер приходит на `/` за складом,
          // кладовщик открывает `/app/` и тянет туда редактор плана, three.js
          // и всю доменную логику. Один бандл на двоих означал бы, что лендинг
          // грузит редактор ради первого экрана.
          //
          // У серверной сборки вход один и задаётся флагом `--ssr` — эти два
          // входа ей не нужны и всё сломали бы: Vite попытался бы собрать
          // HTML-страницы как модули Node.
          rollupOptions: isSsrBuild
            ? {}
            : {
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
    // Кабинет с сервером локально: `VITE_API_URL=/api` в `.env.local` и
    // `server/api` на 8080 (`ALLOWED_ORIGIN=http://localhost:5174`).
    proxy: { "/api": "http://localhost:8080" },
  },
}));
