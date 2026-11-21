/**
 * Страница правки текстов кабинета и сайта — для Кирилла, на своём Mac.
 *
 *   npm run texts:edit        → http://localhost:5177
 *
 * Кнопка «Сохранить» сразу пишет правки в исходники (сверка — `patch.mjs`):
 * открытый рядом `npm run dev` показывает новый текст без перезапуска.
 * «Отправить на GitHub» кладёт сохранённое в отдельную ветку `texts/…` и
 * даёт ссылку, по которой открывается PR. Сессия Claude для этого не нужна.
 *
 * Сервер слушает только этот компьютер (127.0.0.1), а запись принимает лишь
 * со своим заголовком `X-Texts` — страница другого сайта такой запрос из
 * браузера отправить не сможет.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT, collect } from "./collect.mjs";
import { SHEETS, isNoise } from "./sheet.mjs";
import { applyEdits } from "./patch.mjs";

const PORT = Number(process.env.TEXTS_PORT ?? 5177);
const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "editor.html");
const REPO = "meschc/uklad";

/** Файлы, которые сохранила эта страница, — только они уходят в ветку. */
const saved = new Set();

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

function texts() {
  const { rows } = collect();
  const out = [];
  for (const [sheet, pick] of SHEETS) {
    for (const r of rows) {
      if (!pick(r) || isNoise(r)) continue;
      out.push({
        id: r.id,
        sheet,
        section: r.section,
        code: r.kind === "dict" ? r.id : `${r.file}:${r.ru.line}`,
        kind: r.kind,
        ru: r.ru.text,
        en: r.en?.text ?? null,
        ruOnly: !!r.ruOnly,
      });
    }
  }
  return out;
}

/** Сохранённое — в свою ветку и на GitHub; рабочая копия возвращается, где была. */
function publish() {
  const files = [...saved].filter((f) => git("status", "--porcelain", "--", f));
  if (!files.length) return { error: "Нечего отправлять: сохранённых правок нет." };
  const from = git("rev-parse", "--abbrev-ref", "HEAD");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const branch = `texts/${stamp}`;
  git("switch", "-c", branch);
  try {
    git("commit", "-m", "texts: правка формулировок (страница правки текстов)", "--", ...files);
    git("push", "-u", "origin", branch);
  } catch (e) {
    git("reset", "--soft", from); // правки остаются в файлах, как были до нажатия
    git("switch", from);
    git("branch", "-D", branch);
    console.error(e.stderr || e);
    return { error: "Не получилось отправить на GitHub. Подробности — в окне Терминала." };
  }
  git("switch", from);
  saved.clear();
  return { url: `https://github.com/${REPO}/compare/main...${branch}?expand=1`, branch, files };
}

function body(req) {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(s || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

const send = (res, code, data, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      return send(res, 200, fs.readFileSync(PAGE, "utf8"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/api/texts") {
      return send(res, 200, { rows: texts(), branch: git("rev-parse", "--abbrev-ref", "HEAD") });
    }
    if (req.method === "POST" && req.headers["x-texts"] !== "1") return send(res, 403, {});
    if (req.method === "POST" && req.url === "/api/save") {
      const { items } = await body(req);
      const report = applyEdits(Array.isArray(items) ? items : []);
      report.files.forEach((f) => saved.add(f));
      return send(res, 200, { ...report, rows: texts() });
    }
    if (req.method === "POST" && req.url === "/api/publish") return send(res, 200, publish());
    send(res, 404, {});
  } catch (e) {
    // Подробности — в Терминал, а не в ответ: так их не увидит чужая вкладка.
    console.error(e);
    send(res, 500, { error: "Что-то пошло не так. Подробности — в окне Терминала." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Правка текстов: http://localhost:${PORT}  (остановить — Ctrl+C)`);
});
