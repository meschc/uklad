/// <reference lib="webworker" />
import { createAsciiField, FPS, type FieldMessage } from "./asciiFieldCore";

/*
 * ASCII-поле первого экрана рисуется здесь, а не в основном потоке: кадр поля
 * больше не делит время с прокруткой и React, поэтому анимация идёт и во
 * время прокрутки, без пауз (Кирилл 31 окт).
 */

let field: ReturnType<typeof createAsciiField> | null = null;
let visible = true;
let still = false;
let last = 0;
let timer = 0;

const tick = () => {
  timer = self.setTimeout(tick, 1000 / FPS);
  if (!field || !visible) return;
  const now = performance.now();
  if (now - last < 1000 / FPS - 4) return;
  last = now;
  field.draw(now);
};

self.onmessage = (e: MessageEvent<FieldMessage>) => {
  const m = e.data;
  if (m.type === "init") {
    const ctx = m.canvas.getContext("2d");
    if (!ctx) return;
    still = m.still;
    field = createAsciiField(ctx, m.canvas, m.font, m.strength);
    field.resize(m);
    field.draw(2400, true);
    if (!still) tick();
  } else if (m.type === "resize" && field) {
    field.resize(m);
    field.draw(last || 2400, true);
  } else if (m.type === "ptr") {
    field?.pointer(m.x, m.y, m.on);
  } else if (m.type === "vis") {
    visible = m.on;
  }
};

self.addEventListener("close", () => self.clearTimeout(timer));
