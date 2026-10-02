/**
 * Подбор шрифта прямо на живой витрине — панель в углу экрана.
 *
 * Только для разработки: подключается в `main.tsx` под `import.meta.env.DEV`,
 * в сборку и в предрендер не попадает. Ничего в проекте не правит — кладёт в
 * документ один тег `<style>` с `!important` поверх Tailwind. Закрыл вкладку —
 * витрина такая, какой была.
 *
 * Почему вес задан СМЕЩЕНИЕМ, а не одним числом: на странице веса расставлены
 * осмысленно (400 в тексте, 500 в подписях, 550 в заголовках). Один общий вес
 * на все элементы стёр бы эту иерархию и показал не шрифт, а кашу. Смещение
 * двигает всю лестницу целиком и сохраняет разницу между ступенями.
 *
 * Гарнитуры берём ТОЛЬКО те, что стоят в системе, плюс самохостящиеся Geist и
 * Golos Text (второй витрина уже не просит, но файлы лежат — на нём и сравнивали).
 * Google Fonts не подключаем даже здесь: соблазн оставить `<link>` в проде
 * слишком велик, а правило одно — шрифты живут в `public/fonts`.
 *
 * Умолчания панели равны тому, чем набрана витрина сейчас: открытая панель
 * должна показывать текущее состояние, а не чужую отправную точку.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

const STORAGE_KEY = "uklad-font-tuner";

/** Гарнитуры с кириллицей, которые обычно есть на macOS. */
const FONTS = [
  "Geist",
  "Golos Text",
  "system-ui",
  "PT Sans",
  "PT Serif",
  "Georgia",
  "Arial",
  "Helvetica Neue",
  "Verdana",
  "Trebuchet MS",
  "Menlo",
];

/** Ступени веса Tailwind, которые двигает смещение. */
const WEIGHT_STEPS = [
  ["font-normal", 400],
  ["font-medium", 500],
  ["font-heading", 550],
  ["font-semibold", 600],
  ["font-bold", 700],
  ["font-extrabold", 800],
  ["font-black", 900],
] as const;

type Tune = {
  bodyFont: string;
  headFont: string;
  weightShift: number;
  headWeight: number;
  headTracking: number;
  bodyTracking: number;
  bodyLeading: number;
  scale: number;
};

const DEFAULTS: Tune = {
  bodyFont: "Geist",
  headFont: "",
  weightShift: 0,
  headWeight: 550,
  headTracking: -0.02,
  bodyTracking: 0,
  bodyLeading: 1.2,
  scale: 100,
};

function load(): Tune {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Tune>) } : DEFAULTS;
  } catch {
    // Приватное окно или битая запись — начинаем с чистого листа, а не падаем.
    return DEFAULTS;
  }
}

/** Семейство со шрифтовым стеком: подставляем запасные, если гарнитуры нет. */
function stack(name: string): string {
  return `"${name}", ui-sans-serif, system-ui, sans-serif`;
}

function buildCss(t: Tune): string {
  const body = stack(t.bodyFont || DEFAULTS.bodyFont);
  const head = stack(t.headFont || t.bodyFont || DEFAULTS.bodyFont);
  const clamp = (w: number) => Math.min(900, Math.max(100, w));

  const ladder = WEIGHT_STEPS.map(
    ([cls, w]) => `.${cls}{font-weight:${clamp(w + t.weightShift)} !important}`,
  ).join("\n");

  return `
html{font-size:${t.scale}%}
body,.font-sans,.font-display{font-family:${body} !important}
body{letter-spacing:${t.bodyTracking}em;line-height:${t.bodyLeading}}
${ladder}
/* :not(#ft) добавляет вес идентификатора — иначе заголовок остаётся на
   ступени лестницы выше: у класса .font-heading приоритет больше, чем у
   голого h1, и оба правила с !important. */
h1:not(#ft),h2:not(#ft),h3:not(#ft),h4:not(#ft){
  font-family:${head} !important;
  font-weight:${clamp(t.headWeight)} !important;
  letter-spacing:${t.headTracking}em !important;
}
/* Сама панель под настройку не попадает — иначе её не прочитать. */
#font-tuner,#font-tuner *{
  font-family:ui-sans-serif,system-ui,sans-serif !important;
  font-weight:500 !important;
  letter-spacing:0 !important;
  line-height:1.3 !important;
}`;
}

/** Есть ли гарнитура в системе: меряем ширину строки против заведомого фолбэка. */
function isAvailable(name: string): boolean {
  if (!name || name === "system-ui") return true;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return true;
  const probe = "Ёлка складская WQ 123";
  ctx.font = "72px monospace";
  const base = ctx.measureText(probe).width;
  ctx.font = `72px "${name}", monospace`;
  return ctx.measureText(probe).width !== base;
}

export function FontTuner() {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<Tune>(load);

  useEffect(() => {
    const el =
      document.getElementById("font-tuner-css") ??
      document.head.appendChild(
        Object.assign(document.createElement("style"), { id: "font-tuner-css" }),
      );
    el.textContent = buildCss(t);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    } catch {
      // Не сохранилось — не беда, настройка живёт до перезагрузки.
    }
  }, [t]);

  const set = <K extends keyof Tune>(key: K, value: Tune[K]) =>
    setT((prev) => ({ ...prev, [key]: value }));

  if (!open) {
    return (
      <button id="font-tuner" style={S.fab} onClick={() => setOpen(true)} title="Шрифт">
        Аа
      </button>
    );
  }

  const missing = [t.bodyFont, t.headFont].filter((f) => f && !isAvailable(f));

  return (
    <div id="font-tuner" style={S.panel}>
      <div style={S.head}>
        <b>Шрифт</b>
        <button style={S.ghost} onClick={() => setT(DEFAULTS)}>
          Сбросить
        </button>
        <button style={S.ghost} onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>

      <datalist id="ft-fonts">
        {FONTS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <Field label="Гарнитура текста">
        <input
          list="ft-fonts"
          style={S.input}
          value={t.bodyFont}
          onChange={(e) => set("bodyFont", e.target.value)}
        />
      </Field>

      <Field label="Гарнитура заголовков">
        <input
          list="ft-fonts"
          style={S.input}
          placeholder="как у текста"
          value={t.headFont}
          onChange={(e) => set("headFont", e.target.value)}
        />
      </Field>

      <Range
        label="Вес: смещение"
        value={t.weightShift}
        min={-200}
        max={200}
        step={50}
        suffix=""
        onChange={(v) => set("weightShift", v)}
      />
      <Range
        label="Вес заголовков"
        value={t.headWeight}
        min={300}
        max={900}
        step={50}
        suffix=""
        onChange={(v) => set("headWeight", v)}
      />
      <Range
        label="Трекинг заголовков"
        value={t.headTracking}
        min={-0.08}
        max={0.04}
        step={0.005}
        suffix="em"
        onChange={(v) => set("headTracking", v)}
      />
      <Range
        label="Трекинг текста"
        value={t.bodyTracking}
        min={-0.03}
        max={0.06}
        step={0.005}
        suffix="em"
        onChange={(v) => set("bodyTracking", v)}
      />
      <Range
        label="Межстрочный"
        value={t.bodyLeading}
        min={1.2}
        max={1.9}
        step={0.05}
        suffix=""
        onChange={(v) => set("bodyLeading", v)}
      />
      <Range
        label="Масштаб кегля"
        value={t.scale}
        min={80}
        max={125}
        step={1}
        suffix="%"
        onChange={(v) => set("scale", v)}
      />

      {missing.length > 0 && (
        <p style={S.warn}>Нет в системе: {missing.join(", ")} — показан запасной.</p>
      )}

      <button
        style={S.copy}
        onClick={() => void navigator.clipboard?.writeText(JSON.stringify(t, null, 2))}
      >
        Скопировать настройки
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={S.field}>
      <span style={S.label}>{label}</span>
      {children}
    </label>
  );
}

function Range(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step, suffix, onChange } = props;
  return (
    <label style={S.field}>
      <span style={S.label}>
        {label}
        <b style={S.value}>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={S.range}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/**
 * Панель рисуем в пикселях: масштаб кегля не должен её корёжить.
 * Висит справа внизу — слева на лендинге стоит заголовок, а именно его и
 * разглядывают, пока крутят ручки.
 */
const S: Record<string, CSSProperties> = {
  fab: {
    position: "fixed",
    right: 16,
    bottom: 16,
    zIndex: 9999,
    width: 40,
    height: 40,
    borderRadius: 999,
    border: "1px solid rgb(255 255 255 / .2)",
    background: "#16181d",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
  },
  panel: {
    position: "fixed",
    right: 16,
    bottom: 16,
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto",
    zIndex: 9999,
    width: 268,
    padding: 14,
    borderRadius: 14,
    background: "#16181d",
    color: "#e8eaee",
    border: "1px solid rgb(255 255 255 / .12)",
    boxShadow: "0 24px 60px -20px rgb(0 0 0 / .7)",
    fontSize: 12,
  },
  head: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  ghost: {
    marginLeft: "auto",
    padding: "3px 8px",
    borderRadius: 7,
    border: "1px solid rgb(255 255 255 / .16)",
    background: "transparent",
    color: "inherit",
    fontSize: 11,
    cursor: "pointer",
  },
  field: { display: "block", marginBottom: 10 },
  label: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 4,
    fontSize: 11,
    color: "#9aa2b1",
  },
  value: { color: "#e8eaee" },
  input: {
    width: "100%",
    height: 28,
    padding: "0 8px",
    borderRadius: 7,
    border: "1px solid rgb(255 255 255 / .16)",
    background: "#1e2128",
    color: "inherit",
    fontSize: 12,
  },
  range: { width: "100%", accentColor: "#4294ff" },
  warn: { margin: "4px 0 10px", color: "#ffb454", fontSize: 11 },
  copy: {
    width: "100%",
    height: 30,
    borderRadius: 8,
    border: 0,
    background: "#4294ff",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
};
